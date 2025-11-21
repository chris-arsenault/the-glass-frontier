# WorldState Architecture

## Overview

The worldstate package provides a **unified graph-based knowledge management system** for The Glass Frontier. It separates concerns between low-level graph operations and domain-specific logic, enabling extensibility for new knowledge domains.

## Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│                     WorldState                          │
│              (Unified Entry Point)                      │
│                                                          │
│  .graph       → GraphOperations (low-level)             │
│  .chronicles  → ChronicleStore (domain logic)           │
│  .locations   → LocationStore (domain logic)            │
│  .characters  → (future)                                 │
│  .factions    → (future)                                 │
└─────────────────────────────────────────────────────────┘
                         ▲
          ┌──────────────┼──────────────┐
          │              │              │
┌─────────────┐  ┌──────────────┐  ┌──────────────┐
│  Chronicle  │  │   Location   │  │    Graph     │
│    Store    │  │     Store    │  │ Operations   │
│  (domain)   │  │   (domain)   │  │  (generic)   │
└─────────────┘  └──────────────┘  └──────────────┘
      │                │                    │
      └────────────────┴────────────────────┘
                       │
              ┌────────────────┐
              │  PostgreSQL    │
              │  (node, edge,  │
              │   domain tabs) │
              └────────────────┘
```

## Core Components

### 1. GraphOperations (Low-Level)
**Purpose:** Domain-agnostic graph operations on nodes and edges.

**Responsibilities:**
- `upsertNode()` - Insert/update nodes in the graph
- `deleteNode()` - Remove nodes
- `upsertEdge()` - Create/update edges between nodes
- `deleteEdge()` - Remove edges
- `queryNodesByKind()` - Query nodes by type
- `getEdges()` - Get edges connected to a node

**When to use:**
- ❌ Rarely! Prefer domain stores for business logic
- ✅ When creating new knowledge domain stores
- ✅ When implementing cross-domain operations

```typescript
// Access via WorldState
const graph = worldState.graph;
await graph.upsertNode(client, id, 'custom_type', { ...props });
```

### 2. LocationStore (Domain Logic)
**Purpose:** Location graph management (places, edges, character positioning).

**Renamed from:** `LocationGraphStore` → `LocationStore`

**Responsibilities:**
- Location CRUD operations
- Location hierarchies (parent-child relationships)
- Location relationships (adjacent, linked, docked)
- Character positioning in the world
- Location events and history

**Key Methods:**
```typescript
// Core operations
upsertLocation(input) → LocationPlace
deleteLocation(input) → void
createLocationWithRelationship(input) → LocationPlace

// Edges
upsertEdge(input) → void
deleteEdge(input) → void

// Queries
listLocationRoots(input?) → LocationPlace[]
getLocationDetails(input) → { place, breadcrumb, children, neighbors }
getLocationNeighbors(input) → LocationNeighbors
getLocationChain(input) → LocationBreadcrumbEntry[]

// Character positioning
getLocationState(characterId) → LocationState | null
moveCharacterToLocation(input) → LocationState

// Events
appendLocationEvents(input) → LocationEvent[]
listLocationEvents(input) → LocationEvent[]
```

**Architectural Pattern:**
- Calls `GraphOperations` for node/edge operations
- Manages `location` table and domain-specific queries
- Handles location-specific business logic

```typescript
// Internal implementation pattern
async upsertLocation(input) {
  await withTransaction(this.#pool, async (client) => {
    // Use GraphOperations for node
    await this.#graph.upsertNode(client, id, 'location', props);

    // Manage domain-specific table
    await client.query(`INSERT INTO location ...`);

    // Handle domain logic (parent relationships, etc.)
    await this.#setCanonicalParent(client, id, parentId);
  });
}
```

### 3. ChronicleStore (WorldStateStore)
**Purpose:** Chronicle and turn management.

**Responsibilities:**
- Chronicle CRUD operations
- Turn history and persistence
- Character management
- Integration with LocationStore for chronicle context

**Key Methods:**
```typescript
// Chronicles
ensureChronicle(params) → Chronicle
getChronicle(id) → Chronicle | null
getChronicleState(id) → ChronicleSnapshot | null
listChroniclesByPlayer(playerId) → Chronicle[]
deleteChronicle(id) → void

// Characters
upsertCharacter(character) → Character
getCharacter(id) → Character | null
listCharactersByPlayer(playerId) → Character[]

// Turns
addTurn(turn) → Turn
listChronicleTurns(chronicleId) → Turn[]
```

**Architectural Pattern:**
- Calls `GraphOperations` for node operations
- Integrates with `LocationStore` for location context
- Exposes `graph` property for extensibility

```typescript
// Internal implementation pattern
constructor(options: { pool, graph?, locationStore? }) {
  this.#graph = options.graph ?? new GraphOperations(pool);
  this.#locationStore = options.locationStore ?? null;
}

async addTurn(turn) {
  // Use GraphOperations for node
  await this.#graph.upsertNode(client, turn.id, 'chronicle_turn', turn);

  // Manage chronicle_turn table with full column structure
  await client.query(`INSERT INTO chronicle_turn (...) VALUES (...)`);
}
```

### 4. WorldState (Unified Interface)
**Purpose:** Single entry point for all world state operations.

**Benefits:**
- ✅ Single instantiation manages all stores
- ✅ Shared `GraphOperations` instance across domains
- ✅ Automatic dependency injection (LocationStore → ChronicleStore)
- ✅ Clear domain boundaries
- ✅ Easy to add new knowledge domains

**Usage:**
```typescript
// Recommended: Use unified interface
import { WorldState } from '@glass-frontier/worldstate';

