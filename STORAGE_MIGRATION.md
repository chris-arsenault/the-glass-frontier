# Storage Layer Migration Plan (v2)

## 1. Context and Problem Statement

- The storage audit highlighted that our list-style operations (`listCharactersByLogin`, `listChroniclesByLogin`, `listChronicleTurns`, `listLocationsByChronicle`) all execute an index query in DynamoDB and then perform an S3 `GetObject` for **every** returned entity. The current implementation in `packages/persistence/src/s3WorldStateStore.ts` and `packages/persistence/src/s3LocationGraphStore.ts` issues one JSON fetch per character/chronicle/turn/location, so the number of S3 requests scales linearly with the number of items (classic N+1 pattern).
- When a user has 20 characters, the UI triggers 1 DynamoDB read + 20 S3 reads. Chronicle turn history is even worse: the code calls `listChronicleTurns` in the index and then walks the resulting pointer list, loading each turn document from S3 sequentially. The location store repeats the same pattern when rendering a chronicle map (1 Dynamo list, then one S3 fetch per node and per edge).
- The audit estimated that this behavior alone contributes ~80% of observed latency during list flows and significantly inflates monthly GET/LIST charges. Fixing the N+1 pattern (including location graph reads) is therefore the driving requirement for the storage v2 effort.

**Goals**
1. Design a persistence interface that exposes pagination-aware list/query methods so callers never need to loop and perform ad-hoc fetches.
2. Redesign our DynamoDB table + S3 object layout so list operations (characters, chronicles, turns, locations) can be served from **one DynamoDB query plus at most one S3 fetch per page**.
3. Extend the same pattern to the location store so chronicle maps, location discovery, and state lookups avoid N+1 queries as well.

**Non-goals (for this migration)**
- Introducing new storage engines beyond DynamoDB and S3.
- Rebuilding caching/Redis strategies (can be layered later once v2 layout exists).
- Solving unrelated audit items (locking, monitoring, etc.) unless they intersect directly with the N+1 remediation work.
- Supporting backward compatibility with the legacy layout (deployment will follow a full data wipe, so we can go straight to v2).

## 2. Proposed Persistence API (WorldStateStore v2)

We will introduce a dedicated interface that reflects how the application actually consumes world state, while making N+1 behavior impossible by construction.

```ts
export interface WorldStateStoreV2 {
  upsertLogin(login: Login): Promise<Login>;
  getLogin(loginId: string): Promise<Login | null>;

  createCharacter(input: CharacterDraft): Promise<Character>;
  getCharacter(characterId: string): Promise<Character | null>;
  listCharacters(loginId: string, page?: PageOptions): Promise<CharacterConnection>;

  createChronicle(input: ChronicleDraft): Promise<Chronicle>;
  getChronicle(chronicleId: string): Promise<Chronicle | null>;
  listChronicles(loginId: string, page?: PageOptions): Promise<ChronicleConnection>;

  appendTurn(chronicleId: string, turn: Turn): Promise<Turn>;
  listChronicleTurns(
    chronicleId: string,
    page?: PageOptions & { chunkSize?: number }
  ): Promise<ChronicleTurnConnection>;

  batchGetChronicleSummaries(ids: string[]): Promise<Map<string, ChronicleSummary>>;

  createLocation(input: LocationDraft): Promise<LocationSummary>;
  getLocation(locationId: string): Promise<LocationGraphSnapshot | null>;
  listLocations(loginId: string, page?: PageOptions): Promise<LocationConnection>;
  listLocationGraph(
    locationId: string,
    page?: PageOptions & { chunkSize?: number }
  ): Promise<LocationGraphChunkConnection>;
  updateLocationState(state: LocationState): Promise<LocationState>;
  listLocationNeighbors(
    locationId: string,
    placeId: string,
    options?: { maxDepth?: number; relationKinds?: LocationEdgeKind[]; limit?: number }
  ): Promise<LocationConnection>;
}

type PageOptions = { limit?: number; cursor?: string };
type Connection<T> = { items: T[]; nextCursor?: string };
type LocationConnection = Connection<LocationSummary>;
type ChronicleConnection = Connection<ChronicleSummary>;
type CharacterConnection = Connection<Character>;
type ChronicleTurnConnection = Connection<Turn>;
type LocationGraphChunkConnection = Connection<LocationGraphChunk>;
```

