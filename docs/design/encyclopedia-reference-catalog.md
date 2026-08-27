# Encyclopedia reference catalog

Status: accepted design direction; not yet implemented.

The Encyclopedia is a separate catalog of reusable world material. It
complements the Atlas without adding common organisms, technologies, customs,
vehicle classes, or other background texture to the named-entity graph.

The durable distinction is:

- The Atlas contains a particular thing that can participate in history.
- The Encyclopedia contains a reusable type, practice, material, organism, or
  pattern that can be instantiated in scenes.
- A Chronicle-local reference contains something invented during play that is
  true for that Chronicle but has not been promoted into world canon.

This boundary prevents Encyclopedia entries from becoming Chronicle anchors,
focus candidates, named actors, or accidental graph hubs. They remain
searchable through the same GM retrieval facade as Atlas and Chronicle
history, with their source and reusable semantics identified on every result.

## Current problem

`tsonu-canon` already distinguishes World Atlas kinds from Player Reference
kinds, but both groups are implemented as entities. The current Player
Reference kinds are `species`, `culture`, `ability`, `resource`,
`phenomenon`, and `concept`.

The bundled canon currently contains:

- 559 entities.
- 1,402 relationships.
- 2,033 lore fragments.
- 141 entities in the six Player Reference kinds, about 25 percent of the
  entity collection.
- 486 relationships touching those entries, about 35 percent of the
  relationship collection.
- 40 relationships from one Player Reference entry to another.

The importer turns every source entry into `HardState`, every prose section
into entity lore, and every source connection into an Atlas relationship. The
result combines two different ontologies:

- Named participants with facts, temporal relationships, prominence, scene
  identity, and mutable play history.
- General reference material such as species, cultures, techniques, resources,
  and technologies.

Offerability filters hide many reference kinds from the Chronicle focus
picker, but filtering does not remove them from entity search, semantic
retrieval, graph traversal, or authoring pressure. General technologies and
species remain highly connected entity hubs.

Current tags cannot safely drive Encyclopedia applicability. Source entry tags
are copied to lore fragments and mean what an article discusses, such as
`ecology`, `trade`, `surface`, or `resonance`. They do not mean that the subject
can appear in every location carrying the same label.

## Ontology

| Concern | Atlas | Encyclopedia | Chronicle-local reference |
|---|---|---|---|
| Represents | One particular participant, place, object, event, or institution | A reusable type or recurring pattern | Something established only in one Chronicle |
| Chronicle anchor | May be eligible | Never | Never |
| GM retrieval result | `atlas`, particular | `encyclopedia`, reusable | `chronicle`, Chronicle evidence |
| Relationships | Factual and often temporal world relationships | Type-level and applicability relationships | Local continuity |
| Changes through play | Yes | No | Within its Chronicle |
| Lore fragments | Yes | No | Chronicle record only |
| Examples | Ironwhistle, Blue Meridian, Counterweight Road Rig | Shear dragons, flitters, marn, tuning compasses | A player-invented whisper coil |
| Promotion | Already world canon | Already world reference canon | Explicit editorial promotion |

Two tests classify an entry.

First, ask whether two independent examples can coexist. If they can, the
subject is probably an Encyclopedia entry.

Second, ask whether this particular thing can independently make decisions,
change ownership, be damaged, disappear, become a scene subject, or anchor a
Chronicle. If it can, it belongs in the Atlas even when it uses common
technology.

The tests produce the following results for current canon:

- Marn is a reusable animal type and moves to the Encyclopedia.
- Flitter is a vehicle class and moves to the Encyclopedia.
- Ironwhistle is a named, individually tracked creature and stays in the Atlas.
- Blue Meridian is a particular vessel and stays in the Atlas.
- Counterweight Road Rig is one historically tracked equipment set owned and
  operated by the Counterweight, so it stays in the Atlas.
- Tuning compasses, kinetic horns, Remote Cutting, and KITE technology move to
  the Encyclopedia.
- A specific prototype compass, named instrument, or historically important
  KITE array stays in the Atlas and can link to its Encyclopedia type.

