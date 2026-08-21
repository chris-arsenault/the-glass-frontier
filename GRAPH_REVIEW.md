# Graph and Data Layer: Review and Target Design

Scope: `packages/worldstate`, `packages/dto/src/world`, `worldSchema.json`, and every
read/write path that touches them — `apps/gm-api`, `apps/atlas-api`,
`apps/world-schema-api`, `apps/chronicle-api`, and the client Atlas and wizard UI.

Comparison repos: `../the-canonry`, `../tsonu-canon`, `../the-canonry-game`.

## Design goal

The layer exists to hold one world's canon and serve two callers. Both are machine callers;
neither is interactive.

| Caller | Wants | Frequency |
|---|---|---|
| Ingest — seed importer now, close-time judge later | commit a validated set of entities, relationships, and lore atomically, attributed and reversible | rare, large, machine-authored |
| Context assembly — every GM turn | the best N entities with their lore for this moment, ranked, in one round trip | constant, latency-bound |

The Atlas UI is a reader over materialized canon. It gets no write path, and neither does
anything else: **`commitBatch` is the only writer of canon.** Ingest materializes, the game
reads, the Atlas displays.

That is the model tsonu-canon settled on — canon lives in authored source, the queryable form
is materialized from it, and generated artifacts are never inputs. It has a consequence worth
being explicit about: there is no in-app correction path. Bad canon is fixed by reverting its
batch and re-ingesting a corrected proposal, not by editing a row. The batch identifier is
therefore load-bearing rather than a convenience, and the seed artifact is the human
authoring surface.

The current API serves neither caller. It is per-entity CRUD — `upsertEntity`, `getEntity`,
`listNeighbors`, `listLoreFragmentsByEntity` — and each caller assembles the shape it needs
in application code:

- Ingest has no batch. `upsertRelationship` requires both endpoints to already exist, so a
  set of new entities that reference each other cannot be written without hand-ordering, and
  nothing is atomic above one entity.
- Context assembly loops the CRUD accessors, ~20 round trips per turn (§2), and reimplements
  ranking in TypeScript over data it fetched one row at a time.

So the answer to "patch or rewrite" is rewrite, and the defects listed below are mostly
symptoms. `upsertEntity` destroying inbound edges (§1) is not a coding slip; it is what
happens when full-object upsert is the only write verb. `upsertEdge` losing identity (§11) is
what happens when there is no upsert semantics at all. Both stop existing under the target
API rather than getting fixed.

**Target: two operations.**

1. **`commitBatch(proposal)`** — takes entities, relationships, and lore fragments together,
   including references between items new in the same batch. Validates the whole proposal
   against the vocabulary *before* writing anything and returns every failure at once.
   Commits in one transaction, stamped with `source` and a batch id so it can be reverted
   whole. The only write path: importer now, close-time judge later.
2. **`getContextSlice({ anchorId, focusIds, focusTags, budget })`** — one recursive,
   strength-weighted traversal returning ranked entities with their lore attached. Serves the
   entity selector and the location fragments. The ranking now in `entitySelector.ts` moves
   into it.

Everything else — `upsertEntity`, `upsertRelationship`, `deleteRelationship`, the
`GraphOperations` wrapper — is deleted rather than replaced.

Underneath those:

- **Delete the generic-graph abstraction.** `GraphOperations` is a thin SQL wrapper whose
  "domain-agnostic" promise is used by two domains that bypass it for every real query, and
  `node.props` is written five times and read never (§9). `node` becomes `(id, kind)`
  identity so edges can span entities, characters, and chronicles. Nothing else survives.
- **One vocabulary artifact.** The schema becomes versioned content in a package, loaded at
  boot, used both to derive the DTO validators and to seed the database — instead of a JSON
  file at the repo root seeded inside a migration and shadowed by hand-written Zod enums
  (§3). `world-schema-api` becomes read-only; runtime vocabulary mutation goes away. Ingest
  needs the vocabulary as queryable data anyway, to constrain what a judge may propose.
- **Rename to what things are.** `hard_state` → `entity`, `HardState` → `WorldEntity`. The
  current name asserts a hard-state/lore distinction the table does not encode.
