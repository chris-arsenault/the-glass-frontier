# Encyclopedia integration plan

Status: planned; implementation not started

Created: 2026-08-27

Sulion plan: `9f4946db-b23d-4f2b-9dac-e051812537cb`

Production data strategy: reset and rebuild the Glass Frontier database; do
not migrate or restore legacy rows into the new schema.

This is the implementation plan for adding a first-class Encyclopedia to
Glass Frontier. The accepted domain model and authoring contract live in
[the Encyclopedia reference catalog design](docs/design/encyclopedia-reference-catalog.md).
This plan covers the game-side integration: database ownership, canon import,
character origin, Chronicle creation, GM retrieval, player UI, a clean
production database reset, and verification.

## Outcome

The Encyclopedia is a separate catalog of reusable world material. It gives
the GM concrete organisms, roles, practices, techniques, technology, vehicle
classes, resources, phenomena, cultures, and ordinary place features without
turning those subjects into named Atlas entities.

The shipped system must preserve three namespaces:

| Namespace | Contains | Chronicle anchor | Mutable through play |
|---|---|---:|---:|
| Atlas | Particular places, people, factions, vessels, artifacts, and events | When explicitly eligible | Yes |
| Encyclopedia | Reusable types, practices, organisms, materials, and patterns | Never | No |
| Chronicle | People, places, objects, and concepts established only in one play history | Never a global anchor | Within that Chronicle |

`Reference` is not a fourth content namespace. It describes the runtime use of
an Encyclopedia entry: a reference match, reference usage, or reference
mention.

The end-to-end path is:

```text
tsonu-canon snapshot
        |
        v
atomic canon importer
   |                  |
   v                  v
Atlas tables      Encyclopedia tables
   |                  |
WorldSchemaStore  EncyclopediaStore
   \                  /
    \                /
 typed WORLD-INDEX and lookup_world
              |
        Chronicle GM
           |
           v
named entity focus and separate reference usage
```

## Required boundaries

These constraints define correctness. They are not implementation
preferences.

- Encyclopedia entries do not become `HardState` records.
- Encyclopedia entries do not receive `node`, `entity`, `edge`, or
  `lore_fragment` rows.
- Atlas and Encyclopedia retain separate persistence, slug, relationship,
  embedding, named-resolution, and API namespaces. The GM retrieves both
  through one typed `lookup_world` facade.
- Encyclopedia entries cannot become Chronicle locations, anchors, scene
  subjects, target entities, front agents, entity-roster entries, entity-focus
  entries, or Chronicle-closer entity proposals.
- Atlas named-entity lookup never falls back to Encyclopedia lookup, and
  Encyclopedia mention lookup never falls back to Atlas lookup. A
  `lookup_world` search intentionally queries both and labels every result.
- A matching Encyclopedia entry is a candidate, not an assertion that an
  instance is present.
- No match says nothing about what is possible. Players and the GM may always
  invent new material.
- Topic tags never double as applicability tags.
- Character behavior is never inferred deterministically from species or
  culture.
- Player APIs exclude GM-only entries, sections, selection evidence, and
  private reference usage.
- The implementation does not branch on the current set of Encyclopedia
  kinds. Imported capabilities drive behavior.

## Current assumptions that must change

### Canon import

`packages/worldstate/src/tsonuBundle.ts` currently converts every source entry
to `ProposedEntity`, every owned prose section to `ProposedLoreFragment`, and
every outgoing source connection to an Atlas relationship. The checked-in
artifact is a single `CanonProposal`, and `CanonWriter` reconciles that proposal
as the authoritative import snapshot.

The new importer must receive explicit Atlas, Encyclopedia, and guide
collections. It must not classify source entries by kind or title.

### Persistence

`WorldSchemaStore` currently owns Atlas entities, graph relationships, lore,
context slices, schema vocabulary, and entity embeddings. Encyclopedia
operations need a distinct `EncyclopediaStore`; adding reference methods to
`WorldSchemaStore` would erase the boundary at the main persistence interface.

The repository's active persistence package is `packages/worldstate`. New
storage belongs there unless that package is deliberately renamed in a
separate change.

### Character origin

`CharacterOrigin` currently stores four IDs described and resolved as Atlas
entity IDs. That assumption is repeated in:

- `packages/dto/src/Character.ts`
- `packages/app/src/promptContext/promptViews.ts`
- `apps/chronicle-api/src/router.ts`
- `apps/chronicle-api/src/services/chronicleSeedService.ts`
- `apps/client/src/components/wizards/CharacterCreationWizard`
- `apps/client/src/components/overview/CharacterOverview`
- character persistence mirrors

Species and culture must move to Encyclopedia references. Homeland and
allegiance remain Atlas entities.

### Chronicle creation

Chronicle start currently selects an Atlas location and a one-hop eligible
Atlas anchor, then generates seeds and an opening from location lore, anchor
lore, tone, and four origin names. The Encyclopedia should enrich this flow
without becoming another required selection step.

### GM retrieval

The canonical GM already uses an agentic prose-retrieval subsystem:

- a compact `WORLD-INDEX`;
- Atlas and history tools;
- bounded search/evaluation rounds;
- a composed `TurnBrief`;
- provenance-filtered entity sidecars;
- a storyteller with no retrieval tools.

The Encyclopedia extends that subsystem. The existing source-specific search,
open, lore, relationship, and history tools should collapse behind one typed
`lookup_world` facade rather than adding Encyclopedia-specific tools. This
does not restore a broad fixed entity roster or replace the rest of the turn
graph.

### Player UI

The current player-facing world reader is the Atlas. Character origin, Atlas
entity popovers, the Nearby Entities panel, Chronicle start, and entity links
all assume one world namespace. The UI needs separate Atlas and Encyclopedia
destinations while retaining one coherent World Guide.

## Contract adjustments before content production

The entry and applicability contract in the design document remains the base.
The game integration requires four targeted additions and one change.

### Dynamic Encyclopedia schema

The game must not compile the current kinds into a Zod enum. Import their
definitions with the snapshot:

```ts
type EncyclopediaSchema = {
  kinds: Array<{
    id: string;
    displayName: string;
    description?: string;
    sortOrder: number;
  }>;

  relationshipTypes: Array<{
    id: string;
    displayName: string;
    inverseDisplayName?: string;
    description?: string;
  }>;

  contextTags: Array<{
    id: string;
    description: string;
    scopes: ContextScope[];
  }>;
};
```

`EncyclopediaEntry.kind` and `ReferenceRelationship.relationship` are nonempty
strings validated against this imported schema. Changing or merging a kind
then requires a canon import, not a Glass Frontier deployment.

Closed runtime capabilities remain typed:

- `characterRole`
- `visibility`
- `prevalence`
- `audience`
- applicability quantifiers and scopes
- reference-usage roles

### Entry visibility

Add:

```ts
visibility: 'player' | 'gm';
```

Section audience cannot hide an entry's title and summary. A GM-only entry is
available to internal retrieval but absent from player list, search, detail,
association, and applicability endpoints.

### Stable section identity

Each section needs a stable source key:

```ts
type EncyclopediaSection = {
  externalKey: string;
  heading: string;
  text: string;
  audience: 'player' | 'gm';
};
```

Heading text and array position are not durable import identities.

### Character selection copy

Add `characterBlurb?: string`. Source validation requires it when
`characterRole` is present. This replaces the concise `originBlurb` currently
used by character-origin cards without forcing the wizard to truncate a full
summary.

### Atlas context tags

Add `contextTags: string[]` to `HardState` and `ProposedEntity`. These values
are imported source metadata and validated against the Encyclopedia context
tag registry. They are separate from lore-fragment tags and entity-focus tags.

## Persistence design

### Vocabulary tables

Add:

- `encyclopedia_kind`
- `encyclopedia_relationship_kind`
- `reference_context_tag`

These are imported, read-only vocabularies. Entry and relationship records use
foreign keys to them, but application code treats their IDs as opaque strings.

### Encyclopedia entries

Add `encyclopedia_entry` with:

- `id uuid primary key`
- `slug text unique not null`
- `external_key text not null`
- `source`, `source_id`, and `batch_id`
- `title text not null`
- `aliases text[] not null`
- `kind text not null`
- `subkind text`
- `status text not null`
- `visibility text not null`
- `summary text not null`
- `topics text[] not null`
- `prevalence text not null`
- `character_role text`
- `character_blurb text`
- `usage jsonb not null`
- `embedding vector(1024)`
- `embedding_model text`
- `embedding_content_hash text`
- `embedding_updated_at timestamptz`
- source and update timestamps

Use a unique partial index on `(source, external_key)`, matching existing
Atlas import identity. Use GIN indexes for aliases and topics and an HNSW index
for embeddings.

The Encyclopedia table does not reference `node`. Separate namespaces permit
the same UUID or slug to exist temporarily or permanently in Atlas and
Encyclopedia without generic lookup ambiguity.

### Sections and search

Add `encyclopedia_section` with a stable source external key, entry FK,
heading, body, audience, order, batch/source metadata, and its own full-text
search vector.

Entry search combines:

- exact title and alias matches;
- full-text title, summary, topic, and section search;
- semantic entry embedding search.

The embedding document contains title, aliases, summary, topics, usage cues,
affordances, pressures, variations, and relevant sections. The Encyclopedia
corpus receives its own measured semantic threshold rather than inheriting
the entity threshold.

### Applicability index

Keep the authored `availability` object on `encyclopedia_entry` as JSON. During
the same write, derive:

- `encyclopedia_selector(entry_id, selector_index)`
- `encyclopedia_selector_term(entry_id, selector_index, quantifier, scope,
  term_kind, value)`

The derived rows make `all`, `any`, and `none` matching indexed and
explainable. They are rebuilt from the canonical JSON on every entry write and
are never edited independently.

The matcher returns the selector and terms that qualified an entry.

### Reference relationships

Use two tables rather than the generic `edge` table or polymorphic UUID
columns:

- `encyclopedia_entry_relationship`
  - source entry FK
  - destination entry FK
  - relationship type FK
  - optional note
  - import metadata
- `atlas_encyclopedia_relationship`
  - Atlas entity FK
  - Encyclopedia entry FK
  - relationship type FK
  - direction identifying whether Atlas is source or destination
  - optional note
  - import metadata

This allows database-enforced endpoints without making Encyclopedia entries
traversable through ordinary Atlas relationships.

### Atlas context tags

Add `entity.context_tags text[] not null default '{}'` and a GIN index. The
importer writes these tags from `ProposedEntity.contextTags`.

Context aggregation follows explicit containment relationships. It does not
inherit tags from arbitrary graph neighbors.

### Character origin

The target DTO is:

```ts
type CharacterOrigin = {
  speciesRefId: string;
  cultureRefId: string;
  homelandEntityId: string;
  allegianceEntityId: string;
  allegianceStance: AllegianceStance;
};
```

Rename the scalar character mirrors accordingly. They remain deliberately
without FKs because authoritative import reconciliation may remove and
replace canon rows.

Add one shared resolver:

```ts
type ResolvedCharacterOrigin = {
  species: EncyclopediaEntry;
  culture: EncyclopediaEntry;
  homeland: HardState;
  allegiance: HardState;
};
```

It validates `characterRole` for the first two records and `playableAs` for the
last two. All prompt, UI, and validation callers use this resolver. There is no
cross-namespace fallback.

### Chronicle usage and mentions

Reference usage is distinct from entity focus and player-visible mentions.

Add private `chronicle_encyclopedia_usage` rows containing:

- Chronicle ID
- optional turn ID
- phase: `opening`, `environment`, or `narration`
- turn sequence
- reference UUID, external key, and slug snapshot
- role: `texture`, `interaction`, `character_origin`, or `instance_basis`
- whether the entry was explicitly named in player-visible prose

Do not use a live FK to `encyclopedia_entry`; usage history must survive canon
correction or deletion.

Persist player-safe `EncyclopediaMention` snapshots with turn text:

- reference ID and slug
- safe title, kind, and summary snapshot
- transcript entry and speaker
- exact span
- resolution method

Candidate entries and hidden usage never enter public turn DTOs. Branching
copies usage and mentions through the selected turn.

### Ingest batches

Extend `ingest_batch` and commit results with:

- Encyclopedia entry count
- Encyclopedia relationship count
- guide count

Do not add per-kind counters. Kind changes must remain data-only changes.

## Import architecture

### Generated artifact

Replace the single imported `CanonProposal` artifact with an authoritative
snapshot:

```ts
type WorldCanonSnapshot = {
  source: 'import';
  sourceId: string;

  atlas: {
    entities: ProposedEntity[];
    lore: ProposedLoreFragment[];
    relationships: ProposedRelationship[];
  };

  encyclopedia: {
    schema: EncyclopediaSchema;
    entries: EncyclopediaEntry[];
    relationships: ReferenceRelationship[];
  };

  guides: WorldGuide[];
};
```

The source bundle declares the namespace. The Glass Frontier importer does
not infer it from kind, subkind, source path, relationship count, or
`isArticle`.

Keep `CanonWriter.commitBatch` for incremental Atlas proposals from play or
authoring. Add a dedicated authoritative snapshot writer for production canon
imports.

### Snapshot validation

Reject the complete snapshot before writing if it contains:

- duplicate external keys or slugs within a namespace;
- entries whose kinds are absent from the imported schema;
- relationship types absent from the imported schema;
- invalid context tags or scope/tag combinations;
- unresolved selector reference terms;
- unresolved relationship endpoints;
- Atlas-to-Atlas endpoints in the reference relationship collection;
- contextual availability without a selector;
- character roles without player visibility and a character blurb;
- sections without stable identity or audience;
- invalid prevalence, visibility, audience, scope, or quantifier values.

Report every violation with its precise artifact path.

### Transaction order

Under the existing canon advisory lock and one transaction:

1. Insert the ingest-batch record.
2. Upsert Encyclopedia vocabulary.
3. Plan stable Atlas and Encyclopedia UUIDs.
4. Upsert Atlas entities.
5. Upsert Encyclopedia entries and sections.
6. Resolve and write Encyclopedia and cross-namespace relationships.
7. Write Atlas relationships and lore.
8. Rebuild selector-term rows.
9. Reconcile stale imported rows in every namespace.
10. Delete stale vocabulary after dependent rows are gone.
11. Commit.

An unresolved cross-namespace endpoint rolls back Atlas and Encyclopedia
writes together.

### Stable identity after reset

The first production import runs against an empty database. It does not reuse
UUIDs from the current Atlas representation and does not carry an identity map
from old entities to new Encyclopedia entries. Each namespace receives fresh
UUIDs, and subsequent reimports preserve them by `(source, external_key)`.

If an entry is split or merged after the new system launches, `tsonu-canon`
must declare the new source identities explicitly. The importer never guesses
replacement identity by title or slug.

### Reconciliation