Migration cannot be a bulk mapping from existing kinds or source directories.

## Encyclopedia kinds

The first contract should support ten kinds:

- `lifeform`: sapient species, animals, plants, fungi, microbes, and anomalous
  life.
- `culture`: distributed learned traditions, norms, practices, and material
  expressions.
- `role`: ordinary unnamed people defined by work or social function, such as
  herders, route keepers, dockhands, Readers, Ratters, and couriers.
- `practice`: crafts, customs, rites, maintenance routines, exchange
  conventions, and institutional methods.
- `technique`: learned resonant forms, incantations, trained procedures, and
  innate expressions.
- `technology`: device classes, tools, instruments, infrastructure systems, and
  technical processes.
- `vehicle_class`: ship, flitter, hauler, surface craft, and orbital craft
  classes.
- `resource`: materials, commodities, food, medicines, biological products,
  fuel, and useful data.
- `phenomenon`: recurring physical, ecological, weather, social, or resonant
  conditions.
- `place_feature`: ordinary scene components such as berth frames, route
  boards, livestock yards, sounding stations, public kitchens, pressure locks,
  and repair stalls.

`concept` should not remain a catch-all. A concept with direct scene
consequences becomes a technique, practice, technology, or phenomenon. Pure
explanatory material remains a non-runtime page.

Mechanically defined moves and skills remain game mechanics. Setting-specific
knowledge such as Remote Cutting belongs in the Encyclopedia.

## Species and culture

Broad species and cultures belong in the Encyclopedia.

Use `species` for physiology, senses, embodied needs, inherited capacities,
and biological variation. Use `culture` for learned practices, institutions,
values, language, material life, and internal disagreements. Do not use
`race` as a contract term.

Neither species nor culture is an actor. A Sitharian person is an individual;
Sitharian culture is shared reference material. A Sitharian government,
community, household, movement, or military body that takes action belongs in
the Atlas as a particular entity.

Culture entries require stricter authoring validation:

- Require multiple forms or internal variations.
- Describe practices and pressures, not deterministic personality.
- Do not infer individual behavior from culture membership.
- Put political agency in specific communities and institutions.
- Permit characters to adopt, reject, combine, or reinterpret practices.

Character origin should name its two namespaces directly:

~~~ts
type CharacterOrigin = {
  speciesRefId: string;
  cultureRefId: string;
  homelandEntityId: string;
  allegianceEntityId: string;
  allegianceStance: AllegianceStance;
};
~~~

Species and culture resolve through the Encyclopedia reader. Homeland and
allegiance resolve through the Atlas reader. The implementation should replace
the current mixed lookup rather than adding fallback behavior.

## Export contract

The proposed contract between `tsonu-canon` and Glass Frontier is:

~~~ts
type EncyclopediaKind =
  | 'lifeform'
  | 'culture'
  | 'role'
  | 'practice'
  | 'technique'
  | 'technology'
  | 'vehicle_class'
  | 'resource'
  | 'phenomenon'
  | 'place_feature';

type ContextScope =
  | 'world'
  | 'place'
  | 'scene'
  | 'participant';

type ContextTerm =
  | {
      scope: ContextScope;
      tag: string;
    }
  | {
      scope: ContextScope;
      referenceExternalKey: string;
    };

type ContextSelector = {
  all: ContextTerm[];
  any: ContextTerm[];
  none: ContextTerm[];
};

type Availability =
  | {
      mode: 'global';
    }
  | {
      mode: 'contextual';
      selectors: [ContextSelector, ...ContextSelector[]];
    };

