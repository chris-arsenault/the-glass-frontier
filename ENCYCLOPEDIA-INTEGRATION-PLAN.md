# Encyclopedia integration plan

Status: implemented and verified locally; production reset pending

Created: 2026-08-27

Updated from source and implementation: 2026-08-31

Sulion plan: `9f4946db-b23d-4f2b-9dac-e051812537cb`

Reviewed source: `tsonu-canon@48e77f513839`, site schema version 13

Production data strategy: reset the Glass Frontier production database and
rebuild it through the normal migration and seed path. Do not migrate or
restore legacy rows into the new schema.

The accepted domain and source contract live in
[the Encyclopedia reference catalog design](docs/design/encyclopedia-reference-catalog.md).
This file is the executable Glass Frontier plan.

## Outcome

Glass Frontier imports the authored Encyclopedia beside the Atlas and uses it
for character origin, Chronicle grounding, GM retrieval, and player browsing.
Reusable material never enters the named-entity graph.

The system preserves three namespaces:

| Namespace | Contains | Chronicle anchor | Mutable through play |
|---|---|---:|---:|
| Atlas | Particular places, people, factions, vessels, artifacts, and events | When eligible | Yes |
| Encyclopedia | Reusable types and recurring patterns | Never | No |
| Chronicle | Facts and inventions established in one play history | Never a global anchor | Within that Chronicle |

`Reference` is not a fourth namespace. It names how an Encyclopedia entry was
used or mentioned during play.

The runtime path is:

```text
tsonu-canon internal site bundle
              |
              v
       snapshot translator
        /       |        \
       v        v         v
    Atlas   Encyclopedia  context tags
       \        |        /
        \       v       /
         unified search/open
                |
          Chronicle GM
                |
     entity focus + reference usage
```

## Required boundaries

- Encyclopedia entries never become `HardState`, `node`, `entity`, `edge`, or
  `lore_fragment` records.
- The Encyclopedia has no relationship graph.
- Atlas `type_of` and membership declarations are classifications, not graph
  edges.
- Encyclopedia entries never become locations, anchors, scene subjects, front
  agents, entity-roster entries, entity-focus entries, or closer proposals.
- Named-entity resolution remains Atlas-only. Encyclopedia mention resolution
  never steals an Atlas span.
- A contextual match is a candidate, not proof that an instance is present.
- No match says nothing about what may exist. Players and the GM may invent new
  material.
- Topic tags never act as applicability tags.
- Character behavior is never inferred from species or culture.
- Player APIs exclude DM entries, GM sections, usage instructions, selection
  evidence, and private reference usage.
- Game code treats Encyclopedia kinds and subkinds as opaque strings.
- Model-facing retrieval uses slugs only. It never accepts or returns database
  UUIDs.

## Authoritative source state

Generate the source artifact in `../tsonu-canon` with:

```text
SITE_WORLD=glass-frontier make site-data
```

The current Glass importer already consumes:

```text
../tsonu-canon/build/site-internal/worlds/glass-frontier.json
```

That single file now contains the private Atlas records, context-tag registry,
and Encyclopedia bundle needed for the first integration.

At the reviewed revision:

- schema version: 13;
- internal Encyclopedia records: 283;
- complete and player-visible: 283;
- draft: zero;
- shell: zero;
- kinds: seven;
- context tags: 21, currently all place-scoped;
- global player entries: 79;
- contextual player entries: 204;
- Atlas primary `type_of` declarations: 290;
- Atlas additional memberships: 64;
- playable origins: five species and four cultures, all complete;
- GM-only whole Encyclopedia entries: zero currently;
- entries with GM prose sections: three.

`make check WORLD=glass-frontier` passes with zero errors, warnings, futures,
or conversions.

## Source findings that change the old plan

### No Encyclopedia relationship graph

The old plan proposed Encyclopedia relationship vocabularies and relationship
tables. The source deliberately removed that model.

An Atlas record may declare:

- one primary `encyclopedia_type`, sourced from `type_of`;
- repeatable `encyclopedia_memberships`, each carrying an Encyclopedia kind and
  external key.

The Encyclopedia export includes derived `instances` and `members` lists for
display. Glass persists the Atlas declarations and derives reverse queries. It
does not persist the reverse lists as separate authority.

### Seven opaque kinds

The source merged the earlier practice, institution, vehicle, and place-feature
ideas into seven kinds:

- `lifeform`
- `role`
- `technology`
- `resource`
- `ability`
- `phenomenon`
- `culture`

The internal bundle does not export kind descriptions, classification
definitions, field definitions, tier definitions, or a relationship
vocabulary. The game therefore derives facets from imported entries and does
not add vocabulary tables.

### Status policy is dormant for the current corpus

The schema supports draft and shell entries, but the completed content set has
neither. The runtime still excludes drafts and shells from proactive context
and excludes shells from retrieval, so later partial authoring does not require
a game schema change. These statuses do not otherwise affect this cutover.

### Sections have no independent identity

Encyclopedia sections carry heading, text, and audience but no stable source
key. This is intentional. The importer replaces the complete ordered section
array with its owning entry, so no `encyclopedia_section` table or positional
reconciliation is needed.

### Guide pages are a separate source surface

`Life in the System` and the home page are emitted in the public multi-file site
tree, not the internal single-file bundle. Guide ingestion is outside this
integration. The initial World Guide has Atlas and Encyclopedia surfaces only.
Adding Guides later requires either an internal guide collection in Tsonu or an
explicit second artifact input.

## Glass data contract

### Imported source slice

Extend `TsonuBundle` and `TsonuEntry` in
`packages/worldstate/src/tsonuBundle.ts` to parse the fields that now exist:

```ts
type TsonuBundle = {
  schema_version: number;
  revision: string;
  context_tags: TsonuContextTag[];
  encyclopedia: {
    entries: TsonuEncyclopediaEntry[];
  };
  entries: Record<string, { entry: TsonuEntry }>;
};

type TsonuEntry = {
  // existing fields
  context_tags: string[];
  encyclopedia_type: string | null;
  encyclopedia_memberships: Array<{
    kind: string;
    external_key: string;
  }>;
};
```

Define the full Encyclopedia source shape from the reviewed schema in the
durable design. Parse it with Zod rather than casting raw JSON to a TypeScript
type. `status: 'shell'` makes summary, availability, and prevalence nullable.

### Runtime DTOs

Add shared DTOs under `packages/dto/src/world` for:

- `EncyclopediaEntry`;
- `EncyclopediaEntrySummary`;
- `EncyclopediaAvailability` and selectors;
- `ContextTagDefinition`;
- `EncyclopediaClassification`;
- public list, detail, applicability, and character-option responses;
- reference usage and public mention snapshots.

The runtime entry maps source names to camelCase:

```ts
type EncyclopediaEntry = {
  id: string; // internal persistence only
  externalKey: string;
  slug: string;
  title: string;
  aliases: string[];
  kind: string;
  subkind: string;
  status: 'shell' | 'draft' | 'complete';
  dm: boolean;
  summary?: string;
  topics: string[];
  availability?: EncyclopediaAvailability;
  prevalence?: 'common' | 'uncommon' | 'rare';
  characterRole?: 'species' | 'culture';
  originBlurb?: string;
  facts: Record<string, string | number>;
  descriptiveIdentity: Record<string, string>;
  tiers: EncyclopediaAbilityTier[];
  usage: EncyclopediaUsage;
  sections: EncyclopediaSection[];
};
```

Database IDs remain internal. Player APIs may use them where existing
application persistence requires them. GM prompts, tool parameters, tool
results, indexes, and sidecars never include them.

## Persistence

Keep the first implementation small. The reviewed corpus has 283 records and
does not require a normalized rule engine.

### Tables

Add `encyclopedia_entry`:

- UUID primary key;
- source and stable `external_key`;
- unique bare `slug` within the Encyclopedia namespace;
- title and aliases;
- opaque kind and subkind;
- status and DM flag;
- nullable summary, availability, and prevalence;
- topics;
- character role and origin blurb;
- facts, descriptive identity, tiers, usage, and sections as JSONB;
- source revision and timestamps.

Store the 1,024-dimension search embedding, model name, and update time directly
on `encyclopedia_entry`. The embedding document contains title, kind, subkind,
summary, facts, descriptive identity, and usage.

Add `reference_context_tag` from the imported context-tag registry:

- tag id;
- description;
- scopes;
- optional parent;
- compatible tags.

Add `atlas_encyclopedia_classification`:

- Atlas entity FK;
- Encyclopedia entry FK;
- role: `type` or `membership`;
- membership kind when role is `membership`;
- import metadata.