Key interface choices:
- Every "list" returns a connection object that contains items plus a continuation cursor. Callers never directly interact with raw IDs pulled from Dynamo.
- Character/chronicle list items will include the summary data (name, status, hero art, lastTurnAt) embedded from Dynamo, so there is no subsequent S3 fetch during list rendering.
- Turn listings page over **chunks** instead of single turns, ensuring each page maps to one Dynamo query + one S3 object download.
- Location list/graph operations expose the same chunked reads, so rendering a chronicle's map or adjacency list only touches a single Dynamo partition and a single graph chunk in S3 per page.
- Graph-neighbor ("KNN") lookups call `listLocationNeighbors`, which reads adjacency metadata captured alongside graph chunks so we can return parents/siblings/children-of-siblings with a single targeted query instead of per-node scans.

## 3. Data Model Overview

### 3.1 DynamoDB Table (`WorldStateV2`)

We will keep a single-table design, but introduce dedicated entities that contain the data required by each access pattern. Partition keys encode tenancy, while sort keys encode entity type. All items share the same table and are distinguished by `entityType`.

| Entity | PK | SK | Attributes | Access Pattern |
| --- | --- | --- | --- | --- |
| Login | `TENANT#${loginId}` | `LOGIN` | login metadata, createdAt | `getLogin`, `listLogins` |
| Character Summary | `TENANT#${loginId}` | `CHARACTER#${characterId}` | name, class, portrait, lastPlayedAt, `s3Key` | `listCharacters` |
| Chronicle Summary | `TENANT#${loginId}` | `CHRONICLE#${chronicleId}` | title, status, characterId, `lastTurnPreview`, `turnChunkCount`, `s3Key` | `listChronicles` |
| Chronicle Metadata | `CHRONICLE#${chronicleId}` | `META` | loginId, characterId, locationId, status, `manifestKey` | `getChronicle`, `batchGetChronicleSummaries` |
| Turn Chunk Pointer | `CHRONICLE#${chronicleId}` | `TURN_CHUNK#${chunkIndex}` | `chunkIndex`, `startSeq`, `endSeq`, `chunkKey`, `turnCount`, `updatedAt` | `listChronicleTurns` |
| Location Summary | `TENANT#${loginId}` | `LOCATION#${locationId}` | name, tags, `nodeCount`, `edgeCount`, `graphChunkCount`, `graphManifestKey` | `listLocations` |
| Location Metadata | `LOCATION#${locationId}` | `META` | chronicleId, ownerLoginId, canonical nodes/edges hash | `getLocation`, ACL checks |
| Location Graph Chunk | `LOCATION#${locationId}` | `GRAPH_CHUNK#${chunkIndex}` | `chunkIndex`, `nodeStart`, `nodeCount`, `edgeCount`, `chunkKey`, `updatedAt` | `listLocationGraph` |
| Location State Pointer | `CHARACTER#${characterId}` | `LOCATION_STATE#${locationId}` | `locationId`, `stateKey`, `updatedAt` | character waypoint lookups |
| Location Neighbor Pointer | `PLACE#${placeId}` | `NEIGHBOR#${relationKind}#${neighborPlaceId}` | `neighborPlaceId`, `relationKind`, `depth`, `summaryKey` | `listLocationNeighbors` |