type EncyclopediaEntry = {
  externalKey: string;
  slug: string;
  title: string;
  aliases: string[];

  kind: EncyclopediaKind;
  subkind: string;
  status: 'draft' | 'complete';

  summary: string;

  /** Search, navigation, and subject classification only. */
  topics: string[];

  availability: Availability;
  prevalence: 'common' | 'uncommon' | 'rare';

  characterRole?: 'species' | 'culture';

  usage: {
    /** Concrete evidence that this reference is present in a scene. */
    cues: string[];

    /** Things players can do with, learn from, or exploit. */
    affordances: string[];

    /** Costs, failure modes, tensions, or changing conditions. */
    pressures: string[];

    /** Distinct manifestations that prevent repetitive rendering. */
    variations: string[];
  };

  sections: Array<{
    heading: string;
    text: string;
    audience: 'player' | 'gm';
  }>;
};

type ReferenceEndpoint = {
  namespace: 'atlas' | 'encyclopedia';
  externalKey: string;
};

type ReferenceRelationship = {
  relationship:
    | 'instance_of'
    | 'variant_of'
    | 'requires'
    | 'made_from'
    | 'produces'
    | 'used_with'
    | 'preys_on'
    | 'symbiotic_with'
    | 'practiced_by'
    | 'common_at'
    | 'maintained_by'
    | 'originated_at';
  src: ReferenceEndpoint;
  dst: ReferenceEndpoint;
  note?: string;
};

type EncyclopediaBundle = {
  entries: EncyclopediaEntry[];
  relationships: ReferenceRelationship[];
};
~~~

The persisted game record can add a UUID and source revision.
`externalKey` remains the stable canon identity.

The following omissions are intentional:

- No `facts`.
- No `gmNotes`.
- No `prominence`.
- No `playableAs`.
- No `isLocation`.
- No positions or route geometry.
- No temporal `since` or `till`.
- No `LoreFragment`.
- No ordinary Atlas `links`.

Sections contain canonical reference prose, but they are not append-only lore
fragments. Play does not mutate an Encyclopedia entry.

Reference relationships form a separately queried reference graph. They never
become rows in the ordinary Atlas edge graph, and Encyclopedia entries have no
minimum relationship count.

## Context tags and applicability

Three fields have separate purposes:

| Field | Meaning |
|---|---|
| `topics` | What an entry discusses; used for browsing and semantic search |
| `contextTags` | Properties of the current world, place, scene, or participant |
| `availability.selectors` | Conditions under which a reference is a useful candidate |

Atlas entities need a first-class `contextTags` field. The implementation must
not infer applicability from lore-fragment tags.

Example context tags include:

- `realm:surface`
- `realm:orbital`
- `biome:steppe`
- `biome:ocean`
- `population:sparse`
- `infrastructure:landing_pad`
- `industry:salvage`
- `resonance:kinetic_active`
- `activity:travel`
- `activity:repair`
- `condition:glassfall`

The tag registry defines each tag, its allowed scopes, and any explicit parent
or compatibility information. A tag has no hidden mechanical effect.

A context profile is the set of contextual terms used for one retrieval. It is
built from:

- `world`: the selected setting.
- `place`: the current location and its containment ancestors, not arbitrary
  graph neighbors.
- `scene`: the current activity and conditions.
- `participant`: present or directly relevant Atlas entities, character
  species and culture references, and active affiliations.

Each selector is an alternative. Within one selector:

- Every `all` term must match.
- At least one `any` term must match unless `any` is empty.
- No `none` term may match.

Use reference identity when a tag would be dishonest. A Sitharian cultural
practice should match the participant's Sitharian culture reference instead of
creating a `culture:sitharian` pseudo-tag.

An illustrative `tsonu-canon` authoring form is:

~~~ruby
encyclopedia :marn do
  name "Marn"
  kind :lifeform
  subkind :animal
  summary "Broad-footed herd animals..."

  topics :ecology, :trade, :resonance
  prevalence :common

  appears_when(
    all: { place: [:"realm:surface", :"biome:steppe"] },
    any: { place: [:"land_use:pastoral", :"population:sparse"] },
    none: { scene: [:"condition:sealed_interior"] }
  )

  cue "A whole tether line turns toward the same patch of empty ground."
  cue "Broad flexible feet leave shallow crescent prints in wet clay."
  affordance "Herders use herd movement as an early warning, never as a survey."
  pressure "A changed machine rhythm can unsettle every animal in a pen."
  variation "Road herds carry seasonal household marks on shedding horn."
  variation "Market animals know machinery better than open routes."

  associate :common_at, atlas: :avar

  prose <<~PROSE
    ...
  PROSE
