# Canon import and deployment

The source is `../tsonu-canon`. The application consumes its internal bundle
through the existing translator and checked-in snapshot; it does not fetch the
authoring repository at runtime.

## Refresh sequence

In `../tsonu-canon`, review the source diff, then validate and generate:

```bash
make check WORLD=glass-frontier
make site-data
```

The importer reads
`../tsonu-canon/build/site-internal/worlds/glass-frontier.json` by default. Back
in the Glass Frontier repository, run:

```bash
pnpm --filter @glass-frontier/worldstate import:tsonu
```

Review the generated
[`tsonuCanonSnapshot.json`](../packages/worldstate/src/canon/tsonuCanonSnapshot.json).
Its `sourceId` combines the source revision and a content-derived hash across
the imported collections. Compare entities, owned lore, relationships,
Encyclopedia sections and usage, classifications, and context tags with the
source. Counts help detect omissions but do not replace content review.

Contract or vocabulary drift belongs in the existing adapter, shared DTOs, and
application seed. Validate before replacing the artifact; do not hand-edit the
generated snapshot or add an alternate importer. For schema changes, add a forward
migration and preserve applied files.

Run focused importer/artifact tests while iterating, then the normal repository
gate. `make ci` requires PostgreSQL/pgvector for its database tests; hosted CI
provides an isolated instance. Database regressions cover snapshot reconciliation,
including source-key renames reclaiming slugs and singular tier persistence.
Use broker-backed credentials for secret-dependent local checks in Sulion.

## Persistence semantics

[`CanonSnapshotWriter`](../packages/worldstate/src/canonSnapshotWriter.ts)
validates the mixed snapshot, opens one transaction, and:

1. Calls `CanonWriter.commitBatchWithClient`, which takes the canon write lock,
   validates the Atlas proposal, records its batch, releases removed import-owned
   entity identities before slug allocation, and writes entities, edges, and lore.
2. Reconciles stale imported lore and relationships within that Atlas write.
3. Upserts context tags and Encyclopedia entries, replaces classifications,
   removes stale Encyclopedia entries, and records the catalog counts.
4. Commits only if every classification resolves and every write succeeds.

External keys are identity. An unchanged key retains its database identity; a
changed key is a new source identity. Releasing a removed entity's slug lets its
replacement reuse the name without an unnecessary suffix. This does not remap
historical references or invent aliases. Slug collisions with surviving records
remain real collisions.

The source is authoritative over imported rows. Omitting an imported entity,
edge, lore fragment, Encyclopedia entry, classification, or context tag removes
that imported material. Non-import Atlas proposals update only what they declare.
Relationship ownership prevents import from overwriting an edge already owned
by play or an author while its endpoints survive. Deleting an endpoint still
applies foreign-key deletion rules to dependent data.

The [`seedCanon`](../packages/worldstate/src/seedCanon.ts) entry point skips a
source ID already recorded in `ingest_batch` and returns `unchanged`. A changed
source produces an `applied` result. Do not use `revertBatch` as a full snapshot
rollback: it deletes batch-attributed Atlas rows and does not restore overwritten
values or all Encyclopedia state.

## Production path

After review and authorized publication, the existing
[CI/CD workflow](../.github/workflows/ci.yml) handles the release:

1. Verify with `make ci`, including migration immutability and PostgreSQL tests.
2. Build deployment artifacts and generate the prompt-template seed.
3. Apply `db/migrations` through the Ahara migration service.
4. Apply application configuration and vocabulary seeds.
5. Apply Terraform to deploy the application and private canon-seed Lambda.
6. Invoke `seed-canon`; await snapshot seeding and both embedding backfills.

[`handler.ts`](../apps/canon-seed/src/handler.ts) awaits missing Atlas embeddings,
then missing Encyclopedia embeddings before returning. Cohere Embed v4 uses
document embeddings for canon and query embeddings for discovery. Existing
store predicates and document changes determine which embeddings need work.
Backfills run even when the snapshot result is `unchanged`, so a retry can finish
after an earlier embedding failure. Snapshot commit and embeddings are separate
operations, not one database transaction.

A green build alone is insufficient evidence. Check the deployment job and its
`Seed production canon` result, source ID, status, and counts. An invocation
error must be investigated from its actual logs. The seed response counts are
catalog counts, not counts of embeddings computed during that invocation.

Routine refreshes do not reset the production database. The original
Encyclopedia reset is historical; current maintenance preserves Chronicles and
uses forward migrations. See [the dated release evidence](reports/2026-09-21-feature-closeout.md)
for the September refresh, rather than treating a fixed count as a permanent
pipeline invariant.
