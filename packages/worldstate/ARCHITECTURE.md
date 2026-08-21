# WorldState Architecture

`@glass-frontier/worldstate` holds two things that change at different rates and
for different reasons:

- **Canon** — the world's entities, the typed relationships between them, and
  the lore attached to them. Written only by ingest, read on every turn.
- **Chronicle state** — one player's session: character, turns, beats, where
  they are, and what they have found. Written constantly during play, and never
  promoted to canon except by an ingest batch.

```
                      WorldState
                          │
        ┌─────────────────┴─────────────────┐
        │                                   │
    .world                            .chronicles
  (canon storage)                  (session storage)
        │                                   │
  commitBatch  ← the only writer       commitTurn
  getContextSlice ← the turn read      getChronicleState
  listNeighbors / getEntity / lore     upsertCharacter
        │                                   │
        └─────────────── Postgres ──────────┘
```

## Canon has one writer

Every change to canon goes through `commitBatch`, which takes a whole proposal —
entities, the relationships among them, and their lore — validates it against the
world vocabulary, and commits it in one transaction under a batch id.

```ts
const result = await worldState.world.commitBatch({
  entities: [
    { ref: 'cartel', kind: 'faction', name: 'Ash Cartel', subkind: 'cartel' },
    { ref: 'row', kind: 'location', name: 'Cinder Row', subkind: 'district' },
  ],
  relationships: [
    { src: { ref: 'cartel' }, dst: { ref: 'row' }, relationship: 'controls' },
  ],
  lore: [{ entity: { ref: 'cartel' }, title: 'The Ledgers', prose: '…' }],
  source: 'import',
  sourceId: 'tsonu-export-2026-08',
});
```

Three properties make this the only write path worth having:

**Within-batch references.** `ref` names an entity inside the proposal so
relationships and lore can point at entities that do not exist yet. Entities
already stored are addressed by `{ id }` or `{ externalKey }`.

**Validation before any write.** The whole proposal is checked first — kinds,
subkinds, statuses, relationship rules, banned verbs, unresolved references — and
every failure is reported together as `ProposalRejected.violations`. A proposal
either lands whole or not at all.

**Reversibility.** `revertBatch(batchId)` removes everything a batch wrote. This
is the correction path: there is no per-entity mutation, because a full-object
upsert cannot tell an absent relationship from a removed one and has to guess.

`(source, external_key)` is the import identity. Re-ingesting the same source
updates the entity it wrote last time rather than duplicating it, and slugs get
counted suffixes (`grey_harbor_2`) so they stay stable across runs.

## The per-turn read is one query

`getContextSlice` answers "what should the GM know right now" in a single
statement: it walks out from the focus set along relationships weighted by
`COALESCE(edge.strength, world_relationship_kind.default_strength)`, keeps the
strongest path to each entity, ranks the result, and attaches recent lore.

```ts
const slice = await worldState.world.getContextSlice({
  anchorId: chronicle.anchorEntityId,
  focusIds: recentlyUsedEntityIds,
  focusTags: activeTags,
  limit: 7,
  maxHops: 2,
  minProminence: 'recognized',
});
```

Weighting is why this beats a hop count: `leader_of` carries a path further than
`adjacent_to`, so a defining relationship two steps out can outrank an incidental
one next door. `listNeighbors` uses the same traversal when a caller wants the
relationships themselves rather than a ranked slice.

## The vocabulary is repo content

Kinds, subkinds, statuses, prominence tiers, relationship types and the rules
constraining them live in `@glass-frontier/dto` (`world/vocabulary.ts`). That file
is the authority:

- the DTO validators are derived from it, so a kind it does not declare cannot
  reach the wire;
- `seedVocabulary(pool)` applies it to the database after migrations, so the
  vocabulary tables are its materialized form;
- ingest validation reads it to decide what a proposal may say.

Nothing writes the vocabulary at runtime. Changing the world's shape means
editing that file and redeploying. Verbs marked `category: 'banned'` — `related_to`
today — are declared precisely so validation can reject them by name rather than
by silence.

## Tables

| Table | Holds |
|---|---|
| `node` | identity only: `(id, kind)`. The row an edge points at. |
| `edge` | typed relationships, with strength and batch attribution |
| `entity` | canon entities, with `source`, `external_key`, `batch_id` |
| `lore_fragment` | prose attached to an entity, with a generated `tsvector` |
| `ingest_batch` | one row per commit; the unit of attribution and reversal |
| `world_kind` / `world_subkind` / `world_kind_status` / `world_prominence` | materialized entity vocabulary |
| `world_relationship_kind` / `world_relationship_rule` | materialized edge vocabulary |
| `chronicle` / `chronicle_turn` / `chronicle_session_state` / `character` | session state |

`node` carries no properties. Each domain owns its own table; the shared table
exists so an edge can span an entity, a character, and a chronicle with one
foreign key.

## Location is a name

A chronicle carries `location_name` — where the scene is — and, when it started
from a canon place, the `location_id` it began at. Play only ever changes the
name.

The GM's location classifier answers one question after a turn: did the scene
move, and what is the place called. It does not match the answer against the
graph, create an entity for it, or reason about how places connect. Everything
the world knows about where the players are reaches the prompt through the
context slice, which ranks locations alongside every other kind.

That keeps the two halves of this package genuinely separate: `chronicles` never
reads canon, and canon never learns anything from a turn. A place that play
invented becomes real only if a close-time batch proposes it.

## Adding a knowledge domain

New canon shapes are vocabulary changes, not code: add the kind, its subkinds and
statuses, and the relationship rules connecting it to what already exists, then
redeploy. `commitBatch` accepts it, traversal weights it, and the context slice
returns it without any new store code.

Code is only needed for a domain that is *not* canon — something with its own
lifecycle and write pattern, like chronicle state. That gets its own table and
its own store alongside `chronicles`, and joins the graph through `node` if its
rows need to be edge endpoints.