Authoritative import reconciliation independently removes stale:

- Atlas edges
- Atlas lore
- Atlas entities
- Encyclopedia cross-links
- Encyclopedia entry relationships
- selector terms and selectors
- Encyclopedia sections
- Encyclopedia entries
- guide pages
- imported vocabulary definitions

Deletion order must respect FKs. Runtime or historical usage records do not
block canon reconciliation.

### Artifact identity

The checked-in artifact digest includes:

- Atlas entities, relationships, and lore
- Encyclopedia schema, entries, selectors, sections, and relationships
- guide pages

This preserves the existing invariant that a changed generated artifact is a
new import even when the upstream source revision string did not change.

### Embedding backfill

After import, the canon-seed Lambda backfills missing Atlas and Encyclopedia
embeddings. Entry content hashes invalidate embeddings only when searchable
entry content changes. Relationship-only changes preserve them.

Record both embedded counts in the seed result and completion log.

## Encyclopedia store

Add an `EncyclopediaStore` interface and PostgreSQL implementation in
`packages/worldstate`.

The read surface should include:

```ts
getEntry({ id }): Promise<EncyclopediaEntry | null>
getEntryBySlug({ slug }): Promise<EncyclopediaEntry | null>
listEntries(input): Promise<EncyclopediaEntrySummary[]>
listEntriesByIds(ids): Promise<EncyclopediaEntry[]>
listCharacterOptions(role): Promise<EncyclopediaEntrySummary[]>
listForAtlasEntities(entityIds): Promise<ApplicableReference[]>
matchApplicable(input): Promise<ApplicableReference[]>
search(input): Promise<EncyclopediaSearchResult[]>
listMissingEmbeddings(limit?): Promise<EncyclopediaEmbeddingSource[]>
saveEmbedding(id, embedding): Promise<void>
```

Keep canonical and public projections distinct. Internal GM readers may load
GM entries and sections. Public application readers always enforce visibility
and section audience at the store or router boundary rather than relying on
the client to hide fields.

## Context matching

### Context profile

Create a shared server-side builder producing:

```ts
type ReferenceContextProfile = {
  atlasEntityIds: string[];

  scopes: Record<ContextScope, {
    tags: string[];
    referenceExternalKeys: string[];
  }>;

  recentReferenceIds: string[];
  semanticQuery?: string;
  seed: string;
};
```

Inputs are:

- stable world tags;
- current canonical place and explicit containment ancestors;
- selected anchor;
- scene subject and current conditions;
- present or directly relevant Atlas participants;
- character species and culture references;
- relevant affiliations;
- player message and intent summary;
- reference usage from recent turns.

The current place resolves by exact canonical identity. A Chronicle-local place
does not inherit the Chronicle's starting-place tags. It may still receive
world, scene, participant, and global material.

The client never submits arbitrary context tags.

### Selector semantics

For each selector:

- every `all` term must match;
- one `any` term must match unless the list is empty;
- no `none` term may match.

An entry is contextually applicable if it is global or at least one selector
matches. Exact Atlas associations form a second candidate arm. The GM receives
the union with match evidence kept separate.

### Ranking

Rank candidates by:

- selector specificity;
- exact Atlas association;
- semantic relevance to the current action or question;
- prevalence;
- recent actual-use penalty;
- variety across kinds.

Explicit player mentions and character-origin entries bypass the repetition
penalty. Candidate selection is deterministic for the same context and seed.
The seed derives from stable request identity such as Chronicle ID and turn
sequence.

Initial bounded results:

- Encyclopedia portion of the typed agentic `WORLD-INDEX`: 8–12 summaries;
- one-shot context: 4–6 compact entries;
- Environment node: 3–5 entries;
- Chronicle-start preview: 4–6 player entries.

These are tuning values, not DTO limits.

## GM integration

### Retrieval seed

Extend `WORLD-INDEX` with typed Atlas and applicable Encyclopedia entries.
Each entry contains:

- namespace-qualified opaque handle
- namespace and `useAs` semantics
- title
- Atlas type or Encyclopedia kind
- one-sentence summary
- compact match reason for Encyclopedia candidates
- related-entry count or handles when useful

Atlas entries are established particulars. Encyclopedia entries are reusable
candidates, not claims about the scene. Chronicle history remains in the
bounded `HISTORY` prompt block and is also available through `lookup_world`
search.

### Unified world lookup

Replace the GM's source-specific discovery tools with one tool using a
discriminated request:

```ts
type WorldLookupRequest =
  | {
      action: 'search';
      query: string;
    }
  | {
      action: 'open';
      handles: string[];
    };
```

`lookup_world` search fans out across Atlas content, Encyclopedia content, and
Chronicle history. It returns a bounded list in which every result includes:

- an opaque namespace-qualified handle;
- `namespace: 'atlas' | 'encyclopedia' | 'chronicle'`;
- a record type;
- title and compact excerpt;
- `useAs: 'particular' | 'reusable' | 'chronicle_evidence'`.