Constraints permit one primary type per Atlas entity and reject duplicate
memberships. This table never enters Atlas graph traversal.

Add `entity.context_tags text[] not null default '{}'` with a GIN index. These
values come directly from the source bundle.

Add three columns to `chronicle_turn`:

- `player_reference_slugs text[]`;
- `reference_usage jsonb` containing qualified Encyclopedia slugs and roles;
- `reference_mentions jsonb` containing exact spans and safe title/summary snapshots.

The existing turn copy transaction carries these fields when branching.

### Store boundary

Add `EncyclopediaStore` in `packages/worldstate`. It owns:

- exact external-key and slug reads;
- list/search reads;
- complete-entry applicability reads;
- Atlas classification and reverse-list reads;
- character-role reads;

`WorldSchemaStore` continues to own Atlas entities, graph relationships, lore,
and entity embeddings. The cross-source GM facade composes both stores without
merging their persistence interfaces.

### Applicability implementation

Store authored availability as JSONB. Load the bounded complete-entry set and
evaluate selectors in application code. Do not create selector and selector-term
tables initially.

The matcher:

- excludes shell, draft, and DM entries from proactive player-visible use;
- includes complete global entries;
- evaluates `all`, `any`, and `none` exactly;
- validates term scope against the imported tag registry;
- supports Encyclopedia-identity terms even though the current corpus does not
  use them;
- unions exact applicability with direct classifications of the active Atlas
  record;
- orders Chronicle prompt material deterministically, preferring direct and
  contextual entries while preserving kind variety;
- remains deterministic for the same Chronicle, turn, and context.

The initial context profile uses the current location's imported place tags.
The contract can later add world, scene, and participant terms without changing
storage.

## Authoritative import

### Artifact

Replace `tsonuCanonProposal.json` with an authoritative
`tsonuCanonSnapshot.json` containing:

- the existing Atlas proposal;
- context-tag definitions;
- all Encyclopedia records;
- Atlas classifications;
- source schema version and revision;
- a content-derived source ID covering every collection.

The snapshot translator is import-only. Chronicle closer proposals continue to
use the existing mutable `CanonProposal` contract and cannot create or edit
Encyclopedia records.

### Validation

Reject artifact generation before writing the checked-in snapshot when:

- the bundle schema does not carry the reviewed fields;
- required collections are missing;
- external keys or slugs duplicate within a namespace;
- a non-shell entry lacks summary, availability, or prevalence;
- a complete entry lacks its usage requirements;
- a shell contains character-origin behavior;
- a selector uses an unknown context tag or an invalid scope;
- an Atlas classification target is missing;
- a membership kind does not match its target entry kind;
- a character role is not on a complete, non-DM entry with `origin_blurb`;
- a section lacks a valid audience;
- an Atlas source entry would still be imported from the Encyclopedia
  collection.

Allow the same bare slug in Atlas and Encyclopedia. That is a valid
cross-namespace collision handled by qualified tool slugs.

### Transaction

Add an authoritative `commitSnapshot` path in `CanonWriter`:

1. Begin one database transaction.
2. Record the ingest batch.
3. Upsert context tags.
4. Upsert Encyclopedia records.
5. Upsert Atlas entities and context tags.
6. Resolve and write Atlas classifications.
7. Write Atlas relationships and lore.
8. Reconcile stale imported classifications, Encyclopedia records, context
   tags, Atlas relationships, lore, and entities.
9. Mark the batch committed.
10. Commit.

An unresolved classification rolls back the entire snapshot.

The production reset removes any need for legacy entity-to-reference
conversion. Authoritative reconciliation still matters for later canon imports.

### Embeddings

Backfill Encyclopedia embeddings through the existing deployment embedding
step. Hash the complete search document so relationship-free metadata changes
invalidate only affected entries.

Complete entries receive embeddings. The store retains the status filters
needed to omit future shells and keep future drafts out of proactive matching.

## Character origin

Change the mixed origin contract to name its namespaces:

```ts
type CharacterOrigin = {
  speciesReferenceId: string;
  cultureReferenceId: string;
  homelandId: string;
  allegianceId: string;
  allegianceStance: AllegianceStance;
};
```

Species and culture resolve through `EncyclopediaStore`; homeland and allegiance
resolve through `WorldSchemaStore`.

Update:

- `packages/dto/src/Character.ts`;
- character persistence and Chronicle props;
- `apps/chronicle-api` validation and seed services;
- prompt views;
- Character Creation Wizard;
- Character Overview.

The server validates character role and visibility. Prompts receive resolved
title, origin blurb, summary, and relevant identity prose, never UUIDs.

The production reset means there is no existing-character conversion path.

## Chronicle creation

Location and anchor selection stay Atlas-only. Encyclopedia material enriches
the existing flow without adding another required choice.

For the selected location:

1. Build a place context from imported `contextTags`.
2. Match complete player-visible Encyclopedia entries.
3. Include any complete type or membership directly associated with the
   selected Atlas location or anchor.
4. Show the complete player-safe applicable set in the `Common here` browser.
5. Rank a small, varied subset of those visible entries for prompt context.
6. Supply that subset to seed and opening generation.
7. Record only references actually used by the generated opening.

Render `Common here` with the same contextual-reference tree used during play.
In Chronicle creation it runs in browse-only mode because there is no pending
player message to attach a reference to.

Seed and opening generation receive compact title, kind, summary, cues,
affordances, pressures, and variations. An opening sidecar returns qualified
Encyclopedia slugs and usage roles. The server accepts only entries it supplied.

## GM retrieval

### Two cross-source tools

Keep the existing names `search` and `open`:

```ts
search({ query: string })
open({ slug: string })
```

Both tools cover Atlas, Encyclopedia, and Chronicle history.

Search results contain:

```ts
type SearchResult = {
  slug: string;
  title: string;
  kind: string;
  excerpt: string;
};
```

`slug` is always fully qualified:

- `atlas:blue-meridian`
- `encyclopedia:flitter`
- `chronicle:turn-12`

There is no separate source field, UUID, opaque handle, or model-side string
construction. The result's slug is copied directly into `open`.

Search fans out internally:

- Atlas entity embeddings and lore text;
- Encyclopedia embeddings and exact/title/alias search;
- Chronicle turn full-text search.

Each corpus applies its own threshold. Merge bounded results with exact matches
first; do not compare raw similarity scores from different indexes. Atlas lore
matches return the owning Atlas entity slug.

`open` resolution:

- qualified slug: query only the named store;
- bare slug with one match across stores: open it;
- bare slug with multiple matches: return an ambiguity error containing the
  qualified alternatives;
- no match: throw a retrieval miss;
- no qualified fallback to another store.

Opening an Atlas entity returns its useful identity, notes, facts, lore, and
related qualified slugs. Opening an Encyclopedia entry returns its GM-visible
facts, identity, tiers, usage, sections, and classified Atlas examples. Opening
a Chronicle turn returns the established player and GM record.

Retire source-specific `search_lore`, `read_lore`, `search_history`,
`read_turns`, `expand`, and relationship-reading tools only after `search` and
`open` cover their required information. Do not rename `search` to
`lookup_world`.

### Seed index and provenance

`WORLD-INDEX` contains fully qualified slugs for its Atlas and complete
Encyclopedia entries. Encyclopedia lines state that the entry is reusable
material, not an asserted instance. `HISTORY` remains the recent Chronicle
record.

`ToolSession` records served material by qualified slug and how it was served:
index, search, or open. Internally it may resolve database IDs, but none appear
in model input or output.

Extend `TurnBrief` with a distinct Encyclopedia sidecar:

```ts
type ReferenceSidecarEntry = {
  slug: string;
  role: 'texture' | 'interaction' | 'character_origin' | 'instance_basis';
};
```

The server resolves each qualified slug against the session. Reference roles
never map to entity `mentioned` or `central` and never update entity focus.

### Mention resolution

Resolve Atlas spans first. Resolve Encyclopedia spans only from entries served
this turn and only through exact titles or aliases. Do not perform whole-catalog
semantic mention classification over common nouns.

Public mention payloads contain a safe title, qualified slug, kind, and summary
snapshot. Private candidates never appear in player turn data.

### One-shot and Environment paths

The tool-free Environment node and one-shot comparison receive bounded complete
Encyclopedia context from the same matcher. This does not add an LLM call.

Record private usage when the Environment path materially uses a reference,
even if no public text span names it. Emit a public mention only for visible
narration.

## API and UI

Use `World Guide` as the navigation container with two surfaces:

- Atlas
- Encyclopedia

