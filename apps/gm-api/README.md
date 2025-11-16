# GM API – Target State Overview

The GM API replaces the legacy chronicle service with a slimmer surface focused on player
messages. The new module is responsible for translating requests into LangGraph executions while
delegating all persistence to the v2 worldstate package.

## High-Level Flow

1. **Request Layer**  
   - TRPC/HTTP router accepts `postMessage` payloads.  
   - The router resolves authentication/authorization, loads the caller’s chronicle snapshot via the
     worldstate gateway, and instantiates a *worldstate session* for the turn.  
   - Only the new DTOs from `@glass-frontier/worldstate/dto` are used; no legacy schemas or stores
     are imported.

2. **Narrative Engine**  
   - Receives the chronicle snapshot + player entry.  
   - Constructs LangGraph context from snapshot data (character, chronicle metadata, turns cursor,
     location summary) and runs the intent pipeline.  
   - The engine no longer issues persistence writes mid-graph. LangGraph nodes append “effects”
     (`characterInventoryOps`, `skillProgress`, `locationPlan`, `locationEvents`, etc.) to the
     context instead of calling stores directly.

3. **Worldstate Session Adapter**  
   - After the graph completes, the session adapter inspects the accumulated effects and translates
     them into v2 worldstate operations:
     - `appendTurn` with the new turn schema (includes location delta, tags, metadata).
     - `updateCharacter` for inventory / skill / momentum updates.
     - `appendChronicleSummary` for GM summaries (character echoes, story, location events).
     - `list/appendLocationEvents` or `applyLocationPlan` replacements that operate purely through
       the worldstate package (no legacy location graph store).  
   - If the graph requested a closure, the adapter updates chronicle status and emits closure events
     using the new summary kinds (`chronicle_story`, `location_events`, `character_echo`).

4. **Outputs**  
   - Router returns the updated chronicle status, the turn that was persisted, the latest character
     snapshot, and any location summary produced by the engine. These objects match the v2 DTOs so
     downstream clients (chronicle-closer, client app) stay consistent.

## Key Architectural Shifts

- **Clean Persistence Boundary** – All reads/writes flow through `@glass-frontier/worldstate`
  gateways injected at startup. LangGraph code interacts only with in-memory context + effect
  objects, keeping it agnostic to the storage backend.
- **Session-Oriented Writes** – Batched commits reduce round-trips: turns, character updates, and
  summaries are written together after the graph run, enabling optimistic handling and eventual
  retries without re-running the entire pipeline.
- **DTO Parity** – New shared schemas (`MetadataSchema`, `TagArraySchema`, `Character.echoes`,
  updated `Turn` with `locationDelta`) are the only data contracts exposed by the API.
- **Extensible Effects** – Adding new persistence behaviors (e.g., future location event types or
  character echo policies) is as simple as defining a new effect record and teaching the session
  adapter how to map it to worldstate commands.

This target state keeps gm-api narrowly focused on orchestrating LangGraph while ensuring every
interaction with persistent world data occurs through the new v2 interfaces. It also positions the
service to expand player message handling without dragging forward legacy dependencies.
