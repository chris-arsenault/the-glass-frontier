Skip to content
Chat history

This is a copy of a conversation between ChatGPT & Anonymous.

Report conversation
You said:
Come up with a good data structure/ schema for character location that can be used to feed narrative prompt engine as well as query world data for more fidelity. It should support somewhat arbitrary location hierarchy like 'the boars head tavern in cydonia in the Republic of tron on yavin 2'. 'the cargo hold of the battle cruiser oloiu somewhere on the asteroid belt'. 'lost in a blizzard on the northern hemisphere of an uncharted moon. The setting is magitek scifi located primarily in one solar system with possibilities of alternate dimensions
ChatGPT said:

Thought for 14s
Use a graph-first “Place” model plus a “LocationState” per entity. Graph edges capture containment, docking, adjacency, and frame-of-reference; LocationState captures uncertainty, time, and narrative facets.

Core entities
// Stable IDs (ULID/UUID). Store in Postgres. Use PostGIS for geometry.
// Use an edge table for graph relations. Optionally mirror in Neo4j if desired.

type DimensionID = string;   // e.g. "prime", "fae-veil", "anomaly-Δ7"
type SystemID    = string;   // star system id (mostly one system but keep field)
type PlaceID     = string;
type EntityID    = string;   // character, ship, crate, etc.

type PlaceKind =
  | "system" | "star" | "planet" | "moon" | "asteroid" | "belt" | "station"
  | "city" | "district" | "building" | "room" | "ship" | "ship_compartment"
  | "structure" | "dungeon" | "portal" | "region" | "wilderness" | "biome"
  | "virtual" | "abstract";

type RefFrame = "system_xyz" | "body_geodetic" | "structure_local" | "relative";

interface Place {
  id: PlaceID;
  name: string;                 // "Boar's Head Tavern"
  kind: PlaceKind;
  dimension_id: DimensionID;    // "prime"
  system_id?: SystemID;         // "yavin"
  // Optional canonical parent for fast path-building. Not strictly required in a graph.
  canonical_parent_id?: PlaceID;

  // Coordinates: choose one, per place’s frame.
  ref_frame: RefFrame;
  coords?: {
    // system_xyz: meters in a right-handed system-centered frame
    xyz_m?: { x: number; y: number; z: number };

    // body_geodetic: degrees/meters on a spheroid
    geodetic?: { lat_deg: number; lon_deg: number; alt_m?: number; body_id?: PlaceID };

    // structure_local: meters in local structure frame
    local_m?: { x: number; y: number; z: number; origin_place_id: PlaceID };
  };

  // Shape for spatial queries and containment. Use PostGIS geometry/geography.
  geom_wkt?: string;            // POLYGON/POINT/etc

  // World-state facets useful for narrative prompts and filtering
  tags?: string[];              // ["tavern","public","boisterous","pirate-friendly"]
  properties?: Record<string, unknown>; // arbitrary: gravity, atmosphere, law, faction, magic_flux

  // Optional short flavor string for prompt path rendering
  epithet?: string;             // "smoky tavern tucked under red sandstone arches"
  // Versioning
  valid_from?: string;          // ISO time
  valid_to?: string | null;
}

type EdgeKind =
  | "CONTAINS"        // parent->child
  | "ADJACENT_TO"
  | "DOCKED_TO"
  | "ORBITS"
  | "ANCHORED_IN"
  | "LINKS_TO"        // portals/alternates
  | "ALIAS_OF";       // synonyms and local names

interface PlaceEdge {
  src: PlaceID;
  dst: PlaceID;
  kind: EdgeKind;
  // Optional constraints or transforms (e.g., docking port transform matrix)
  meta?: Record<string, unknown>;
  valid_from?: string;
  valid_to?: string | null;
}
Where a character “is”
type LocCertainty = "exact" | "bounded" | "candidate_set" | "unknown";

interface LocationState {
  entity_id: EntityID;         // the character
  dimension_id: DimensionID;   // active dimension
  system_id?: SystemID;

  // Primary best-known anchor in the place graph
  anchor_place_id?: PlaceID;   // e.g., cargo hold place id

  certainty: LocCertainty;

  // Express uncertainty
  // 1) numeric radius around coords or around anchor’s geom
  radius_m?: number;           // e.g., “somewhere in the belt” -> huge radius

  // 2) candidate places with probabilities
  candidates?: Array<{ place_id: PlaceID; p: number }>;

  // 3) direct coordinates in a chosen frame, if no place anchor is known
  ref_frame?: RefFrame;
  coords?: Place["coords"];

  // Narrative state flags
  status?: string[];           // ["lost","blizzard","injured"]
  conditions?: Record<string, unknown>; // { visibility: "whiteout", temp_c: -30 }

  // For prompt building: renderable breadcrumb and focus
  prompt_path_override?: string;    // if you want to force custom prose
  focal_place_id?: PlaceID;         // the room/compartment of most interest

  observed_at: string;         // ISO time
  source: "player" | "sensor" | "gm" | "inferred";
  note?: string;
}
Prompt payload (what the narrative engine consumes)
Keep it small, pre-chewed, and deterministic.

interface PromptLocationSlice {
  breadcrumb: string;      // "Boar's Head Tavern → Cydonia → Republic of Tron → Yavin II"
  short_context: string;   // "smoky tavern; pirate-friendly; low law; high magic flux"
  dimension: string;       // "prime"
  system: string;          // "yavin"
  focus_name: string;      // "Boar's Head Tavern, common room"
  status: string[];        // ["lost","blizzard"]
  uncertainty?: string;    // "bounded radius 5000 m" or "candidates: cargo hold (0.7), engine room (0.3)"
}
Build breadcrumb by walking CONTAINS and stopping at system or dimension. Pull tags/properties from the chain to form short_context.