- **One traversal query.** Recursive, depth-bounded, weighted by
  `COALESCE(edge.strength, kind.default_strength)`, replacing the hand-unrolled two-hop CTE
  (§6) and making the `strength` column mean something for the first time (§5).

What does *not* change: the storage model is still a typed property graph in Postgres with
domain tables keyed to node identity, and the vocabulary is still kinds, subkinds, statuses,
prominence, and rule-constrained relationship types. That shape is right and matches where
both comparison repos landed. The rewrite is of the API and the write semantics, not the
data model.

## How the game actually uses the graph

Establishing this first, because it decides which lessons from the other repos apply and
which are irrelevant here.

**The world graph is read-only canon during play.** Every write comes from a moderator
through `atlas-api` (`upsertEntity`, `upsertRelationship`, `deleteRelationship`, fragment
CRUD, all behind `moderatorProcedure`) or `world-schema-api` (vocabulary edits). The GM
engine writes nothing to `hard_state`, `edge`, or `lore_fragment`. `WorldUpdater` touches
only chronicle session state: character, inventory, beats, location.

Five read paths consume the graph:

| Path | Query | What it feeds |
|---|---|---|
| `ChronicleStartWizard` | `listEntities('location')`, then anchors near it | Player picks start location + anchor entity |
| `chronicleFragments.anchorFragment` | `getEntity(anchorId)` + 5 fragments | Anchor block in the GM prompt |
| `entitySelector.buildEntityContext` | anchor + top-3 focus entities + their 1-hop neighbors, scored, top 7 | `entities` block in the GM prompt |
| `chronicleFragments.locationFragment` / `locationDetailFragment` | `getNeighborsGrouped(location, maxHops 2, minProminence recognized)` | `location` + `locationDetail` blocks in the prompt |
| `locationUpdater.findLocationByName` | same 2-hop neighbor set, name match | Resolving where the player just moved |

One write-adjacent path: `EntityJudgeNode` asks the model which offered entities were
`unused | mentioned | central` plus emergent tags, and folds that into
`chronicle.entityFocus` (JSONB on `chronicle`, decayed 0.9/turn). That state drives the
next turn's selection. It never reaches the world graph.

So the graph's job is: **hold authored canon, and answer "what should the GM know right
now" cheaply and well.** Retrieval quality and import fidelity are the whole game.

## What I recommended that the use cases do not support

Retracting three items from the first pass.

**Provenance / lineage as a general mechanism.** I justified it as separating
GM-generated state from imported canon. There is no GM-generated world state — the GM
writes nothing. the-canonry's `ExecutionContext` exists because a simulation mutates its
world every tick; nothing here does. What survives is `source` and `external_key` for
re-import (§4) plus the batch identifier, which the single-writer model needs because
reverting a batch is the only correction path. Not per-mutation lineage.

**Validity intervals on edges.** I argued history was being destroyed. Nothing destroys it:
once the Atlas UI is read-only there is no interactive delete at all, and ingest replaces
whole batches. No read path asks for state at a past time — chronicles have turns, not world
dates, and no prompt fragment renders a historical relationship. tsonu-canon's temporal fold
exists to render a wiki at any year. This project has no such reader. Dropped.

**Rich relationship metadata (symmetry, inverse, polarity, cardinality, verbs).** Mostly
unsupported. Traversal is already bidirectional — `NEIGHBOR_QUERY` matches
`src_id = $1 OR dst_id = $1` — so `adjacent_to` works without being declared symmetric,
and the duplicate `contains` / `contained_within` buckets in `formatLocationNeighbors` are
cosmetic. One piece of it does earn its place, for a different reason than I gave, and it
is §5 below.

**Numeric prominence.** the-canonry made prominence continuous because actions raise it
and `prominence_evolution` decays it against a target distribution. Nothing here moves
prominence at all. Its only uses are `minProminence: 'recognized'` as a neighbor filter
and rank ordering in `listEntities`. Five bands are sufficient. Dropped.

**World event table.** Nothing would read it. Dropped.

## Evidence: what is wrong today

The defects the target design is derived from. Most are symptoms of the API shape above and
disappear with it; the few that are independent are marked. Ordered by what they cost the
running system.

### 1. Saving an entity in the Atlas UI corrupts or breaks its inbound relationships