Each corpus keeps its own search policy and semantic threshold. The facade
merges bounded results without comparing raw similarity scores from unlike
indexes and puts exact matches ahead of approximate matches.

`lookup_world` open dispatches handles to their owning stores. Atlas opens
include relevant lore and related handles. Encyclopedia opens include cues,
affordances, pressures, variations, relevant sections, and related handles.
Chronicle opens include the established history evidence. Relationships and
additional records are followed by opening returned handles rather than by
choosing another source-specific tool.

Do not expose `search_reference`, `open_reference`, or `match_references`.
Applicability is deterministic application policy already represented in the
typed world index. Retire the existing separate search, open, expand, lore,
relationship, and history tools from the GM surface once `lookup_world`
provides their required retrieval coverage.

### Tool-session provenance

Track every served handle in one registry with its namespace, record type, and
whether it was supplied by the index, returned by search, or fully opened.
Source-specific sidecar validation uses this typed provenance; the unified
registry does not merge Atlas focus with Encyclopedia usage.

A reference sidecar is valid only when the corresponding entry was supplied
or opened. `interaction`, `character_origin`, and `instance_basis` should
normally require a full open; `texture` may rely on a sufficiently descriptive
index result.

### Turn brief

Extend `TurnBrief` with a separate reference sidecar:

```ts
type ReferenceSidecarEntry = {
  referenceSlug: string;
  role:
    | 'texture'
    | 'interaction'
    | 'character_origin'
    | 'instance_basis';
};
```

These roles mean:

- `texture`: sensory or background material;
- `interaction`: a player handled, used, learned from, or acted on it;
- `character_origin`: species or culture materially shaped the scene;
- `instance_basis`: the narration introduced a concrete instance of the type.

Reference roles never map to entity `mentioned` or `central` and never update
entity focus.

The researcher incorporates reference material into `CHARACTER`, `LOCATION`,
`PRESENT`, `HISTORY`, or `COMPLICATION`. The storyteller receives usable
fiction rather than an Encyclopedia dump. The sidecar remains provenance and
state.

### Mention resolution

Add a separate Encyclopedia mention resolver with these inputs:

- exact title and alias matches;
- entries supplied or opened this turn;
- verified sidecar entries.

Do not perform whole-catalog semantic mention classification over common
nouns. Semantic search finds relevant content; it does not prove that a text
span names an entry.

Resolve Atlas entity spans first. Encyclopedia mentions annotate only
remaining spans. This prevents a common type name from stealing a named-entity
link.

### Environment node

Provide a small `WORLD-REFERENCE` block built from current place and active
front-agent context. The Environment node remains tool-free. A proposed front
agent must still resolve to a visible Atlas entity.

If the Environment node uses a reference in a world action, record private
usage even when the final narration leaves that action offscreen. Do not emit a
public mention without a player-visible text span.

### One-shot comparison

Add a bounded Encyclopedia context to the one-shot comparison path. Without
it, the model panel would compare an agent with reference access against a
one-shot narrator that never received the new corpus.

Reference context shares the existing one-shot budget. It does not add an LLM
call.

### Open-world invention

A `lookup_world` search with no Encyclopedia result reports only that nothing
matching is written in that corpus. The researcher may then establish new
fiction. It must not turn the absence into an in-world fact that the subject
cannot exist.

Initially, invented common material remains in Chronicle history, where
`lookup_world` can retrieve it as Chronicle evidence. Do not automatically
create or promote an Encyclopedia entry from narration. Add Chronicle-local
reference records later only if measured continuity failures justify them and
an explicit editorial workflow exists.

## Chronicle creation

### Character origin

Species and culture cards query Encyclopedia entries by `characterRole`.
Homeland and allegiance cards continue to query Atlas entities by
`playableAs`.

Character review and overview links are namespace-aware:

- species and culture open Encyclopedia pages;
- homeland and allegiance open Atlas pages.

The server independently validates all four records before creating a
character.

### Start wizard

Keep the existing required flow:

1. Atlas location
2. Atlas anchor
3. tone
4. generated or custom seed
5. Chronicle creation

Once location, anchor, and character are known, show a player-safe `Common
here` preview with 4–6 entries. The preview is informational and links to the
Encyclopedia. It is not another picker, anchor, focus, or required motif.

Do not add a reference-selection field in the first implementation.

### Seed generation

The seed service:

1. resolves the character through the mixed origin resolver;
2. builds a server-owned context profile;
3. matches player-visible entries;
4. adds a bounded `REFERENCE` developer block;
5. generates the existing seed result shape.

Seed teasers receive only player-visible reference material. A custom seed may
name something outside the pre-match; opening generation semantically searches
the seed text before composing.

### Opening generation

Opening generation may use the full GM view because it creates an in-world
revelation rather than public selection copy.

Change its response from a bare string to structured prose plus a reference
sidecar. Verify returned slugs against supplied material, persist opening usage
privately, and include that usage in first-turn repetition control.

Chronicle `location_id`, `anchor_entity_id`, entity focus, entity roster, scene
subject, and front agent remain Atlas-only.

## API boundary