**Secondary Indexes**
- `GSI1`: `PK = CHARACTER#${characterId}`, `SK = TENANT#${loginId}` → resolves login/ownership when fetching a character detail without an upfront login ID.
- `GSI2`: `PK = CHRONICLE#${chronicleId}`, `SK = TENANT#${loginId}` → resolves login for chronicle deletes.
- `GSI3`: `PK = CHARACTER#${characterId}`, `SK = CHRONICLE#${chronicleId}` → optional, allows listing chronicles by character without table scans.
- `GSI4`: `PK = LOCATION#${locationId}`, `SK = PLACE#${placeId}` → lets us fetch the precomputed neighbor pointers for any node within that location without scanning unrelated partitions.

How this eliminates N+1:
- `listCharacters(loginId)` performs a single Query on `TENANT#${loginId}` with `begins_with(SK, 'CHARACTER#')`. The returned items already contain the summary payload rendered in the list, so no follow-up S3 fetch per character.
- `listChronicles(loginId)` uses the same Query pattern and returns a ready-to-render summary, including `lastTurnPreview` pulled from the most recent chunk metadata.
- `listChronicleTurns(chronicleId)` first queries the `CHRONICLE#${chronicleId}` partition for `TURN_CHUNK#` rows covering the requested page. Each row tells us which **chunk** object to download from S3, so a page of 50 turns requires only one S3 fetch.
- `listLocations(loginId)` queries the same tenant partition for `LOCATION#` items and uses the embedded `nodeCount`, `edgeCount`, and `graphManifestKey` fields to render map summaries without round-tripping to S3. Fetching a detailed graph uses the `GRAPH_CHUNK#` items to determine exactly one chunk per page.
- `listLocationNeighbors(locationId, placeId, { maxDepth })` reads the neighbor pointers stored on the `PLACE#${placeId}` partition (optionally filtered by relation kind). Each pointer already carries the summary payload, so finding parents, siblings, or children-of-siblings is a single Dynamo query instead of chasing edges one-by-one through S3.

### 3.2 S3 Layout (`s3://glass-frontier/worldstate/v2/`)

- `logins/{loginId}.json` — canonical login record.
- `characters/{characterId}/full.json` — full character payload (stats, inventory, lore). The Dynamo summary stores `s3Key` pointing here.
- `chronicles/{chronicleId}/meta.json` — canonical chronicle document.
- `chronicles/{chronicleId}/turn-chunks/{chunkIndex}.json` — array containing up to `chunkSize` sequential turns. Each object is capped at ~256 KB to keep GET latency low.
- `chronicles/{chronicleId}/manifest.json` — references chunk count, latest turn sequence, and current status so we can rebuild chunk pointers if Dynamo rows drift.
- `locations/{locationId}/meta.json` — canonical location document (name, tags, canonical graph hash).
- `locations/{locationId}/graph-chunks/{chunkIndex}.json` — adjacency list plus metadata for up to `chunkSize` nodes/edges, sized so each chunk <256 KB.
- `locations/{locationId}/states/{characterId}.json` — serialized `LocationState` for active characters, referenced by the location-state pointer entity in Dynamo.
- `locations/{locationId}/manifest.json` — describes current chunk count and graph checksum for drift detection.

Structure advantages:
- Turn history fetches grab one chunk per page instead of one object per turn.
- Character/chronicle metadata reads hit S3 only when drilling into a detail view; list views operate entirely on Dynamo records.
- Prefixing by entity ID (instead of login) allows us to move ownership between players without rewriting the S3 hierarchy.
- Location graphs download a single chunk to render a portion of the map. Character location state reads come from their dedicated `states/{characterId}.json` object, which is cached and referenced from Dynamo to avoid tenant-wide scans.

## 4. Implementation Plan (Clean Slate Deployment)

Because we will wipe data prior to launch, we can build the new storage layer without any dual-write or backfill gymnastics. The plan focuses on standing up the v2 contract, verifying it in isolation, and switching callers only after the fresh environment is ready.