end
~~~

The final Ruby syntax may differ. The exported semantics should not.

## Retrieval

The Encyclopedia must support three retrieval modes:

1. Contextual matching: what ordinary material is useful in this scene?
2. Semantic reference search: what does canon know about flitters or resonant
   cutting?
3. Explicit association: what reference material is canonically tied to this
   location, faction, object, or species?

These are application-side selection modes, not separate tool choices for the
GM. The GM receives one source-agnostic tool:

~~~ts
type WorldLookupRequest =
  | {
      action: 'search';
      query: string;
    }
  | {
      action: 'open';
      handles: string[];
    };

type WorldLookupResult = {
  handle: string;
  namespace: 'atlas' | 'encyclopedia' | 'chronicle';
  recordType: 'entity' | 'entry' | 'history';
  title: string;
  summary: string;
  useAs: 'particular' | 'reusable' | 'chronicle_evidence';
};
~~~

`lookup_world` searches Atlas content, Encyclopedia content, and Chronicle
history concurrently. It ranks each corpus using its own search policy, then
merges bounded results without comparing raw scores from unlike indexes.
Exact matches take precedence over approximate matches.

Handles are opaque and namespace-qualified, such as `atlas:blue-meridian`,
`encyclopedia:vehicle-class/flitter`, and `chronicle:turn/12`. `open`
dispatches each handle to its owning store and returns a typed record. Opening
an Atlas entity can return lore and related handles; opening an Encyclopedia
entry can return usage material and related handles; opening Chronicle history
can return the established turn evidence. The GM never chooses a corpus or
constructs a source-specific identifier.

This unified tool is not fallback lookup. Named-entity resolution remains
Atlas-only, Encyclopedia mention resolution remains limited to served exact
titles and aliases, and each store retains its own schema and search index.

A contextual result includes its match evidence:

~~~ts
type ApplicableReference = {
  entry: EncyclopediaEntry;
  matchedSelector?: number;
  matchedTerms: ContextTerm[];
  matchedRelationships: ReferenceRelationship[];
  score: number;
};
~~~

Selection should:

- Filter entries by applicability.
- Include exact Atlas associations.
- Score selector specificity, prevalence, and semantic query relevance.
- Penalize entries used in recent turns.
- Preserve variety across kinds.
- Return deterministic results for the same context and seed.

Prompt material should preserve the boundary:

- `WORLD-INDEX` contains typed Atlas particulars and applicable Encyclopedia
  candidates.
- `HISTORY` contains facts established in the current Chronicle.
- Every index and tool result identifies its namespace and `useAs` semantics.

The Encyclopedia portion of the world index can initially contain eight to
twelve compact candidates. The researcher can open a bounded number of
records across all sources. The one-shot prose path can receive four to six
compact usage records directly. These are initial tuning values, not schema
constraints.

Narration instructions must say that an Encyclopedia entry is reusable common
knowledge. It may supply unnamed scene material or describe an existing
instance. It is never a named actor, Chronicle anchor, or proof that a
particular instance is present.

## Open-world invention

The catalog uses open-world semantics:

- A match means that an entry is suitable here.
- No match says nothing about what is possible.
- Absence from the Encyclopedia never forbids player or GM invention.
- A `none` condition excludes one authored entry from a contradictory context;
  it does not close the setting.
- A matched entry is a candidate, not an assertion that it is present.

When play invents something:

1. Search with `lookup_world` and inspect the namespaces on its results.
2. If nothing matches, treat the subject as new fiction.
3. Persist its established details in the Chronicle.
4. If it becomes recurrent, give it a Chronicle-local reference record.
5. Promote it to `tsonu-canon` only through an explicit GM or editor action.

If a particular instance becomes important, it becomes a Chronicle-local actor
or later an Atlas entity linked by `instance_of` to its reference. The generic
type does not itself become an actor.