const worldState = WorldState.create({
  connectionString: process.env.DATABASE_URL,
});

// Access domain stores
await worldState.locations.upsertLocation({ ... });
await worldState.chronicles.ensureChronicle({ ... });

// Low-level operations (rare)
await worldState.graph.upsertNode(client, id, 'custom', { ... });
```

**Alternative: Individual Stores (Advanced)**
```typescript
// For advanced use cases that need fine-grained control
import {
  createLocationStore,
  createWorldStateStore,
  GraphOperations
} from '@glass-frontier/worldstate';

const pool = createPool({ ... });
const graph = new GraphOperations(pool);
const locations = createLocationStore({ pool, graph });
const chronicles = createWorldStateStore({ pool, graph, locationStore: locations });
```

## Database Schema

### Core Tables

**`node` table** - Generic node storage
```sql
CREATE TABLE node (
  id uuid PRIMARY KEY,
  kind text NOT NULL,        -- 'location', 'character', 'chronicle', etc.
  props jsonb NOT NULL,      -- Domain-specific properties
  created_at timestamptz
);
```

**`edge` table** - Generic edge storage
```sql
CREATE TABLE edge (
  id uuid PRIMARY KEY,
  src_id uuid REFERENCES node(id),
  dst_id uuid REFERENCES node(id),
  type text NOT NULL,        -- 'location_parent', 'ADJACENT_TO', 'character_at', etc.
  props jsonb,
  created_at timestamptz
);
```

### Domain Tables

**`location` table** - Location-specific data
- Managed by `LocationStore`
- Contains queryable fields (name, kind, tags, etc.)
- Links to `node` via `id` foreign key

**`chronicle` table** - Chronicle-specific data
- Managed by `ChronicleStore`
- Contains queryable fields (title, status, player_id, etc.)
- Links to `node` via `id` foreign key

**`chronicle_turn` table** - Turn-specific data
- Managed by `ChronicleStore`
- Structured columns for all turn data (no payload JSONB!)
- See migration `005_chronicle.cjs` for full schema

## Migration Guide

### Before (Old Pattern)
```typescript
import {
  createLocationGraphStore,
  type LocationGraphStore
} from '@glass-frontier/worldstate';

const locationGraphStore = createLocationGraphStore({ ... });
await locationGraphStore.upsertLocation({ ... });
```

### After (New Pattern)
```typescript
// Option 1: Unified Interface (Recommended)
import { WorldState } from '@glass-frontier/worldstate';

const worldState = WorldState.create({ ... });
await worldState.locations.upsertLocation({ ... });
await worldState.chronicles.ensureChronicle({ ... });

// Option 2: Individual Stores (Advanced)
import { createLocationStore, type LocationStore } from '@glass-frontier/worldstate';

const locationStore = createLocationStore({ ... });
await locationStore.upsertLocation({ ... });
```

### Naming Changes
- ❌ `LocationGraphStore` → ✅ `LocationStore`
- ❌ `createLocationGraphStore()` → ✅ `createLocationStore()`
- ❌ `#locationGraphStore` → ✅ `#locationStore`

## Adding New Knowledge Domains

To add a new knowledge domain (e.g., `CharacterRelationshipStore`):

1. **Create the store** - `src/characterRelationshipStore.ts`
```typescript
import { GraphOperations } from './graphOperations';

class PostgresCharacterRelationshipStore implements CharacterRelationshipStore {
  readonly #pool: Pool;
  readonly #graph: GraphOperations;

  constructor(options: { pool: Pool; graph?: GraphOperations }) {
    this.#pool = options.pool;
    this.#graph = options.graph ?? new GraphOperations(options.pool);
  }

  async createRelationship(input) {
    // Use GraphOperations for edge
    await this.#graph.upsertEdge(this.#pool, {
      src: input.characterA,
      dst: input.characterB,
      type: 'relationship',
      props: { kind: input.kind, strength: input.strength },
    });
  }
}
```

2. **Add to `WorldState`**
```typescript
class WorldState {
  readonly #relationships: CharacterRelationshipStore;

  static create(options) {
    // ...
    const relationships = createCharacterRelationshipStore({ pool, graph });
    return new WorldState({ graph, chronicles, locations, relationships });
  }

  get relationships(): CharacterRelationshipStore {
    return this.#relationships;
  }
}
```

3. **Use it**
```typescript
await worldState.relationships.createRelationship({
  characterA: 'char-1',
  characterB: 'char-2',
  kind: 'ally',
  strength: 0.8,
});
```

## Design Principles

1. **Separation of Concerns**
   - GraphOperations = generic graph mechanics
   - Domain stores = business logic and queries

2. **Single Responsibility**
   - Each store manages one knowledge domain
   - Node/edge operations are centralized

3. **Extensibility**
   - New domains = new store + add to WorldState
   - No changes to existing stores required

4. **Encapsulation**
   - WorldState hides complexity
   - Domain stores hide graph implementation

5. **Consistency**
   - All stores use GraphOperations
   - Uniform patterns across domains

## Future Knowledge Domains

Potential additions:
- `CharacterStore` - Character relationships, progression, history
- `FactionStore` - Organization management, reputation
- `QuestStore` - Quest states, dependencies, progress
- `TimelineStore` - Temporal events, causality chains
- `KnowledgeStore` - Character knowledge, discoveries, clues