1. **Infra & schema definition**
   - Update Terraform to provision the `WorldStateV2` Dynamo table (including GSIs for characters, chronicles, locations) and to create the new S3 prefixes (`characters/`, `chronicles/`, `locations/`).
   - Encode TTL / capacity settings up front so the new layout is production-ready on day one.

2. **Persistence package build-out**
   - Implement the `WorldStateStoreV2` and `LocationStoreV2` adapters in `packages/persistence` with helpers for chunk serialization, cursor encoding, and manifest maintenance.
   - Remove the legacy S3 maps/location caches and replace them with streaming readers that respect the new chunking contracts.
   - Build the neighbor-pointer writer so every mutation (add location, add edge, delete edge) updates the `PLACE#${placeId}` adjacency partitions in lockstep with the S3 graph chunks.

3. **Application integration**
   - Update all callers (Chronicle API, client loaders, skill check resolver) to use the new paginated methods for characters, chronicles, turns, and location graphs.
   - Ensure GraphQL/tRPC DTOs include pagination cursors surfaced from the new store so the UI can request additional pages without bespoke logic.

4. **Environment bring-up & verification**
   - After the wipe, deploy the updated services, run seed scripts (if any), and execute smoke tests that cover character creation, chronicle creation, turn append, and location plan execution.
   - Capture baseline metrics for list endpoints to confirm we now see one Dynamo query + one S3 GET per page.

5. **Operational hardening**
   - Add alerts for chunk-manifest mismatch, cursor decode errors, and Dynamo throttling on the new table.
   - Document the expected S3/Dynamo naming scheme so future migrations stay aligned.

## 5. Testing & Validation Plan
- **Unit tests** for the v2 repositories to ensure pagination cursors, chunk calculations, and Dynamo marshaling behave deterministically for characters, chronicles, turns, and location graphs.
- **Integration tests** (LocalStack): character list pagination, chronicle list pagination, turn chunk fetch, location graph chunk fetch, location state read/write.
- **Neighbor traversal tests**: seed a synthetic location graph with branching parents/children, call `listLocationNeighbors` at different depths, and assert we only touch one Dynamo partition per query and return the correct breadth-first ordering.
- **Load test** simulating a login with 100 characters, 25 chronicles, and a 300-node location graph to confirm we perform 1 Dynamo Query + 1 S3 GET per page across all entity types.
- **Cost/latency monitoring**: capture S3 GET count, Dynamo read units, and median latencies immediately after deployment to confirm the N+1 removal. Target is ≥5x reduction in S3 GETs on list flows and ≥3x reduction on location map renders.

## 6. Risks & Mitigations
- **Chunk drift** (turn sequences not aligned with chunk metadata) → mitigated by storing authoritative `manifest.json` in S3 + nightly reconciliation job.
- **Fresh environment drift** (seed scripts or manual inserts skipping manifests) → require seeding tooling to call the same adapters used in production so manifests/chunk pointers stay authoritative.
- **Client pagination gaps** → enforce deterministic sort keys + cursor encoding (base64 of `{pk, sk}`) so restarts resume at the correct chunk boundary.

## 7. Next Steps
1. Finalize Terraform spec for the `WorldStateV2` table and S3 prefixes (characters, chronicles, turns, locations, location states).
2. Scaffold the `WorldStateStoreV2` + `LocationStoreV2` interfaces/types in `packages/persistence` and land the shared chunk/manifest utilities.
3. Update Chronicle API + client loaders to consume the new paginated endpoints (characters, chronicles, turns, locations) and expose cursors to the UI.
4. Expose the `listLocationNeighbors` endpoint to the location delta node and run the new load/integration tests in CI so we have automation that guards against resurrecting N+1 access patterns.

Once these steps are complete, the storage layer will avoid the N+1 query patterns that currently dominate latency and cost, while giving us a clear migration path toward a purpose-built interface optimized for The Glass Frontier's real access patterns.