Examples
1) “the boars head tavern in cydonia in the Republic of tron on yavin 2”
{
  "places": [
    { "id": "yavin-2", "name": "Yavin II", "kind": "planet", "dimension_id": "prime", "system_id": "yavin", "ref_frame": "body_geodetic", "tags": ["temperate"], "epithet": "jade moon bathed in red starlight" },
    { "id": "rep-tron", "name": "Republic of Tron", "kind": "region", "dimension_id": "prime", "system_id": "yavin", "canonical_parent_id": "yavin-2", "ref_frame": "body_geodetic", "tags": ["nation","bureaucratic"] },
    { "id": "cydonia", "name": "Cydonia", "kind": "city", "dimension_id": "prime", "system_id": "yavin", "canonical_parent_id": "rep-tron", "ref_frame": "body_geodetic", "tags": ["trade-hub"] },
    { "id": "boars-head", "name": "Boar's Head Tavern", "kind": "building", "dimension_id": "prime", "system_id": "yavin", "canonical_parent_id": "cydonia", "ref_frame": "structure_local", "tags": ["tavern","public","boisterous"], "epithet": "smoky tavern tucked under red sandstone arches" }
  ],
  "edges": [
    { "src": "yavin-2", "dst": "rep-tron", "kind": "CONTAINS" },
    { "src": "rep-tron", "dst": "cydonia", "kind": "CONTAINS" },
    { "src": "cydonia",  "dst": "boars-head", "kind": "CONTAINS" }
  ],
  "location_state": {
    "entity_id": "char-a",
    "dimension_id": "prime",
    "system_id": "yavin",
    "anchor_place_id": "boars-head",
    "certainty": "exact",
    "observed_at": "2025-11-10T08:00:00Z",
    "source": "gm"
  }
}
Prompt slice render:

breadcrumb: Boar's Head Tavern → Cydonia → Republic of Tron → Yavin II
short_context: smoky tavern; trade-hub; bureaucratic nation; temperate world
2) “the cargo hold of the battle cruiser Oloiu somewhere on the asteroid belt”
{
  "places": [
    { "id": "belt", "name": "Main Asteroid Belt", "kind": "belt", "dimension_id": "prime", "system_id": "yavin", "ref_frame": "system_xyz", "tags": ["hazard:debris","low-law"] },
    { "id": "oloiu", "name": "BCV Oloiu", "kind": "ship", "dimension_id": "prime", "system_id": "yavin", "ref_frame": "system_xyz", "tags": ["military","capital-ship"] },
    { "id": "oloiu-cargo", "name": "Cargo Hold", "kind": "ship_compartment", "dimension_id": "prime", "system_id": "yavin", "canonical_parent_id": "oloiu", "ref_frame": "structure_local", "tags": ["cargo","restricted"] }
  ],
  "edges": [
    { "src": "belt", "dst": "oloiu", "kind": "ANCHORED_IN" },
    { "src": "oloiu", "dst": "oloiu-cargo", "kind": "CONTAINS" }
  ],
  "location_state": {
    "entity_id": "char-b",
    "dimension_id": "prime",
    "system_id": "yavin",
    "anchor_place_id": "oloiu-cargo",
    "certainty": "bounded",
    "radius_m": 20000,
    "observed_at": "2025-11-10T08:00:00Z",
    "source": "sensor",
    "note": "ship transponder jitter in belt clutter"
  }
}
Prompt slice:

breadcrumb: Cargo Hold → BCV Oloiu → Main Asteroid Belt
uncertainty: bounded radius 20000 m
short_context: military capital-ship; debris hazard; low law
3) “lost in a blizzard on the northern hemisphere of an uncharted moon”
{
  "places": [
    { "id": "uncharted-moon", "name": "Uncharted Moon", "kind": "moon", "dimension_id": "prime", "system_id": "yavin", "ref_frame": "body_geodetic", "tags": ["unknown","hostile-weather"], "epithet": "airless slate under a dim sun" },
    { "id": "north-hem", "name": "Northern Hemisphere", "kind": "region", "dimension_id": "prime", "system_id": "yavin", "canonical_parent_id": "uncharted-moon", "ref_frame": "body_geodetic" }
  ],
  "edges": [
    { "src": "uncharted-moon", "dst": "north-hem", "kind": "CONTAINS" }
  ],
  "location_state": {
    "entity_id": "char-c",
    "dimension_id": "prime",
    "system_id": "yavin",
    "anchor_place_id": "north-hem",
    "certainty": "candidate_set",
    "candidates": [
      { "place_id": "north-hem", "p": 0.6 }
    ],
    "status": ["lost","blizzard"],
    "conditions": { "visibility": "whiteout", "temp_c": -30 },
    "observed_at": "2025-11-10T08:00:00Z",
    "source": "player"
  }
}
Prompt slice:

breadcrumb: Northern Hemisphere → Uncharted Moon
status: lost, blizzard
short_context: hostile-weather; unknown
4) Alternate dimensions and portals
Add a portal between equivalents across dimensions:

{
  "edges": [
    { "src": "boars-head", "dst": "boars-head-fae", "kind": "LINKS_TO", "meta": { "gate": "cellar-arch", "cooldown_s": 3600 } }
  ]
}
Storage layout (Postgres)
places(id pk, name, kind, dimension_id, system_id, canonical_parent_id, ref_frame, coords_xyz, coords_geodetic, coords_local, geom geography/geometry, tags text[], properties jsonb, epithet text, valid_from tstz, valid_to tstz)

place_edges(src fk, dst fk, kind, meta jsonb, valid_from tstz, valid_to tstz)

location_states(entity_id, observed_at tstz, dimension_id, system_id, anchor_place_id, certainty, radius_m, candidates jsonb, ref_frame, coords jsonb, status text[], conditions jsonb, prompt_path_override text, focal_place_id)

Indexes: GIN(tags), GIN(properties), GIST(geom), btree(kind), btree(canonical_parent_id), btree(dimension_id), composite (entity_id, observed_at desc).

Optional: ltree materialized path for fast breadcrumbs:

places.path ltree mirrored from canonical containment.

Query patterns
Prompt breadcrumb:

WITH RECURSIVE chain AS (
  SELECT p.*, 0 AS depth FROM places p WHERE p.id = $1
  UNION ALL
  SELECT parent.*, depth + 1
  FROM places parent
  JOIN chain c ON parent.id = c.canonical_parent_id
)
SELECT name, kind, tags, properties FROM chain ORDER BY depth;
“All taverns in Cydonia within 500 m of X,Y on Yavin II”:

SELECT p.*
FROM places p
JOIN places city ON city.id = 'cydonia'
JOIN place_edges e ON e.src = city.id AND e.dst = p.id AND e.kind = 'CONTAINS'
WHERE p.kind = 'building'
  AND 'tavern' = ANY(p.tags)
  AND ST_DWithin(p.geom, ST_SetSRID(ST_MakePoint(:lon,:lat),4326)::geography, 500);
“Where could the character be?”:

SELECT ls.*, p.name
FROM location_states ls
LEFT JOIN places p ON p.id = ls.anchor_place_id
WHERE entity_id = :char
ORDER BY observed_at DESC
LIMIT 1;
Prompt assembly rules
Resolve latest LocationState for the entity.

If prompt_path_override present, use it.

Else, walk canonical parents from focal_place_id || anchor_place_id up to planet/system/dimension and join names with →.

Build short_context from tags and selected properties across the chain, deduped and prioritized.

Render uncertainty:

bounded → “radius N m around {anchor}”

candidate_set → list top 2 with probabilities

unknown → “location unknown in {system/dimension}”

Append status and salient conditions.

Why this works
Arbitrary hierarchy via graph edges, but fast canonical breadcrumb via canonical_parent_id or ltree.

Precise, fuzzy, or multi-hypothesis locations through certainty, radius_m, and candidates.

Multi-frames allow system-scale, planetary, or structure-local coordinates.

Dimensions are first-class. Portals link equivalents.

Clean prompt slice prevents prompt bloat while keeping fidelity for world queries.

If you want, I’ll produce Zod schemas matching these types and a couple of helper functions: formatPromptLocationSlice(entityId), upsertPlace(), setLocationState().

You said:
I want to build this dynamical based on a characters actions. I'm not concerned with the gis features yet, maybe in a future release. Just nodes tags and relationships. 
If a characters actions result in a change in location I want to defect that and add a new node. Normally at the lowest level possible e.g leaving the tavern to the blacksmith wouldn't result in a change in planet. 

Create me a prompt that takes in player intent and gm response and determines what if any location updates are needed. 

Then create me some helper functions and interface for processing them
ChatGPT said:

Thought for 13s
Use an LLM “Location Delta Planner.” Input: prior location state, local place graph, player intent, and GM response. Output: a small JSON patch that adds nodes/edges only when needed and updates the character’s anchor at the lowest sensible level.

Prompt (drop-in template)
You are the Location Delta Planner. Decide whether a character’s location should change based on the player intent and GM response. 
Return ONLY valid JSON matching the provided schema. Do not include prose.

## World model (no GIS)
- Places are nodes with: {id, name, kind, tags[]}.
- Relationships are edges: 
  - CONTAINS (parent→child), 
  - ADJACENT_TO (peer navigation), 
  - DOCKED_TO (ships/ports), 
  - LINKS_TO (portals/alt-dim).
- The character "is" at an anchor_place_id.
- Prefer lowest-level movement. Do not escalate hierarchy (city→planet) unless explicitly implied or required by the GM outcome.

## Inputs
- character_id: string
- prior_location: { anchor_place_id, dimension_id, certainty }  // may be null
- known_places: [{ id, name, kind, tags }]
- known_edges:  [{ src, dst, kind }]
- player_intent: free text
- gm_response:  free text

## Decision rules
1) If GM response confirms staying within the same place, output NO_CHANGE.
2) If movement occurs within the same parent scope, output MOVE with `dst_place_id`. If the destination is unnamed in the graph but clearly defined, propose CREATE_PLACE and a CONTAINS or ADJACENT_TO edge, then MOVE there.
3) When an exit/enter pair is described, use EXIT then ENTER or a single MOVE if both endpoints are known.
4) If travel implies a new child place “inside” a known container (e.g., “back room of the tavern”), CREATE_PLACE and CONTAINS(tavern→back-room), then MOVE.
5) If travel implies a peer place within the same parent (e.g., “tavern → blacksmith” in the same city), ensure both children exist under that parent. If missing, CREATE_PLACE then ADJACENT_TO between peers. Then MOVE.
6) If the GM implies a larger-scale move (city→moon, system change, dimension jump, ship boarding), emit the minimal set of CREATE_PLACE and linking edges needed (e.g., DOCKED_TO, ORBITS not required in this simplified model) and MOVE. Only escalate scope if unambiguous.
7) If the GM indicates uncertainty (“somewhere in the belt,” “lost in blizzard”), keep anchor at the nearest known container and set certainty to "bounded" or "unknown" with a note.
8) Never rename or delete places. Only add.
9) Keep patches small and ordered for application.

## Output schema
{
  "character_id": string,
  "ops": [
    // zero or more of:
    { "op": "NO_CHANGE" },
    { "op": "CREATE_PLACE", "place": { "temp_id": string, "name": string, "kind": string, "tags": string[] } },
    { "op": "CREATE_EDGE",  "edge": { "src": string, "dst": string, "kind": "CONTAINS"|"ADJACENT_TO"|"DOCKED_TO"|"LINKS_TO" } },
    { "op": "MOVE",         "dst_place_id": string },                 // id or temp_id
    { "op": "ENTER",        "dst_place_id": string },                 // optional alternative to MOVE
    { "op": "EXIT",         "src_place_id": string },                 // optional
    { "op": "SET_STATUS",   "status": string[] },                     // e.g., ["lost","blizzard"]
    { "op": "SET_CERTAINTY","certainty": "exact"|"bounded"|"unknown","note": string }
  ],
  "notes": string           // brief rationale for debugging
}

## Examples

### A) Tavern → Blacksmith in same city
player_intent: "I leave the Boar's Head and go to the blacksmith."
gm_response:   "You step into the soot-streaked smithy across the square."
prior_location.anchor_place_id = "boars-head"
known: city "cydonia" contains "boars-head", but no "iron-anvil"