`Reference` is not a page. `Guides` are deferred because the current internal
source artifact does not contain them.

### Player API

Add an Encyclopedia router and client for:

- list/search summaries;
- detail by slug;
- complete applicable entries for a canonical Atlas context;
- classifications for an Atlas entity;
- Atlas examples for an Encyclopedia entry;
- character-role options.

The applicable-entry response remains a flat list of qualified-slug summaries.
The reusable client browser groups that list by kind and prevalence; the API
does not introduce a second tree-shaped content contract.

The server builds context from canonical records. It does not accept arbitrary
client-supplied context tags.

Public projections exclude:

- shell and DM entries;
- GM sections;
- usage arrays;
- private usage history.

Drafts are visible and labeled but do not appear in `Common here`.

### Encyclopedia UI

Add `/encyclopedia/:slug?` beside `/atlas/:slug?`.

The index provides:

- text search;
- facets derived from imported kind and subkind values;
- topic and prevalence filters;
- draft labels;
- compact cards;
- a non-exhaustive empty state.

The detail page shows:

- title, summary, kind, subkind, prevalence, and topics;
- public facts and descriptive identity;
- player sections;
- named Atlas instances and members;
- links back to associated Atlas records.

There is no `Start Chronicle` action on an Encyclopedia entry and no reference
graph visualization.

### Contextual reference browser

Add one reusable `ContextReferenceBrowser` for complete, player-visible entries
applicable to a canonical Atlas context. Mount it in two places:

- as the `Common here` preview during Chronicle creation;
- in the Chronicle left rail, immediately below the named Atlas items in
  `Nearby entities`.

The browser is a three-level tree:

1. kind;
2. rarity, using the source `prevalence` value;
3. Encyclopedia entry.

Kind and rarity branches support independent expand/collapse. Rarity groups
sort `common`, `uncommon`, then `rare`; entry labels sort by title. The browser
updates when the Chronicle's canonical location context changes. It presents
every complete, player-safe match returned for that context, but remains a
non-exhaustive claim about what can exist there.

A single click on an entry opens its Encyclopedia detail in the shared World
Guide modal. The same modal presenter opens Atlas content for named Atlas items,
using the item's qualified slug to choose the surface.

Generalize the existing `AtlasModal` and its UI-store state into this
qualified-slug World Guide modal. Do not mount independent Atlas and
Encyclopedia modals that can compete for global overlay state.

During Chronicle play, double-clicking or right-clicking an Encyclopedia entry
attaches it to the pending player message as a direct reference. The shared
interaction handler distinguishes a single click from a double click so the
modal does not open when the player's intent is to attach. The context-menu
handler prevents the browser menu and performs the same attachment action.
Chronicle creation mounts the tree without attachment gestures.

Generalize the existing Atlas-only composer target state and request field into
a mixed direct-reference list of qualified slugs. Attached Atlas and
Encyclopedia references appear as the same removable composer chips. On submit,
the server resolves each qualified slug in its declared store and supplies the
resolved material to the GM; Encyclopedia references never enter entity focus
or Atlas relationship state.

Atlas detail pages show type and membership references as a separate
classification section. These links do not enter Atlas maps, relationship
lists, Nearby Entities, focus, or start actions.

Actual narrated Encyclopedia mentions receive a distinct popover and link.
Only the explicit player-safe `Common here` projection appears in the Chronicle
UI. Additional GM candidates and private usage do not.

## Production reset

After implementation and repository verification:

1. Reset the Glass Frontier production database.
2. Run schema migrations.
3. Seed application data.
4. Deploy the application.
5. Seed the authoritative canon snapshot.
6. Backfill Atlas and Encyclopedia embeddings.

Do not add a legacy migration, snapshot, restoration path, or compatibility
shim.

## Implementation phases

### Phase 1: Contract and storage foundation

- Add source-bundle Zod parsing for schema version 13 fields.
- Add runtime Encyclopedia DTOs with opaque kind/subkind strings.
- Add migrations for entries, embeddings, context tags, classifications,
  context tags on Atlas entities, usage, and mentions.
- Add the Postgres-backed `EncyclopediaStore` beside the Atlas store.
- Add JSON applicability evaluation.

Exit: the reviewed source shapes round-trip through DTO and store tests without
creating Atlas nodes or edges.

### Phase 2: Authoritative snapshot import

