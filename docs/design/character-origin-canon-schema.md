# Character origin: canon and importer schema

Character creation asks the player for four canon entities: species, culture,
homeland, and faction allegiance. The wizard currently queries the Atlas by
`kind` (and by `isLocation` for homeland) and shows whatever comes back. That
produces the wrong list in every pane, and the fix belongs in canon and the
importer rather than in a filter on the client.

## What the panes show today

Counted from `packages/worldstate/src/canon/tsonuCanonProposal.json`.

| Pane | Query | Returned | Actually selectable |
|---|---|---|---|
| Species | `kind = species` | 6 | 5 — plus the wiki article "Species" |
| Culture | `kind = culture` | 4 | 2 — plus "Cultures" and "Naming Conventions" |
| Homeland | `isLocation = true` | 90 | 90, including planets, star systems and hazardous zones |
| Allegiance | `kind = faction` | 22 | 22, including governments and civic bodies |

Two distinct problems, and they need two distinct fields.

**Reference articles are in the graph as entities.** "Cultures", "Species" and
"Naming Conventions" are topic pages from the source wiki. They exist as
`kind: culture` and `kind: species` rows and are indistinguishable by kind from
Hab-Worlder or Orcs. Their prose is useful context; they are not things a
character can be.

**Kind is far coarser than eligibility.** A homeland is a settlement or a
station, not the Kaleidos system or a hazardous zone, and both settlements and
regions live under two different kinds. An allegiance is an organisation that
can have a personal relationship with someone, which excludes a planetary
government. No combination of `kind` and `isLocation` expresses either.

Prominence is not the lever either: of the 48 settlements and stations, 32 sit
at `recognized` and 14 at `marginal`. A prominence floor would cut the list from
48 to 33.

## Field 1: `isArticle`

A boolean on the entity, following exactly the pattern `isLocation` already
established — defaulted from the kind or subkind at ingest, overridable per
entity in the proposal.

```
ProposedEntity.isArticle?: boolean
entity.is_article  boolean NOT NULL DEFAULT false
```

An entity with `isArticle = true` is a reference page about a topic rather than
a thing in the world. It stays in canon, keeps its lore, and stays available to
retrieval when the GM needs the background. It never appears in a player-facing
picker.

**Ingest default:** `subkind = 'overview'` sets it. That catches "Species" and
"Cultures" today. "Naming Conventions" carries `subkind: naming_practice` and
needs an explicit `isArticle: true` in the source, or a second `naming_practice`
default — the canon team's call, but the per-entity override should exist either
way so this does not depend on the subkind list staying exhaustive.

Worth auditing the other kinds for the same shape while you are in there:
`concept` (9 entities) and `era` (5) are likely to contain topic pages too.

## Field 2: `playableAs`

A set of character-creation roles the entity may fill.

```
ProposedEntity.playableAs?: Array<'species' | 'culture' | 'homeland' | 'allegiance'>
entity.playable_as  text[] NOT NULL DEFAULT '{}'
```

The wizard then asks `playable_as @> ARRAY['homeland']` instead of
`isLocation = true`, and each pane gets exactly the list canon intends. An empty
array — the default — means the entity is canon but not a creation option, which
is the correct answer for the large majority of the graph.

A set rather than a derived value, because eligibility crosses kinds in both
directions: homeland spans `installation` and `geographic_location`, allegiance
is a strict subset of `faction`, and the same entity can reasonably be both a
homeland and an allegiance (a station that is also the organisation running it).

**Ingest defaults**, again overridable per entity:

| Role | Default rule | Yield today |
|---|---|---|
| `species` | `kind = species AND subkind = sapient_species` | 5 |
| `culture` | `kind = culture AND subkind IN (way_of_life, regional_culture)` | 2 |
| `homeland` | `kind = installation AND subkind IN (settlement, station)` | 48 |
| `homeland` | `kind = geographic_location AND subkind IN (region, world_region)` | 6 |
| `allegiance` | `kind = faction AND subkind NOT IN (government, civic_body)` | 15 |

The defaults get species, culture and allegiance to a usable size on their own.
Homeland does not: 54 entries is still a wall of cards. That one needs explicit
curation in the source — mark the handful of settlements and stations a starting
character plausibly comes from, and leave the rest with an empty `playableAs`.

**Target sizes for a creation picker:** 5–8 species, 4–8 cultures, 8–12
homelands, 6–10 allegiances. Below that the choice stops mattering; above it the
player scrolls instead of reading.

Culture is under target at 2. That is a canon-authoring gap rather than a schema
one — the schema will show whatever gets written.

## Field 3: `originBlurb`

Optional, and the smallest of the three.

```
ProposedEntity.originBlurb?: string   // max 140 chars
entity.origin_blurb  text
```

The picker cards currently render `description`, which is up to 2000 characters
of wiki prose written for a different context — the Hab-Worlder entry opens by
explaining what it is not. A short line written for the card reads better and
lets the long description stay what it is. Where it is absent the card can fall
back to the first sentence of `description`.

## What changes on the game side

Once the fields land in `ProposedEntity` and the entity table:

1. `HardState` gains `isArticle` and `playableAs`, and `canonWriter` applies the
   ingest defaults next to the existing `isLocation` default at
   `packages/worldstate/src/canonWriter.ts:298`.
2. `entityReader`'s `EntityListInput` gains a `playableAs` filter, and
   `atlas-api`'s `listEntities` exposes it.
3. `ORIGIN_PICKS` in the creation wizard queries by role instead of by kind, and
   the homeland pane stops using `isLocation`.
4. Atlas browsing excludes `isArticle` entities from entity lists by default and
   keeps them reachable by slug.

That is roughly a day's work and none of it is blocked on the others. Say the
word and I will do it behind the new fields so canon can land independently.

## Migration note

Both `is_article` and `playable_as` are additive columns with defaults, so
migration 005 in `db/migrations` is a two-line `ALTER TABLE` plus a backfill
that applies the ingest defaults to the entities already in the graph. Re-running
the canon-seed Lambda after the importer is updated would achieve the same
thing without the backfill.