`WorldAtlasPage.handleSaveEntity` (`WorldAtlasPage.tsx:180`) sends `entity.links` mapped
to `{relationship, strength, targetId}` — **dropping `direction`**, though `HardState.links`
contains both `in` and `out` entries. `atlas-api.upsertEntity` passes them through, and
`WorldEntityPersistence.#syncRelationships` (`worldEntityPersistence.ts:399`) deletes every
world edge touching the entity in both directions:

```sql
DELETE FROM edge WHERE type IN (SELECT id FROM world_relationship_kind)
  AND (src_id = $1::uuid OR dst_id = $1::uuid)
```

then re-inserts each link as `src = entityId, dst = link.targetId`. Every inbound edge is
rewritten as outbound.

Two outcomes, both bad. If the flipped direction happens to be a declared rule, the edge
silently reverses — `governs` becomes governed-by. If it is not,
`#assertRelationshipAllowed` throws and the whole save fails, so a moderator cannot edit
the description of any entity that has an inbound link without a matching reverse rule.

Kept as evidence, not as work. With the Atlas UI read-only there is no caller, and M2 deletes
`upsertEntity` outright. Its value here is diagnostic: full-object upsert cannot know whether
an absent link was never there or was just removed, so it must guess, and the guess is
destructive. That is the argument for `commitBatch` being the only write verb rather than one
verb among several.

### 2. Retrieval is N+1 in three separate places, including the browser

`entitySelector.buildEntityContext` issues one `getEntity` per focus entity, one per
neighbor, and one `listLoreFragmentsByEntity` per candidate — and `getEntity` itself runs a
second query for links (`worldEntityPersistence.ts:243`). A turn offering seven entities
costs roughly twenty round trips inside the GM's latency budget, before any LLM call.

`atlas-api.getEntityNeighbors` and `batchGetEntities` do the same fan-out server-side, and
`WorldAtlasPage.findLinkedEntity` (`WorldAtlasPage.tsx:46`) does it **from the browser** —
one HTTP request per neighbor.

Fix: one store method that takes the anchor, focus ids, and focus tags and returns the
scored, fragment-loaded slice in a single statement. The scoring rules already exist in
`entitySelector.ts` and in `LORE_NARRATION.md`; they belong in SQL, not in a `Promise.all`
over per-entity queries. Add a real batch `listEntities({ ids })` and have the Atlas page
and `getEntityNeighbors` use it.

### 3. Two sources of truth for the vocabulary, and they already contradict each other

`worldSchema.json` (11 kinds, 46 relationship types, 266 rules) seeds the database in
`migrations/004_world.cjs`. `packages/dto/src/world/HardState.ts` re-declares the same
kinds, subkinds, statuses, and prominences as Zod enums. Nothing reconciles them.

The contradiction is live: `world-schema-api` exposes `upsertKind` and
`addRelationshipType` so moderators can extend the vocabulary at runtime, but `atlas-api`
validates entity input against the compile-time enums. A kind added through the moderation
UI can never be used to create an entity. Separately, `LocationEntity` declares
`status: z.string()` and `subkind: z.string()` while `HardState` uses the enums, so the
same field is strict on one path and open on another — which is how `status: 'session-only'`
(§7) exists at all.

`worldSchema.json` also sits at the repo root outside any package, reached from a migration
by `join(__dirname, '../../../worldSchema.json')`, and seeding lives inside the DDL
migration, so changing the vocabulary requires writing a new migration.

Both comparison repos keep one executable schema artifact loaded at boot —
`craft/schema/base.rb` in tsonu-canon, `packages/world-schema` in the-canonry. Do the same:
one module owning the vocabulary, DTO validators derived from it, and an idempotent seed step
outside the migration. Runtime vocabulary editing goes away with the rest of the write
surface, which removes the contradiction rather than resolving it — the vocabulary is repo
content, changed by editing the artifact.

### 4. Imports are not idempotent and carry no attribution

`#reserveSlug` (`worldEntityPersistence.ts:485`) derives a slug from the name and appends a
random UUID fragment on collision. Re-running a seed produces new slugs and duplicate
entities. There is no key an importer can upsert against, and nothing records which source
world an entity came from.