- Replace the proposal artifact with the mixed snapshot.
- Extend the translator for context tags, Encyclopedia entries, and Atlas
  classifications.
- Validate complete, draft, shell, selector, character-role, and classification
  invariants.
- Commit and reconcile the whole snapshot atomically.
- Include all collections in artifact identity.

Exit: a fresh database imports revision `48e77f513839` with the measured source
counts and every classification resolved.

### Phase 3: Imported corpus audit

- Confirm 283 complete entries and no draft or shell entries.
- Confirm 290 primary and 64 membership classifications resolve.
- Confirm five species and four culture choices.
- Confirm every playable Chronicle location has context tags.
- Confirm no former reference-class source entry appears as an Atlas entity.
- Generate Encyclopedia embeddings for all 283 complete entries.

Exit: database counts and visibility match the source artifact exactly.

### Phase 4: Character origin cutover

- Replace species and culture Atlas fields with Encyclopedia references.
- Keep homeland and allegiance Atlas-only.
- Update persistence, APIs, prompts, wizard, and overview.

Exit: a new character can be created with each mixed-namespace field validated
against its owning store.

### Phase 5: World Guide and Chronicle start

- Add Encyclopedia player API and UI.
- Add Atlas classification links.
- Add the reusable kind / rarity / entry context tree.
- Mount it as a browse-only `Common here` preview during Chronicle creation and
  below named Atlas items in the live Chronicle rail.
- Open Atlas and Encyclopedia records through the shared qualified-slug modal.
- Ground seed and opening generation in complete entries.
- Persist verified opening usage.

Exit: players can browse both catalogs and start a grounded Chronicle without
selecting an Encyclopedia entry as an anchor.

### Phase 6: GM retrieval integration

- Make `search` cross-source and return fully qualified slugs.
- Make `open` cross-source and accept the returned slug verbatim.
- Add bare-slug uniqueness and ambiguity behavior.
- Remove GUIDs and separate source fields from the model-facing contract.
- Add complete Encyclopedia entries to `WORLD-INDEX`.
- Add slug-based served provenance and the reference sidecar.
- Replace the Atlas-only composer target field with mixed qualified-slug direct
  references and resolve each attachment through its owning store.
- Wire Encyclopedia tree double-click and right-click to the shared composer
  attachment action without triggering the single-click modal.
- Add usage persistence, mention resolution, Environment context, and one-shot
  parity.
- Retire superseded source-specific tools after coverage tests pass.

Exit: Atlas, Encyclopedia, and Chronicle material are discoverable through
`search` and readable through `open`; reference use never changes entity focus.

### Phase 7: Fresh Atlas cutover

- Verify source Encyclopedia entries are absent from the generated Atlas
  collection.
- Verify classifications do not appear as graph edges.
- Remove obsolete game vocabulary and assumptions tied to former reference
  entities.
- Keep general guide ingestion deferred.

Exit: the fresh snapshot contains one coherent Atlas and one coherent
Encyclopedia with no compatibility layer.

### Phase 9: Production database reset

- Run the six reset and seed steps above.

Exit: production runs only the new schema and source snapshot.

## Verification matrix

### Source and import

- Schema 13 bundle parses through Zod.
- Duplicate external keys and same-namespace slugs reject the artifact.
- Cross-namespace duplicate bare slugs are accepted.
- Shell nullability is accepted; shell content and character roles are not.
- Complete-entry requirements are enforced.
- Draft incompleteness does not fail import.
- Every context tag and classification target resolves.
- Membership kinds match targets.
- Failed writes leave no partial catalog.
- Artifact identity changes with any imported collection.

### Persistence

- Encyclopedia import writes no `node`, `entity`, `edge`, or `lore_fragment`.
- Shells persist but are absent from all retrieval paths.
- Drafts are absent from proactive matching.
- Classification reverse reads reproduce source instances and members.
- Stale records reconcile in dependency order.
- Embeddings invalidate only when their search document changes.

### Character origin

- The wizard lists only complete, non-DM entries with the requested role.
- The server rejects an Atlas ID in a reference field and a reference ID in an
  Atlas field.
- Prompts receive resolved names and prose, not IDs.

### Chronicle start

- Location and anchor remain Atlas-only.
- Applicability is recomputed server-side.
- Preview contains complete player-visible entries only.
- Preview uses the reusable kind / rarity / entry tree in browse-only mode.
- Every entry supplied to opening generation came from the visible tree.
- Opening usage contains only supplied qualified slugs.
- No reference enters Chronicle entity fields.