→
{
  "character_id": "char-1",
  "ops": [
    { "op": "CREATE_PLACE", "place": { "temp_id": "p:blacksmith", "name": "Iron Anvil Smithy", "kind": "building", "tags": ["blacksmith"] } },
    { "op": "CREATE_EDGE",  "edge":  { "src": "cydonia", "dst": "p:blacksmith", "kind": "CONTAINS" } },
    { "op": "CREATE_EDGE",  "edge":  { "src": "boars-head", "dst": "p:blacksmith", "kind": "ADJACENT_TO" } },
    { "op": "MOVE", "dst_place_id": "p:blacksmith" }
  ],
  "notes": "Peer move within Cydonia; created smithy."
}

### B) Cargo hold → Engine room on same ship
intent: "Head to engineering."
gm:     "You badge through to the humming engine room."
prior:  anchor_place_id="oloiu-cargo"
known:  ship "oloiu" but no "engine-room"

→
{
  "character_id": "char-2",
  "ops": [
    { "op": "CREATE_PLACE", "place": { "temp_id": "p:engine", "name": "Engineering", "kind": "ship_compartment", "tags": ["restricted","machinery"] } },
    { "op": "CREATE_EDGE",  "edge":  { "src": "oloiu", "dst": "p:engine", "kind": "CONTAINS" } },
    { "op": "ADJACENT_TO" } // not needed if containment suffices; omit
    ,
    { "op": "MOVE", "dst_place_id": "p:engine" }
  ],
  "notes": "Intra-ship compartment move."
}

### C) Lost in a blizzard on an unknown moon
intent: "I keep moving north, blinded by snow."
gm:     "Whiteout. You’re somewhere in the northern wastes."
prior:  anchor_place_id="uncharted-moon"
known:  "uncharted-moon" exists; “northern-wastes” missing.

→
{
  "character_id": "char-3",
  "ops": [
    { "op": "CREATE_PLACE", "place": { "temp_id": "p:north", "name": "Northern Wastes", "kind": "region", "tags": ["wilderness","blizzard"] } },
    { "op": "CREATE_EDGE",  "edge":  { "src": "uncharted-moon", "dst": "p:north", "kind": "CONTAINS" } },
    { "op": "MOVE", "dst_place_id": "p:north" },
    { "op": "SET_STATUS", "status": ["lost","blizzard"] },
    { "op": "SET_CERTAINTY", "certainty": "bounded", "note": "Exact coordinates unclear." }
  ],
  "notes": "Scoped to moon; region created."
}
TypeScript interfaces and helpers
// Core nodes and edges
export type PlaceID = string;
export type EdgeKind = "CONTAINS" | "ADJACENT_TO" | "DOCKED_TO" | "LINKS_TO";

export interface Place {
  id: PlaceID;
  name: string;
  kind: string;           // keep open set
  tags: string[];
}

export interface Edge {
  src: PlaceID;
  dst: PlaceID;
  kind: EdgeKind;
}

// Character state (minimal)
export type Certainty = "exact" | "bounded" | "unknown";

export interface LocationState {
  character_id: string;
  anchor_place_id: PlaceID | null;
  certainty: Certainty;
  status: string[];       // ["lost","blizzard"]
}

// Planner output
export type Op =
  | { op: "NO_CHANGE" }
  | { op: "CREATE_PLACE"; place: { temp_id: string; name: string; kind: string; tags: string[] } }
  | { op: "CREATE_EDGE";  edge: { src: PlaceID; dst: PlaceID | string; kind: EdgeKind } }
  | { op: "MOVE";         dst_place_id: PlaceID | string }
  | { op: "ENTER";        dst_place_id: PlaceID | string }
  | { op: "EXIT";         src_place_id: PlaceID }
  | { op: "SET_STATUS";   status: string[] }
  | { op: "SET_CERTAINTY"; certainty: Certainty; note?: string };

export interface Plan {
  character_id: string;
  ops: Op[];
  notes?: string;
}

// In-memory graph
export interface Graph {
  places: Map<PlaceID, Place>;
  edges: Set<string>;   // key `${src}|${kind}|${dst}`
}

// Utility: stable key
const edgeKey = (e: {src: string; kind: EdgeKind; dst: string}) => `${e.src}|${e.kind}|${e.dst}`;

// Apply a plan to the graph and character state
export interface ApplyResult {
  graph: Graph;
  state: LocationState;
  tempToRealId: Record<string, PlaceID>;
  created: PlaceID[];
  createdEdges: number;
}

export function applyLocationPlan(
  plan: Plan,
  graph: Graph,
  state: LocationState,
  idAllocator: (tempId: string) => PlaceID
): ApplyResult {
  const tempToReal: Record<string, PlaceID> = {};
  const created: PlaceID[] = [];
  let createdEdges = 0;
  let newState: LocationState = { ...state };

  for (const op of plan.ops) {
    switch (op.op) {
      case "NO_CHANGE":
        break;

      case "CREATE_PLACE": {
        const realId = idAllocator(op.place.temp_id);
        tempToReal[op.place.temp_id] = realId;
        if (!graph.places.has(realId)) {
          graph.places.set(realId, {
            id: realId,
            name: op.place.name,
            kind: op.place.kind,
            tags: op.place.tags ?? [],
          });
          created.push(realId);
        }
        break;
      }

      case "CREATE_EDGE": {
        const src = resolveId(op.edge.src, tempToReal);
        const dst = resolveId(op.edge.dst as string, tempToReal);
        const key = edgeKey({ src, kind: op.edge.kind, dst });
        if (!graph.edges.has(key)) {
          graph.edges.add(key);
          createdEdges++;
        }
        break;
      }

      case "MOVE":
      case "ENTER": {
        const dst = resolveId(op.dst_place_id as string, tempToReal);
        newState = {
          ...newState,
          anchor_place_id: dst,
          certainty: newState.certainty ?? "exact",
        };
        break;
      }

      case "EXIT": {
        if (newState.anchor_place_id === op.src_place_id) {
          newState = { ...newState, anchor_place_id: null };
        }
        break;
      }

      case "SET_STATUS": {
        newState = { ...newState, status: dedupe([...newState.status, ...op.status]) };
        break;
      }

      case "SET_CERTAINTY": {
        newState = { ...newState, certainty: op.certainty };
        break;
      }
    }
  }

  return { graph, state: newState, tempToRealId: tempToReal, created, createdEdges };
}