Do not create another Lambda. The current Atlas deployment already owns
authenticated world reads and Chronicle creation. Another database-connected
Lambda would add connection and deployment pressure without strengthening the
content boundary.

Keep `apps/atlas-api` as the deployment unit for this implementation, but split
its code into independent routers and clients:

- `atlasRouter`
- `encyclopediaRouter`
- `worldAtlasClient`
- `encyclopediaClient`

Public procedures:

- `listEncyclopediaEntries`
- `getEncyclopediaEntry`
- `searchEncyclopedia`
- `listApplicableEncyclopedia`
- `listEncyclopediaForAtlasEntity`
- `listCharacterReferenceOptions`

The applicability endpoint accepts canonical identifiers, not arbitrary
client tags. The server builds the context profile and filters visibility.

Internal GM callers use `EncyclopediaStore` directly and can request GM
material.

## Player UI

### Information architecture

Use `World Guide` as the navigation container with two primary surfaces:

- Atlas
- Encyclopedia

Keep `/atlas/:slug?` and add `/encyclopedia/:slug?`. Both pages share a tab
header. Do not add a top-level `Reference` page.

### Encyclopedia index

Provide:

- text search;
- dynamic kind facets from imported vocabulary;
- topic facets;
- prevalence filtering;
- compact entry cards;
- an explicit non-exhaustive empty state.

Do not build a reference graph visualization initially. Typed related-entry
lists serve play better and do not imply that graph degree measures
importance.

### Encyclopedia detail

Show:

- title, summary, kind, subkind, prevalence, and topics;
- player-audience sections;
- related Encyclopedia entries;
- named Atlas examples, institutions, artifacts, and places;
- `Appears around` Atlas links where exact associations exist.

There is no `Start Chronicle` button on an Encyclopedia entry. Associated
Atlas locations may carry that action.

### Atlas additions

Atlas location detail gains `Common here`, backed by player-visible
applicability matching. Other Atlas entities gain `Common knowledge` or `Type`
for exact cross-namespace associations.

Atlas registry, maps, relationships, focus choices, and start actions remain
Atlas-only.

### Chronicle UI

`Nearby entities` remains Atlas-only. Privately matched Encyclopedia
candidates never appear there.

Actual narrated mentions receive a distinct Encyclopedia popover and link.
Expanded turns may show a compact `From the Encyclopedia` row containing only
exact public mentions.

A cue that never names its source entry does not reveal that entry through the
UI.

### Existing articles

Current `isArticle` records are non-runtime guide pages, not Atlas entities or
applicable Encyclopedia entries. Move them to guide storage and display them
inside an Encyclopedia `Guides` section.

Guides do not enter GM matching or `lookup_world` unless runtime reference
content explicitly incorporates their material.

## Production database reset

Do not migrate the current production data. Once the feature is complete,
reset the Glass Frontier production database and run the normal deployment
pipeline against the empty database:

1. Reset the Glass Frontier production database.
2. Run the repository schema migrations.
3. Seed application data.
4. Deploy the application.
5. Seed Atlas, Encyclopedia, and guide canon.
6. Backfill Atlas and Encyclopedia embeddings.

All current database-resident player, character, Chronicle, turn, operations,
and canon records are discarded. Nothing is converted or restored. Schema
changes remain ordinary repository migration files so every new database is
built deterministically.

## Phases and exit gates

### Phase 1: Contract and storage foundation

Sulion status: in progress.

Deliverables:

- dynamic Encyclopedia schema DTOs;
- visibility, stable section identity, and character blurb contract fields;
- Atlas context tags;
- Encyclopedia schema migrations and indexes;
- `EncyclopediaStore` and readers;
- applicability matcher and evidence DTOs;
- isolated full-text and embedding search;
- unit and database tests.

Exit gate:

- A fixture catalog imports and can be queried, matched, searched, and opened
  without creating any Atlas node, edge, lore, focus, or roster record.

### Phase 2: Authoritative snapshot import

Deliverables:

- explicit Atlas, Encyclopedia, and guide artifact collections;
- whole-snapshot validation;
- one-transaction snapshot writer;
- independent reconciliation;
- artifact digest coverage;
- Encyclopedia embedding backfill;
- batch counts and logs.

Exit gate:

- Reimport is idempotent, content edits preserve IDs, searchable edits
  invalidate embeddings, omitted imported rows are removed, and any invalid
  cross-namespace endpoint rolls back the whole snapshot.

### Phase 3: Populate and audit canon

Deliverables:

- direct fresh-database import from `tsonu-canon`;
- explicit classification manifest for current reference-like entries;
- converted cross-namespace relationships;
- context tags on every selectable Chronicle location;
- representative mundane entries across recurring play contexts;
- coverage report.

Exit gate:

- Every selectable Chronicle location matches player-safe material from at
  least five useful kinds, including living material, ordinary work, something
  usable or consumable, a place feature, and a pressure or phenomenon.

### Phase 4: Character origin contract

Deliverables:

- explicit mixed-namespace `CharacterOrigin` fields;
- final scalar-column and props schema for newly created characters;
- shared origin resolver;
- server validation;
- character creation, review, overview, prompt, and seed-service changes;
- namespace-correct links.

Exit gate:

- Species and culture can resolve only through Encyclopedia, homeland and
  allegiance only through Atlas, and a fresh character can be created, open a
  Chronicle, and complete a turn.

### Phase 5: World Guide and Chronicle start

Deliverables:

- Encyclopedia public router and client;
- World Guide navigation;
- index and detail pages;
- Atlas cross-reference sections;
- Chronicle-start `Common here` preview;
- reference-aware seed generation;
- structured opening sidecar and usage persistence.

Exit gate:

- A player can browse and link between both namespaces, create a character,
  generate seeds grounded in applicable material, and open a Chronicle without
  ever selecting an Encyclopedia entry as an anchor.

### Phase 6: GM retrieval integration

Deliverables:

- shared `ReferenceContextBuilder`;
- deterministic matcher and recent-use penalty;
- typed mixed-source `WORLD-INDEX`;
- `lookup_world` search and open actions;
- typed ToolSession provenance;
- TurnBrief reference sidecar;
- private usage and public mention persistence;
- Environment and one-shot reference context;
- Chronicle chat annotation;
- branch copying.

Exit gate:

- Reference material appears in narration with verified provenance, does not
  change entity focus, survives branching, stays within existing LLM call and
  retrieval budgets, and never exposes private candidates to the player.

### Phase 7: Ontology cleanup

Deliverables:

- reference-class entries absent from the generated Atlas collection;
- obsolete Atlas lore and edges absent from the generated snapshot;
- article content emitted as guides;
- old vocabulary removed;
- fresh-database verification completed;
- documentation and bundled changelog updated for shipped behavior.

Exit gate:

- No Encyclopedia entry is present in the Atlas import or returned by any
  Atlas lookup, search, traversal, picker, focus, roster, or closure path.

### Phase 8: Production database reset and cutover

Deliverables:

- production database reset;
- schema migration replay;
- application and canon seed;
- embedding backfill;

Exit gate:

- The normal deployment finishes against the fresh production database and no
  legacy gameplay or operations rows were restored.

## Verification matrix

### Contract and validation

- Kinds can be added, renamed, or merged by changing imported vocabulary only.
- Unknown kinds, relationship types, context tags, endpoints, and character
  roles reject the snapshot with precise paths.
- Player-visible and GM-only projections contain exactly the allowed fields.
- Section audience filtering occurs server-side.

### Persistence and import

- Atlas and Encyclopedia may use the same slug and UUID without ambiguous
  lookup.
- Encyclopedia import never writes `node`, `entity`, `edge`, or
  `lore_fragment`.
- Stable external keys preserve UUIDs across imports.
- Stale rows reconcile in dependency order.
- Failed validation and failed writes leave no partial Atlas or Encyclopedia
  state.
- Searchable content invalidates embeddings; relationship-only changes do not.
- Artifact identity changes when any imported collection changes.

### Applicability

- Global entries match every profile.
- `all`, `any`, and `none` pass full truth-table tests.
- Scope separation prevents a place tag from satisfying a participant term.
- Reference-identity terms match exact external keys.
- Exact Atlas associations return separate evidence.
- Recent use lowers ordinary candidates but not explicit mentions or origins.
- Same profile and seed produce the same ranking.
- Zero matches do not produce an error or closed-world instruction.

### Character origin

- The wizard lists only entries with the requested `characterRole`.
- GM-only entries cannot be chosen.
- The server rejects a reference in an Atlas field and an entity in a
  reference field.
- Overview and prompt names come from one mixed resolver.
- Persisted origin columns and props remain consistent.

### Chronicle start

- Location and anchor remain Atlas-only.
- Applicability is recomputed server-side.
- Preview exposes only player entries and player sections.
- Seed generation receives a bounded reference block.
- A custom seed can retrieve a relevant entry outside the initial match.
- Opening usage contains only verified supplied slugs.
- No reference ID enters Chronicle entity fields.

### GM runtime

- Search results always identify their namespace and `useAs` semantics.
- Open dispatches only opaque handles already returned or supplied to the
  session; malformed and unknown handles fail explicitly.
- Atlas records cannot enter reference sidecars, and Encyclopedia records
  cannot enter entity sidecars or focus.
- Unserved reference sidecar entries are discarded.
- Reference usage never updates entity focus.
- Entity mention spans take precedence over overlapping reference spans.
- Environment reference use stays private when not narrated.
- One-shot and agentic comparison paths receive equivalent reference coverage.
- Existing research-round, result, and total retrieved-token caps remain
  enforced.
- Reference misses support invention rather than asserting nonexistence.

### UI

- Atlas and Encyclopedia routes resolve duplicate slugs correctly.
- Dynamic facets come from imported vocabulary.
- Encyclopedia detail excludes GM sections.
- Encyclopedia entries have no Chronicle-start action.
- Atlas cross-links do not enter the Atlas map or relationship graph.
- Nearby Entities remains Atlas-only.
- Only exact narrated Encyclopedia mentions receive popovers.
- Keyboard, focus, and screen-reader behavior matches existing Atlas popovers
  and navigation.