Reference use should be recorded separately from entity focus:

~~~ts
type TurnReferenceUsage = {
  turnId: string;
  referenceId: string;
  role: 'texture' | 'interaction' | 'character_origin' | 'instance_basis';
};
~~~

This supports continuity, repetition control, and retrieval audits without
altering Atlas centrality.

## Content priorities

The first new material should favor ordinary scene-operable subjects over more
high-level technology:

1. Roles and practices.
2. Place features and services.
3. Resources, food, tools, and consumables.
4. Common lifeforms.
5. Vehicle classes.
6. Resonant techniques and recurring phenomena.
7. Additional technology where coverage is missing.

Author material around recurring play contexts rather than filling categories
alphabetically. Each frequently playable context should eventually match
entries from at least five kinds and include:

- Something living.
- Someone doing ordinary work.
- Something people use or consume.
- A place feature.
- A recurring pressure or phenomenon.
- At least one locally appropriate variation.

This coverage produces more useful texture than entry count alone.

Every completed entry should contain:

- At least two concrete cues.
- At least one player affordance.
- At least one pressure or failure mode.
- At least two variations.
- At least one global or contextual availability declaration.
- Only registered topic and context tags.

Culture entries additionally require internal variation. Encyclopedia
relationships are optional and have no minimum degree.

## Migration and implementation order

1. Define the context-tag registry and Encyclopedia authoring/export contract
   in `tsonu-canon`.
2. Add first-class `contextTags` to Atlas source entries and annotate every
   selectable Chronicle location.
3. Add separate Encyclopedia DTOs, persistence, embeddings, and reader APIs.
4. Change the canon bundle and importer so Encyclopedia entries never become
   `HardState`, lore fragments, or Atlas edges.
5. Move obvious existing reference entries: species, cultures, abilities,
   resources, general technologies, and generic ship classes.
6. Audit generic-looking creatures, transports, and artifacts individually.
7. Convert their current relationships into:
   - Context selectors for ordinary applicability.
   - Reference relationships for type dependencies.
   - Exact Atlas associations for named canonical ties.
   - Ordinary Atlas relationships only when both endpoints remain particulars.
8. Migrate character origin so species and culture use Encyclopedia IDs while
   homeland and allegiance use Atlas IDs.
9. Add the unified prose lookup, typed world index, one-shot context,
   environment context, and reference-usage records.
10. Add missing mundane material by recurring context.

The implementation should not:

- Use `HardState.isArticle` as the Encyclopedia boundary.
- Reuse topic tags as applicability tags.
- Add Encyclopedia entries to named-entity search, `expand`, focus, anchors, or
  entity usage.
- Force a minimum number of reference relationships.
- Treat selector results as an exhaustive list of what may exist.
- Automatically promote Chronicle inventions into world canon.
- Infer an individual's behavior from species or culture.

## Reference systems

`Stars Without Number` uses world tags as packages of playable material rather
than labels alone. Its tags supply people, complications, things, and places
that can be combined into local situations:
[official description](https://sine-nomine-publishing.myshopify.com/products/stars-without-number-revised)
and
[free-edition rules](https://kschnee.xepher.net/rpg/resources/StarsWithoutNumber2E-FreeEdition.pdf).

The 2024 D&D `Monster Manual` adds habitat and treasure metadata and indexes
creatures by habitat and type. The Encyclopedia applies the same retrieval
principle to every reference kind:
[D&D Beyond overview](https://www.dndbeyond.com/posts/1888-whats-new-in-the-2024-monster-manual).

Starforged's Dataforged project stores oracles, setting truths, encounters,
assets, and moves in typed JSON with a schema and API rather than representing
them as setting actors:
[Dataforged repository](https://github.com/rsek/dataforged).

Pathfinder traits show why topic labels and operative selectors need different
contracts: some traits classify a creature while others carry detailed rules:
[Archives of Nethys](https://2e.aonprd.com/Rules.aspx?ID=1001).