function resolveId(idOrTemp: string, map: Record<string, string>): string {
  return map[idOrTemp] ?? idOrTemp;
}

function dedupe<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

// Lookup helpers
export function findPlaceByName(graph: Graph, name: string): Place | undefined {
  for (const p of graph.places.values()) if (p.name.toLowerCase() === name.toLowerCase()) return p;
  return undefined;
}

export function ensureEdge(graph: Graph, src: PlaceID, kind: EdgeKind, dst: PlaceID): void {
  graph.edges.add(edgeKey({ src, kind, dst }));
}

// Minimal convenience for building a graph
export function makeEmptyGraph(): Graph {
  return { places: new Map(), edges: new Set() };
}
Thin wrapper to run the LLM and apply
export interface PlannerInputs {
  character_id: string;
  prior_location: Partial<LocationState> | null;
  known_places: Place[];
  known_edges: Edge[];
  player_intent: string;
  gm_response: string;
}

export async function planAndApply(
  runPlanner: (prompt: string) => Promise<Plan>,   // your LLM call
  promptTemplate: (inputs: PlannerInputs) => string,
  inputs: PlannerInputs,
  graph: Graph,
  state: LocationState,
  idAllocator: (tempId: string) => PlaceID,
): Promise<ApplyResult> {
  const prompt = promptTemplate(inputs);
  const plan = await runPlanner(prompt);
  return applyLocationPlan(plan, graph, state, idAllocator);
}
Minimal promptTemplate(inputs)
export function promptTemplate(i: PlannerInputs): string {
  return JSON.stringify({
    system: "Location Delta Planner v1",
    character_id: i.character_id,
    prior_location: i.prior_location,
    known_places: i.known_places,
    known_edges: i.known_edges,
    player_intent: i.player_intent,
    gm_response: i.gm_response,
    schema_hint: "Return Plan JSON per schema in the system prompt."
  });
}
This gives you: a strict prompt with examples, a discriminated-union patch model, and helpers to merge planner output into your node/edge store while keeping changes scoped to the smallest place that makes sense.

You said:
This seems kind a very complex prompt to adhear to every time. Would it be more reliable to just have the prompt emit the new location and compute everything else
ChatGPT said:

Thought for 11s
Yes. Make the LLM pick a single “new anchor” and a few hints. Compute graph ops locally. This is more reliable and easier to validate.

Minimal planner output
The model returns one small object. You do the rest.

// What the LLM returns
export type SimpleDecision =
  | {
      action: "no_change";
      reason?: string;
    }
  | {
      action: "move";
      // If the target exists, provide id. Otherwise name+kind(+tags) and a placement hint.
      dst: { id?: string; name?: string; kind?: string; tags?: string[] };
      // How to place the dst if missing. Exactly one of:
      placement:
        | { mode: "same_place" }                               // same anchor; only status/certainty change
        | { mode: "child_of_anchor" }                          // e.g., “back room”
        | { mode: "peer_in_parent" }                           // e.g., “blacksmith across the square”
        | { mode: "child_of"; parent_id: string }              // explicit parent place
        | { mode: "linked_via"; src_id: string; link: "DOCKED_TO"|"LINKS_TO" } // ship/portal hop
        | { mode: "system_or_higher" };                        // explicit large-scale move (rare)
      status?: string[];                                       // e.g., ["lost","blizzard"]
      certainty?: "exact"|"bounded"|"unknown";
      note?: string;
    }
  | {
      action: "uncertain";                                     // GM implies search or ambiguous move
      scope_anchor_id?: string;                                // keep within this container
      status?: string[];
      certainty: "bounded"|"unknown";
      note?: string;
    };
Tiny prompt
Give the model only what it needs and force the schema.

You decide if a character’s anchor location changes. Output ONLY JSON that matches the SimpleDecision schema below.

Rules:
- Prefer the lowest-level movement. Do not escalate to city/planet unless the GM makes it explicit.
- If moving to a known place, return action:"move" with dst.id.
- If moving to an unknown but clear place, return action:"move" with dst.name, dst.kind, optional tags, and a placement hint.
- If remaining in the same place, return action:"no_change".
- If movement is ambiguous, return action:"uncertain" with certainty and optional scope_anchor_id.

Inputs:
- character_id: <id>
- prior_anchor: { id, name, kind }
- parent_of_prior: { id, name } // null if none
- known_places: [{ id, name, kind, tags }]
- known_edges: [{ src, dst, kind }] // CONTAINS, ADJACENT_TO, DOCKED_TO, LINKS_TO
- player_intent: "<text>"
- gm_response: "<text>"

SimpleDecision schema:
{
  "action": "no_change" |
            "move" |
            "uncertain",
  // move:
  "dst": { "id"?: string, "name"?: string, "kind"?: string, "tags"?: string[] },
  "placement": { "mode": "same_place" |
                         "child_of_anchor" |
                         "peer_in_parent" |
                         "child_of",
                 "parent_id"?: string } |
               { "mode": "linked_via", "src_id": string, "link": "DOCKED_TO"|"LINKS_TO" } |
               { "mode": "system_or_higher" },
  "status"?: string[],
  "certainty"?: "exact"|"bounded"|"unknown",
  "note"?: string,
  // uncertain:
  "scope_anchor_id"?: string
}

Return only JSON.
Examples the model sees (brief)
Tavern → blacksmith in same city:

{"action":"move","dst":{"name":"Iron Anvil","kind":"building","tags":["blacksmith"]},"placement":{"mode":"peer_in_parent"}}
“Back room of the tavern”:

{"action":"move","dst":{"name":"Back Room","kind":"room","tags":["private"]},"placement":{"mode":"child_of_anchor"}}
Portal in cellar:

{"action":"move","dst":{"name":"Fae Vestibule","kind":"structure","tags":["portal-side"]},"placement":{"mode":"linked_via","src_id":"boars-head","link":"LINKS_TO"}}
Whiteout drift but same moon:

{"action":"uncertain","scope_anchor_id":"uncharted-moon","status":["lost","blizzard"],"certainty":"bounded"}
Local computation: produce graph ops from SimpleDecision
// Core graph
export type PlaceID = string;
export type EdgeKind = "CONTAINS" | "ADJACENT_TO" | "DOCKED_TO" | "LINKS_TO";

export interface Place { id: PlaceID; name: string; kind: string; tags: string[]; }
export interface Edge  { src: PlaceID; dst: PlaceID; kind: EdgeKind; }

export interface Graph {
  places: Map<PlaceID, Place>;
  edges: Set<string>; // `${src}|${kind}|${dst}`
}

const ek = (e: Edge) => `${e.src}|${e.kind}|${e.dst}`;

// Character state
export interface LocationState {
  character_id: string;
  anchor_place_id: PlaceID | null;
  certainty: "exact"|"bounded"|"unknown";
  status: string[];
}

// LLM output
export type SimpleDecision = /* as defined above */ any;

// Patch ops you apply (same as before, trimmed)
export type Op =
  | { op: "NO_CHANGE" }
  | { op: "CREATE_PLACE"; place: Place }
  | { op: "CREATE_EDGE";  edge: Edge }
  | { op: "MOVE";         dst_place_id: PlaceID }
  | { op: "SET_STATUS";   status: string[] }
  | { op: "SET_CERTAINTY"; certainty: "exact"|"bounded"|"unknown"; note?: string };

export interface Plan { character_id: string; ops: Op[]; notes?: string; }

// ---------- helpers ----------
export function ensurePlaceByName(
  graph: Graph,
  name: string,
  kind: string,
  tags: string[],
  idAlloc: (seed: string) => PlaceID
): Place {
  for (const p of graph.places.values()) if (eq(name, p.name) && p.kind === kind) return p;
  const id = idAlloc(slug(`${kind}:${name}`));
  const place: Place = { id, name, kind, tags };
  graph.places.set(id, place);
  return place;
}

export function ensureEdge(graph: Graph, src: PlaceID, kind: EdgeKind, dst: PlaceID): void {
  graph.edges.add(ek({ src, kind, dst }));
}

export function getParentOf(
  graph: Graph,
  childId: PlaceID
): PlaceID | null {
  for (const key of graph.edges) {
    const [src, kind, dst] = key.split("|");
    if (kind === "CONTAINS" && dst === childId) return src;
  }
  return null;
}

function eq(a: string, b: string) { return a.toLowerCase() === b.toLowerCase(); }
function slug(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40); }

// ---------- compiler from SimpleDecision to Plan ----------
export function compileDecisionToPlan(
  d: SimpleDecision,
  graph: Graph,
  state: LocationState,
  idAlloc: (seed: string) => PlaceID
): Plan {
  const ops: Op[] = [];

  if (d.action === "no_change") {
    return { character_id: state.character_id, ops: [{ op: "NO_CHANGE" }], notes: d.reason ?? "no_change" };
  }

  if (d.action === "uncertain") {
    if (d.status?.length) ops.push({ op: "SET_STATUS", status: dedupe([...state.status, ...d.status]) });
    ops.push({ op: "SET_CERTAINTY", certainty: d.certainty, note: d.note });
    return { character_id: state.character_id, ops, notes: "uncertain" };
  }

  // action === "move"
  const dstId = d.dst.id ?? null;

  // Resolve or create destination
  let dst: Place | null = null;
  if (dstId && graph.places.has(dstId)) {
    dst = graph.places.get(dstId)!;
  } else if (d.dst.name && d.dst.kind) {
    const tags = d.dst.tags ?? [];
    dst = ensurePlaceByName(graph, d.dst.name, d.dst.kind, tags, idAlloc);
  } else {
    // malformed; treat as no change
    return { character_id: state.character_id, ops: [{ op: "NO_CHANGE" }], notes: "invalid move payload" };
  }

  // Placement edges if needed
  const anchor = state.anchor_place_id ? graph.places.get(state.anchor_place_id) ?? null : null;
  const parentOfAnchor = anchor ? getParentOf(graph, anchor.id) : null;

  switch (d.placement.mode) {
    case "same_place":
      // no containment changes
      break;

    case "child_of_anchor":
      if (anchor) ensureEdge(graph, anchor.id, "CONTAINS", dst.id);
      break;

    case "peer_in_parent":
      if (parentOfAnchor) ensureEdge(graph, parentOfAnchor, "CONTAINS", dst.id);
      if (anchor) ensureEdge(graph, anchor.id, "ADJACENT_TO", dst.id);
      break;

    case "child_of":
      ensureEdge(graph, d.placement.parent_id, "CONTAINS", dst.id);
      break;

    case "linked_via":
      ensureEdge(graph, d.placement.src_id, d.placement.link, dst.id);
      break;

    case "system_or_higher":
      // You can attach dst to a known system hub if you keep one. Omit for now.
      break;
  }

  // Always move
  ops.push({ op: "MOVE", dst_place_id: dst.id });

  // Status/certainty if provided
  if (d.status?.length) ops.push({ op: "SET_STATUS", status: dedupe([...state.status, ...d.status]) });
  if (d.certainty) ops.push({ op: "SET_CERTAINTY", certainty: d.certainty, note: d.note });

  return { character_id: state.character_id, ops, notes: "compiled from simple decision" };
}

function dedupe<T>(arr: T[]): T[] { return Array.from(new Set(arr)); }

// ---------- apply plan ----------
export function applyPlan(
  plan: Plan,
  graph: Graph,
  state: LocationState
): LocationState {
  let s = { ...state };
  for (const op of plan.ops) {
    if (op.op === "MOVE") s.anchor_place_id = op.dst_place_id;
    if (op.op === "SET_STATUS") s.status = dedupe([...(s.status ?? []), ...op.status]);
    if (op.op === "SET_CERTAINTY") s.certainty = op.certainty;
  }
  return s;
}
Usage
Build a short prompt with the minimal inputs.