This is the one place the first pass's provenance argument survives, in reduced form. Add
`source` and `external_key`, unique together, both supplied by the seed file — the pair
rather than `external_key` alone because one world receives entities from more than one
source repo. Make the slug collision suffix deterministic (`ashfall_2`) so a slug is stable
across imports. Everything else in the lineage proposal goes.

### 5. `strength` is authored and never read

`edge.strength` has a migration (`009_edge_strength.cjs`), a check constraint, and an index,
and `HardStateLink.strength` is documented as "0.0 (weak/spatial) to 1.0 (strong/narrative)".
No read path uses it. `NEIGHBOR_QUERY` ignores it. `entitySelector.loadNeighbor`
(`entitySelector.ts:86`) gives every neighbor a flat score of 1 regardless. Its only author
today is the Atlas link form, which is going away — so once the UI is read-only, strength
comes from the seed file and from per-type defaults or it does not exist at all.

So the selector treats a defining relationship and an incidental one identically when
choosing what the GM sees — which is exactly the decision strength was added to inform.

This is the piece of relationship metadata worth keeping from the-canonry, and the reason
is retrieval, not rendering: `defaultStrength` per relationship type
(`packages/world-schema/src/frameworkPrimitives.ts`) means an unweighted edge still carries
a sensible prior instead of null. Add `default_strength` to `world_relationship_kind`, use
`COALESCE(edge.strength, kind.default_strength)` in traversal, and weight the selector by it.

### 6. Two-hop traversal is hand-unrolled and cannot be weighted

`NEIGHBOR_QUERY` (`worldEntityPersistence.ts:102`) unrolls hops as `base` and `second`
CTEs, joins `world_prominence` three times, and `listNeighbors` clamps `maxHops` to 2 in
code (`worldEntityPersistence.ts:278`). Three hops needs a query rewrite, and there is
nowhere to accumulate a path cost — which is what §5 needs.

Replace with `WITH RECURSIVE`, a depth bound, and a cost accumulator over effective
strength, returning the best path per neighbor. This is also what makes `locationUpdater`'s
name matching better: a weighted 3-hop reach finds more legitimate destinations before
falling back to §7.

### 7. Locations invented during play fall off the graph permanently

`locationUpdater.applyLocationUpdate` matches the model's destination name against the
current location's 2-hop neighbors. On no match it calls `createSessionLocation`: a random
UUID, `slug: session-${id}`, `status: 'session-only'`, held in chronicle session state and
never written to the graph.

The next turn, `locationFragment` sees `status === 'session-only'` and returns
`neighbors: {}` (`chronicleFragments.ts:167`). `findLocationByName` returns `null` for the
same reason (`locationUpdater.ts:27`). The chronicle is now anchored to a place with no
edges, so the GM gets no world context and there is no path back onto the graph — the
session location is linked to nothing.

Play can wander somewhere the world cannot follow, and the GM spends the rest of the
chronicle with no location context.

Nothing invented during play will be written to the graph — canon is committed at close (see
"Write surface required by the close-time judge"). So the fix here is play-side and stays
off the graph: keep the discovered places and the moves between them in chronicle session
state, and serve the GM its neighbor context from that chain plus the last canon location
the chronicle was anchored to. `chronicle_session_state.location_state` currently holds a
*single* location that `WorldUpdater.#updateLocation` overwrites on every move, so there is
nowhere for that chain to live yet.

### 8. Play-generated tags and authored tags share no vocabulary

`entitySelector` scores candidates by overlap between `chronicle.entityFocus.tagScores` and
the tags on an entity's lore fragments (`entitySelector.ts:69`). Focus tags come from
`EntityJudgeNode`'s free-text `emergentTags` ("2-4 word tags capturing new narrative
themes"), lowercased and accumulated in `entityFocus.ts:56`. Fragment tags are typed by
moderators in a comma-separated box in the Atlas UI.

Nothing constrains the model's tags toward the authored set, so the overlap term is
mostly noise and the score collapses to anchor-plus-focus. Either give the judge the
world's actual tag vocabulary in its prompt and constrain it to that set, or drop the tag
term and score on graph distance and prominence, which are reliable. A controlled tag
vocabulary is what both comparison repos do — tsonu-canon validates tags against a declared
list per world.

### 9. `node.props` is a write-only shadow copy