### Context browser and direct references

- The same browser renders during creation and below `Nearby entities` during
  play.
- Kind and rarity branches expand and collapse independently.
- A single entry click opens the correct Atlas or Encyclopedia modal from its
  qualified slug.
- Double-click and right-click attach an Encyclopedia entry without also
  opening the modal.
- Composer chips and the turn request preserve qualified slugs and accept both
  Atlas and Encyclopedia attachments.
- Encyclopedia attachments reach GM context and usage tracking but never
  entity focus or Atlas graph updates.

### GM runtime

- Search results contain fully qualified slugs and no ID or source field.
- `open` accepts a search result slug without transformation.
- Qualified open never falls back.
- Unique bare open succeeds across stores.
- Ambiguous bare open returns qualified alternatives.
- Lore matches resolve to an openable Atlas slug.
- Chronicle results use readable turn slugs.
- Unserved reference sidecars are discarded.
- Reference usage never updates entity focus.
- Atlas mention spans take precedence.
- Existing round and retrieved-token budgets remain enforced.
- A miss supports invention and never becomes a nonexistence claim.

### Player boundary

- Shell and DM entries are absent.
- GM sections and usage instructions are absent.
- Drafts are labeled and never shown as `Common here`.
- Duplicate bare slugs route correctly because UI routes state the catalog.
- Atlas classifications do not enter graph or Nearby Entities.
- Only exact narrated mentions receive popovers.

### Repository checks

Run focused tests during each phase. Before implementation handoff, run the
repository's normal lint, format, typecheck, database, unit, client, and
integration checks through `make ci` or its current canonical replacement.

## Observability

Record counts and timings, not hidden prose:

- imported entries by status and kind;
- imported entry and classification counts;
- applicability candidates and selected complete entries;
- cross-source search results by slug prefix;
- open calls and misses;
- bare-slug ambiguities;
- opened-to-used ratio;
- reference usage roles;
- repeat rate over recent turns;
- matcher, search, and open duration;
- retrieved tokens attributable to Encyclopedia entries.

The goal is concrete, locally appropriate material when a turn needs it, not
maximum reference usage.

## Risks and controls

### Encyclopedia becomes another entity graph

Control: separate storage, a classification table rather than edges, no
`HardState`, and separate reference usage from entity focus.

### Drafts recreate thin narration

Control: drafts remain available to explicit search/open but cannot enter
automatic context, starts, or `WORLD-INDEX`.

### Shells leak empty records

Control: persist them solely for classification integrity and exclude them in
the store's shared visible-query predicate.

### Applicability becomes a closed-world rules engine

Control: matches are candidates, misses never forbid invention, and the small
JSON matcher implements only authored selectors.

### Common nouns steal named-entity links

Control: Atlas span precedence and exact served-entry titles or aliases only.

### GM material leaks to players

Control: server-side entry and section projection; player APIs never return
usage arrays or selection evidence.

### Future kind changes require a game deployment

Control: kinds and subkinds are opaque strings, facets derive from data, and
compound facts and tiers remain authored JSON.

### Guide content silently disappears

Control: Guides are explicitly out of scope until the authoritative import has
a defined guide input. Do not pretend the current internal bundle contains it.

## Definition of complete

- The schema-13 Tsonu snapshot imports Atlas, Encyclopedia, classifications,
  and context tags atomically.
- Encyclopedia material is absent from Atlas nodes, lore, edges, focus, and
  anchors.
- Status visibility policy remains enforced even though the current corpus is
  entirely complete.
- Character species and culture use Encyclopedia references exclusively.
- Chronicle start uses complete applicable material without another required
  choice.
- `Common here` is one reusable tree in Chronicle creation and the live left
  rail, grouped by kind, rarity, and entry.
- Players can open a tree entry or attach it directly to their next message
  through the same composer reference path used for Atlas material.
- `search` and `open` cover Atlas, Encyclopedia, and Chronicle with fully
  qualified slugs and no model-facing IDs.
- Actual usage is durable and auditable but never becomes entity focus.
- Players can browse and follow public entries without seeing private material.
- Absence from the catalog never restricts invention.
- Production was rebuilt from an empty database and seeded from the new
  authoritative snapshot.