Parse the JSON into SimpleDecision.

Call compileDecisionToPlan(decision, graph, state, idAlloc).

Persist graph mutations created during compileDecisionToPlan and then applyPlan to update the character state.

This keeps the model’s job simple: pick a destination at the correct granularity. Your code enforces hierarchy, creates nodes and edges, and ensures lowest-scope movement by default.

You said:
Is there a cheap data store that doesn't have always on costs I could use instead of postgees. I'm using json in s3 for the rest of the system currently
ChatGPT said:

Thought for 38s
Short answer: yes. Use S3 as the source of truth and optionally add DynamoDB on-demand for indexed lookups. Both have no “always-on” servers. Keep writes cheap by treating S3 as append-only event log + sparse materialized views. Add Athena later only for analytics.

Option 1: S3-only (zero baseline)
Use S3 keys as documents plus a tiny event log. Do conditional puts with If-Match on ETag for optimistic concurrency.

Bucket layout
s3://world/
  places/{placeId}.json
  edges/{srcId}/{dstId}__{kind}.json
  entities/{charId}/location.json              // latest snapshot per character
  events/{yyyy}/{mm}/{dd}/{hh}/events.ndjson   // append-only change events
  indexes/tags/{tag}.ndjson                    // optional, small inverted index
Document shapes
// places/{id}.json
{ "id":"boars-head", "name":"Boar's Head Tavern", "kind":"building", "tags":["tavern","public"] }

// edges/{src}/{dst}__{kind}.json
{ "src":"cydonia", "dst":"boars-head", "kind":"CONTAINS" }

// entities/{char}/location.json
{ "character_id":"char-1", "anchor_place_id":"boars-head", "certainty":"exact", "status":[] }
Event record (events.ndjson)
One JSON per line:

{"ts":"2025-11-10T08:15:03Z","type":"CREATE_PLACE","place":{"id":"iron-anvil","name":"Iron Anvil","kind":"building","tags":["blacksmith"]}}
{"ts":"2025-11-10T08:15:04Z","type":"CREATE_EDGE","edge":{"src":"cydonia","dst":"iron-anvil","kind":"CONTAINS"}}
{"ts":"2025-11-10T08:15:05Z","type":"MOVE","character_id":"char-1","dst_place_id":"iron-anvil"}
Pros: $0 baseline. Pay per GB and PUT/GET.
Cons: No server-side queries. You must maintain tiny auxiliary “indexes” files you update on writes.

Minimal indexes to keep queries sane
indexes/tags/{tag}.ndjson with {place_id} lines.

Optionally indexes/contains/{parentId}.ndjson listing children.
Both files are small and append-only. Periodically compact.

Option 2: Add DynamoDB on-demand (still no baseline)
Keep S3 as truth and mirror a few items into Dynamo for fast lookups. On-demand mode has no provisioned capacity and tiny storage cost.

Single-table design
Table: world
PK: pk SK: sk

Items:

Place:        pk=PLACE#{id}        sk=#
PlaceByTag:   pk=TAG#{tag}         sk=PLACE#{id}
Edge:         pk=PLACE#{src}       sk=EDGE#{kind}#{dst}
ChildrenIdx:  pk=PARENT#{parentId} sk=CHILD#{childId}
CharState:    pk=CHAR#{id}         sk=STATE
Optional GSI for reverse edges if needed.

Pros: fast point queries and sets. Still no always-on.
Cons: small per-request charges.

LLM prompt (simplified “new anchor”)
Feed intent and GM text, get only the new anchor and placement hint. You compute storage ops.

You decide if a character’s anchor changes. Output ONLY JSON:

{ "action": "no_change" |
           "move" |
           "uncertain",
  "dst": { "id"?: string, "name"?: string, "kind"?: string, "tags"?: string[] },
  "placement": "child_of_anchor" | "peer_in_parent" | "child_of" | "linked_via" | "same_place" | "system_or_higher",
  "parent_id"?: string,
  "link"?: "DOCKED_TO"|"LINKS_TO",
  "status"?: string[],
  "certainty"?: "exact"|"bounded"|"unknown",
  "note"?: string
}

Constraints:
- Prefer the lowest-level place. Do not escalate scope unless GM makes it explicit.
- If destination exists, return dst.id. If new, return name+kind(+tags) and a placement hint.
TypeScript interfaces
export type EdgeKind = "CONTAINS" | "ADJACENT_TO" | "DOCKED_TO" | "LINKS_TO";

export interface Place { id: string; name: string; kind: string; tags: string[]; }
export interface Edge  { src: string; dst: string; kind: EdgeKind; }

export type Certainty = "exact" | "bounded" | "unknown";
export interface LocationState {
  character_id: string;
  anchor_place_id: string | null;
  certainty: Certainty;
  status: string[];
}

export type Decision =
  | { action: "no_change"; note?: string }
  | { action: "uncertain"; certainty: Certainty; note?: string; status?: string[]; parent_id?: string }
  | { action: "move";
      dst: { id?: string; name?: string; kind?: string; tags?: string[] };
      placement: "same_place" | "child_of_anchor" | "peer_in_parent" | "child_of" | "linked_via" | "system_or_higher";
      parent_id?: string; link?: "DOCKED_TO"|"LINKS_TO";
      status?: string[]; certainty?: Certainty; note?: string;
    };