### Branching and history

- Branches copy reference usage and mention history through the branch point.
- Repetition control reads the branched history, not later parent turns.
- Historical mention snapshots remain renderable after canon correction.

### Repository verification

Each phase runs its focused package tests. Before handoff, run the repository's
standard format, lint, typecheck, database, unit, client, and integration
verification through `make ci` or the current canonical equivalent.

No phase may weaken or suppress an existing test to accommodate mixed
namespace behavior.

## Observability and evaluation

Record counts and timings, not full hidden content:

- applicability candidates by source arm;
- Encyclopedia entries supplied in `WORLD-INDEX`;
- Encyclopedia results, opens, and misses through `lookup_world`;
- opened-to-used ratio;
- usage count and roles;
- distinct references per Chronicle;
- repeat rate over recent turns;
- zero-match rate;
- matcher and search duration;
- retrieved tokens attributable to references;
- Chronicle seed and opening reference counts;
- player visits from Atlas, Chronicle mentions, and direct search.

Compare representative Chronicles before and after integration for:

- ordinary material introduced per scene;
- repeated generic imagery;
- unsupported invented technology or ecology;
- direct player interaction with world material;
- retrieval cost and end-to-end turn time.

The goal is not maximum reference usage. It is more concrete, locally
appropriate material when the turn needs it.

## Content readiness gates

Before runtime cutover:

- Every selectable Chronicle location has explicit `contextTags`.
- Every completed entry has at least two cues, one affordance, one pressure,
  two variations, and global or contextual availability.
- Culture entries contain internal variation and avoid deterministic personal
  traits.
- Species and culture character options are player-visible and have character
  blurbs.
- Every selector and relationship endpoint resolves.
- Entries classified as Atlas or Encyclopedia have been reviewed individually;
  no kind-wide automatic reclassification remains.
- Player-facing contexts have enough breadth that the matcher does not return
  one repeated kind for every scene.

Initial authoring priority remains:

1. ordinary roles and practices;
2. place features and services;
3. resources, food, tools, and consumables;
4. common lifeforms;
5. vehicle classes;
6. resonant techniques and recurring phenomena;
7. missing technology.

## Risks and controls

### Reference material becomes another entity graph

Control: separate tables, stores, endpoints, relationships, usage, mentions,
and typed result semantics; the single GM retrieval facade does not create
`node` or generic `edge` rows or merge downstream state.

### Applicability becomes a closed-world rule system

Control: prompts and API semantics define matches as candidates; misses never
forbid invention; negative terms exclude one entry rather than close a
context.

### Tags become vague or overloaded

Control: imported context-tag vocabulary with declared scopes; topics remain a
separate field; selectors use exact tags or reference identity.

### The model receives more text but no more useful texture

Control: bounded candidate indexes, open-on-demand retrieval, recent-use
penalty, kind diversity, and opened-to-used telemetry.

### Common nouns steal named-entity links

Control: separate resolvers and stores; Atlas span precedence; Encyclopedia
mention resolution limited to served entries and exact aliases.

### GM-only content leaks through public APIs or turn payloads

Control: public projections and private usage storage; server-side visibility
and audience filtering; public mentions contain safe snapshots only.

### Canon classification removes something that should remain an Atlas actor

Control: review every current reference-like entry individually, validate the
final fresh snapshot before production, and reclassify the source entry before
cutover. The reset leaves no active Chronicle references to transform.

### New embeddings extend canon-seed runtime

Control: content-hash invalidation, bounded batching, separate counts and
timing, and no re-embedding for relationship-only changes.

## Decisions intentionally deferred

These do not block the first complete integration:

- Chronicle-local reference records for recurring inventions. Chronicle
  history remains canonical until measured retrieval failures justify another
  record type.
- In-game authoring or promotion of Encyclopedia entries. Promotion remains an
  explicit editorial change in `tsonu-canon`.
- A reference graph visualization. Typed relation lists ship first.
- Player-selected reference motifs during Chronicle start. The first version
  provides preview and grounding without another required choice.
- Renaming the `apps/atlas-api` deployment unit. Router and store separation is
  sufficient; a service rename would add deployment work without changing the
  domain boundary.

## Definition of complete

The integration is complete when:

- content authors can add or change Encyclopedia kinds without a game code
  change;
- authoritative import preserves separate Atlas, Encyclopedia, and guide
  namespaces atomically;
- character species and culture use Encyclopedia references exclusively;
- Chronicle start and the GM receive bounded, contextually appropriate
  reference material;
- actual use is durable and auditable but never becomes entity focus;
- players can browse and follow narrated entries without seeing private
  candidates;
- absence from the catalog never restricts invention;
- reference-class material is absent from the fresh Atlas graph;
- production was rebuilt from an empty Glass Frontier database and no legacy
  gameplay or operations rows were restored;
- repository and production validation pass with acceptable retrieval cost,
  latency, variety, and repetition.