Five call sites serialize whole records into `node.props` — `worldEntityPersistence.ts:315`,
`worldLorePersistence.ts:82`, `chronicleStore.ts:366`, `chronicleStore.ts:402`,
`chronicleTurnPersistence.ts:219`. Nothing reads it: `GraphOperations.getNode` and
`queryNodesByKind` have zero callers in `apps/` or `packages/`. The entity copy embeds
`links`, so it is stale as soon as any other entity links to it.

Keep `node` as `(id, kind)` identity only, so edges can span entities, characters, and
chronicles with one foreign key. Drop the props column and the two dead methods.

### 10. `related_to` is a legal relationship type

`worldSchema.json` ships `related_to` among its 46 types. Any edge carrying it reaches the GM
prompt as a JSON key in `formatLocationNeighbors` carrying nothing the model can act on, and
it is invisible to weighted traversal because it means nothing to weight.

It matters more once ingest is the only writer: given 46 verbs and no guidance, a judge
proposing canon will reach for the generic one constantly, and it is currently a valid
choice that passes validation. tsonu-canon declares the same verb in a `banned` category
precisely so the validator rejects it by name rather than by silence, and builds an authoring
rule around always using the narrowest verb (`craft/graph-topology.md`). Add a `category`
column to `world_relationship_kind`, mark `related_to` banned, exclude banned types from the
vocabulary handed to ingest, and have batch validation name it in the failure.

### 11. `upsertEdge` discards edge identity and props on every rewrite

`GraphOperations.upsertEdge` (`graphOperations.ts:66`) does DELETE-then-INSERT, generating a
new `edge.id` and dropping `props`. The unique index `edge_src_dst_type_idx` already
exists — use `ON CONFLICT (src_id, dst_id, type) DO UPDATE`.

### 12. Lore fragments have no searchable index

`lore_fragment.tags` has no GIN index, so the tag scoring in §8 is a sequential scan, and
prose has no `tsvector`. `LORE_NARRATION.md` reasonably defers vector search; keyword and
tag search should not wait for it. Add a GIN index on `tags` and a generated `tsvector`
over `title || prose`.

### 13. The per-turn entity record is never written

`chronicle_turn.entity_offered` and `entity_usage` exist with GIN indexes
(`008_entity_tracking.cjs`), are declared on `Turn` (`packages/dto/src/narrative/Turn.ts:42`),
and are populated on the turn object by `gmEngine.ts:346` — but `TURN_INSERT`
(`chronicleTurnPersistence.ts:54`) does not list the two columns. They are always NULL.

Two dead columns and two dead GIN indexes, and the per-turn record of what the GM was shown
and what it actually used is discarded. It is the only durable trace of how selection is
performing, so §2, §5, and §8 have nothing to measure against without it. One-line fix.

### 14. `packages/worldstate/ARCHITECTURE.md` documents an API that does not exist

It describes `LocationStore`, `createLocationStore`, `getLocationDetails`,
`moveCharacterToLocation`, `appendLocationEvents`, `listLocationRoots`, and
`getLocationChain`. The code has `LocationHelpers` with three methods and no location
store. Anything reading it — person or model — writes against an API that is not there.

## Write surface required by the close-time judge

Out of scope for this work, recorded so the schema and store changes do not have to be
redone when it arrives. Canon will be written by an LLM judge at chronicle close, for every
entity kind. Four consequences for the store:

- **Writes arrive as batches.** A judge emits entities plus the relationships among them,
  including edges between two entities both new in the same batch. The store cannot express
  that: `upsertRelationship` requires both endpoints to exist in `hard_state` already
  (`#assertRelationshipAllowed`, `worldEntityPersistence.ts:416`), and the only atomic
  entity-plus-links call is `upsertEntity`, the one that corrupts inbound edges (§1). Needs a
  commit path taking a set of entities and relationships, resolving within-batch references,
  in one transaction.
- **Validation must run before any write**, so a bad proposal is rejected whole with every
  failure named. Validation is currently inline in the write transaction and throws on the
  first failure.
- **Batches must be reversible** — twelve bad entities come out together. This is the entire
  surviving provenance requirement: `source` (§4) plus a batch identifier. Not per-mutation
  lineage.
- **The vocabulary must be readable as data** to constrain proposals: allowed kinds,
  subkinds, statuses, and the legal verbs per `(srcKind, dstKind)` pair from
  `world_relationship_rule`. This is why §3 and §10 are prerequisites rather than cleanup.