export interface Storage {
  // S3-only or Dynamo-backed implementation
  getPlace(id: string): Promise<Place | null>;
  putPlace(place: Place, ifNoneMatch?: string): Promise<void>;
  ensureEdge(edge: Edge): Promise<void>;
  listChildren(parentId: string): Promise<string[]>;  // from index
  appendEvent(ev: unknown): Promise<void>;
  getCharState(charId: string): Promise<LocationState | null>;
  putCharState(state: LocationState, ifMatchEtag?: string): Promise<void>;
  addTagIndex(tag: string, placeId: string): Promise<void>;
  addContainsIndex(parentId: string, childId: string): Promise<void>;
}
Helper functions (storage-agnostic)
export async function compileDecision(
  d: Decision,
  storage: Storage,
  state: LocationState
): Promise<{ ops: Array<() => Promise<void>>; nextState: LocationState }> {

  if (d.action === "no_change") {
    return { ops: [], nextState: state };
  }

  if (d.action === "uncertain") {
    const next = {
      ...state,
      certainty: d.certainty,
      status: dedupe([...(state.status ?? []), ...(d.status ?? [])]),
    };
    return { ops: [() => storage.appendEvent({ type:"SET_CERTAINTY", char: state.character_id, certainty: d.certainty, note: d.note })], nextState: next };
  }

  // action === "move"
  let dstId = d.dst.id ?? null;

  // Create place if needed
  if (!dstId) {
    if (!d.dst.name || !d.dst.kind) throw new Error("move requires dst.id or name+kind");
    const place: Place = {
      id: synthId(d.dst.name, d.dst.kind),
      name: d.dst.name,
      kind: d.dst.kind,
      tags: d.dst.tags ?? [],
    };
    await storage.putPlace(place);            // S3: put to places/{id}.json
    dstId = place.id;

    // placement edges
    const parent = resolveParentId(d, state);
    if (parent) {
      await storage.ensureEdge({ src: parent, dst: dstId, kind: parentEdgeKind(d) });
      await storage.addContainsIndex(parent, dstId);
    }
    // adjacency if peer move and we know anchor
    if (d.placement === "peer_in_parent" && state.anchor_place_id) {
      await storage.ensureEdge({ src: state.anchor_place_id, dst: dstId, kind: "ADJACENT_TO" });
    }

    // tag index
    for (const t of place.tags) await storage.addTagIndex(t, dstId);

    await storage.appendEvent({ ts: now(), type:"CREATE_PLACE", place });
  }

  // Move character
  const next: LocationState = {
    ...state,
    anchor_place_id: dstId!,
    certainty: d.certainty ?? "exact",
    status: dedupe([...(state.status ?? []), ...(d.status ?? [])]),
  };

  const ops: Array<() => Promise<void>> = [
    () => storage.putCharState(next),
    () => storage.appendEvent({ ts: now(), type:"MOVE", char: state.character_id, dst_place_id: dstId, note: d.note }),
  ];

  return { ops, nextState: next };
}

function resolveParentId(d: Decision, state: LocationState): string | null {
  switch (d.placement) {
    case "child_of_anchor":   return state.anchor_place_id!;
    case "child_of":          return d.parent_id ?? null;
    case "peer_in_parent":    return state.anchor_place_id ? (state.anchor_place_id_parent ?? null) : null;
    case "linked_via":        return null; // represented by link edge only
    case "same_place":        return null;
    case "system_or_higher":  return null;
  }
}

function parentEdgeKind(d: Decision): EdgeKind {
  // For creation under a parent we usually need CONTAINS
  if (d.placement === "linked_via") return d.link as EdgeKind; // usually DOCKED_TO or LINKS_TO
  return "CONTAINS";
}

function synthId(name: string, kind: string): string {
  const base = `${kind}:${name}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 48);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${base}-${rand}`;
}

function dedupe<T>(xs: T[]) { return Array.from(new Set(xs)); }
function now() { return new Date().toISOString(); }
S3 implementation sketch
export function makeS3Storage(s3: AWS.S3, bucket: string): Storage {
  return {
    async getPlace(id) {
      try { const r = await s3.getObject({ Bucket: bucket, Key: `places/${id}.json` }).promise();
            return JSON.parse(r.Body!.toString("utf8")) as Place; }
      catch { return null; }
    },
    async putPlace(place) {
      await s3.putObject({
        Bucket: bucket, Key: `places/${place.id}.json`,
        Body: JSON.stringify(place), ContentType: "application/json"
      }).promise();
    },
    async ensureEdge(edge) {
      const key = `edges/${edge.src}/${edge.dst}__${edge.kind}.json`;
      await s3.putObject({
        Bucket: bucket, Key: key,
        Body: JSON.stringify(edge), ContentType: "application/json"
      }).promise();
    },
    async listChildren(parent) {
      const pfx = `edges/${parent}/`;
      const listed = await s3.listObjectsV2({ Bucket: bucket, Prefix: pfx }).promise();
      const ids = (listed.Contents ?? [])
        .map(o => o.Key!.slice(pfx.length))
        .filter(k => k.includes("__CONTAINS"))
        .map(k => k.split("__")[0]);
      return ids;
    },
    async appendEvent(ev) {
      const key = `events/${now().slice(0,13).replace(/[-:]/g,"/")}/events.ndjson`;
      await s3.upload({
        Bucket: bucket, Key: key,
        Body: JSON.stringify(ev) + "\n", ContentType: "application/x-ndjson"
      }).promise();
    },
    async getCharState(id) {
      try { const r = await s3.getObject({ Bucket: bucket, Key: `entities/${id}/location.json` }).promise();
            return JSON.parse(r.Body!.toString("utf8")) as LocationState; }
      catch { return null; }
    },
    async putCharState(s) {
      await s3.putObject({
        Bucket: bucket, Key: `entities/${s.character_id}/location.json`,
        Body: JSON.stringify(s), ContentType: "application/json"
      }).promise();
    },
    async addTagIndex(tag, placeId) {
      const key = `indexes/tags/${encodeURIComponent(tag)}.ndjson`;
      await s3.upload({ Bucket: bucket, Key: key, Body: JSON.stringify({ place_id: placeId })+"\n" }).promise();
    },
    async addContainsIndex(parentId, childId) {
      const key = `indexes/contains/${parentId}.ndjson`;
      await s3.upload({ Bucket: bucket, Key: key, Body: JSON.stringify({ child_id: childId })+"\n" }).promise();
    }
  };
}
Recommendation
Start S3-only. It is cheapest and matches your current stack.

If lookups by tag/adjacency start to hurt, mirror those two indexes in DynamoDB on-demand. Keep writes flowing to both.

Keep the LLM output minimal (new anchor + placement). Your code computes node creation and edges and writes small JSONs to S3.

