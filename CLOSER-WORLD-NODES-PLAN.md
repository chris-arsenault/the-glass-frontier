# Chronicle Closer World-Node Extraction — Plan

On closure, the closer writes the chronicle's entities into the world graph. Known entities
(from the chronicle record) get lore fragments and edges; new named entities get a shell +
birth lore fragment; play-born entities then get description and prominence recomputed from
their accumulated lore and edges.

## Design (confirmed)

- Closure appends only lore fragments and edges — never entity fields, regardless of source.
  Creation = shell entity (name, kind/subkind, isLocation, prominence `marginal`) + birth
  lore fragment.
- Derive step, play-source entities only: LLM recomputes description from all lore + edges
  (lore is what happened; description is what the entity *is*); prominence promoted
  mechanically — `recognized` at ≥3 lore or ≥5 edges, `renowned` at ≥8 lore or ≥15 edges,
  never `mythic`. Written back as a second same-source batch (cross-source field writes
  silently no-op, so filtering to play-source is mandatory, not optional).
- New-entity cap `clamp(floor(turns/5), 3, 20)`; proper names only, no generic items/places.
- Prompts via the template store (three ids: extract, resolve, entity-summary), rendered
  directly like `chronicleSeedService.ts` does. Extract/resolve use the `classification`
  model category, entity-summary `prose`.
- Idempotent under SQS retry: skip extraction if an `ingest_batch` with
  `(source='play', source_id=<chronicle id>)` exists; every proposed entity/lore carries
  `externalKey: chronicle:<id>:<slug>`.

## The work

1. **Worldstate queries** (`packages/worldstate`): name lookup across kinds on
   `EntityReader` (only `findLocationByName` exists), play-batch existence check by
   `(source, source_id)`, lore/edge counts per entity id. Cover in the worldstate suite.
2. **Templates**: add the three ids to `PromptTemplateIds` + descriptors
   (`packages/dto/src/templates/PromptTemplates.ts`), seed SQL bodies
   (`db/migrations/seed/001_application_data.sql`), `.hbs` mirrors in
   `packages/app/templates/`.
3. **Closer pipeline** (`apps/chronicle-closer`), run in `process()` alongside summaries:
   - *Harvest* (no LLM): roster from turns' `entityUsage` + `entityFocus` +
     `anchorEntityId`, names/kinds from `entityOffered`.
   - *Extract* (LLM): transcript + roster → candidate new entities and lore/edges for
     roster entities. Output Zod schema enums over `vocabulary.ts` exports (kinds,
     subkinds, `WRITABLE_RELATIONSHIP_TYPES`, `WORLD_TAG_DEFS`); cap enforced in code.
   - *Resolve*: exact-name dedup via the new lookup; LLM tie-break only when ambiguous;
     matches become lore/edges on the existing entity, the rest become creations.
   - *Commit*: one `CanonProposal` (`source: 'play'`, `sourceId` = chronicle id) →
     `validateProposal` → `commitBatch`, behind the idempotency guard.
   - *Derive*: entity-summary call + prominence check for play-source entities touched;
     one write-back batch.
   - Wire `WorldSchemaStore` + `promptTemplateManager` into the handler.
4. **Ship**: WireMock mappings for the three new LLM calls (closure fires in e2e via wrap),
   check the closer Lambda timeout in `infrastructure/terraform/lambda.tf`, changelog entry
   in `apps/client/src/data/changelog.json`.

Verify: `pnpm lint && pnpm typecheck && pnpm test`, then the e2e suite.