Machine-proposed entities should enter at `forgotten` or `marginal` prominence, never higher,
or play inflates the famous-name pool and pollutes the `minProminence: 'recognized'` filter
the prompt itself uses.

The same write surface is what an importer needs, so building it once serves both callers.

## Single world

There is one world. `world_id` scoping is not needed on `node`, `edge`, `hard_state`, or
`lore_fragment`, and the-canonry's project scoping and tsonu-canon's `worlds.yml` do not
transfer. Slug uniqueness stays global, as it is now.

The one consequence for §4: entities imported from more than one source repo land in the
same namespace, so `external_key` alone can collide. Make the import key the pair
`(source, external_key)` — `tsonu` + the Lorecraft entity id, `canonry` + the entity id —
unique together, with `source` also serving as the attribution label. A merged world with
mixed origins is exactly the case that needs the qualified key.

## Not adopted from the comparison repos

the-canonry's simulation engine (ticks, epochs, eras, pressures, generators, distribution
targets, prominence homeostasis) and semantic coordinates. tsonu-canon's Ruby DSL, prose
markers, temporal fold, static-site render pipeline, and review-app mutation boundary.
Those serve world *generation* and *publication*. This project consumes authored canon and
selects from it under latency pressure.

The transferable ideas are narrower and all appear above: one executable schema artifact
(§3), a banned-verb category (§10), per-type default strength for weighting (§5), and a
controlled tag vocabulary (§8).

## Scope

**In:** the graph and data layer, and the per-turn game usage of it. Every finding §1–§14.

**Out:** the close-time canon judge itself — candidate extraction, the judge prompt, dedup
strategy, the review queue, the `chronicle-closer` step. The store requirements it imposes
are in scope and built here ("Write surface required by the close-time judge"), so the
schema and write path do not have to be revised when the judge is built. Nothing in the
plan below writes canon from play.

## Order of work

Four changes, each shippable, ordered so nothing is built twice. The defect numbers show
where each one lands; none of them is fixed as a standalone patch except the stopgap below.

**M1 — Vocabulary as one artifact.** Move the schema into a package as versioned content,
derive the DTO validators from it, seed the database from it outside the migration, make
`world-schema-api` read-only, add `category` and `default_strength` to relationship types,
mark `related_to` banned. Covers §3, §10, and the schema half of §5. Everything else depends
on having one authoritative vocabulary, so this is first even though it changes no
behaviour a player sees.

**M2 — The write surface.** `commitBatch` with within-batch reference resolution,
validate-before-write returning all failures, `source` + `external_key` + batch id,
deterministic slugs. Delete `upsertEntity`, `upsertRelationship`, `deleteRelationship`,
`GraphOperations`, and `node.props`; `node` becomes identity. Rename `hard_state` → `entity`.
Covers §1, §4, §9, §11, and the store requirements of the close-time judge. One data
migration.

Delete the write surface above the store at the same time: `atlas-api`'s `upsertEntity`,
`upsertRelationship`, `deleteRelationship`, `createFragment`, `updateFragment`, and
`deleteFragment`; `world-schema-api`'s `upsertKind`, `addRelationshipType`,
`upsertRelationshipRule`, and `deleteRelationshipRule` (M1 makes the vocabulary repo
content); and the editing UI in `WorldAtlasPage` — link and fragment drafts, save handlers,
and the `moderatorProcedure` guards that only protected them. This is a net deletion in three
apps and the client.

**M3 — The read surface.** `getContextSlice` and the single recursive weighted traversal
behind it; entity selector, location fragments, and Atlas neighbours all move onto it. Lore
tag and prose indexes. Covers §2, §5, §6, §12. This is the change the game feels.

**M4 — Per-turn correctness.** Session-location chain in `chronicle_session_state` with
neighbour context served from it (§7, play-side only — no graph writes), the
`entity_offered` / `entity_usage` insert (§13), and the tag-vocabulary decision (§8).
Rewrite `ARCHITECTURE.md` against the API that now exists (§14).

No stopgap for §1. It only fires on moderator saves, that surface is not a design target, and
M2 deletes the call that causes it.

The seed-file format is designed against M2, not before it.
