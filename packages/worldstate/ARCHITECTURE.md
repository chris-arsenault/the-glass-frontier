# Worldstate architecture

`@glass-frontier/worldstate` owns PostgreSQL persistence for canon and play.
Shared wire contracts live in `packages/dto`; application configuration and
prompt stores live in `packages/app`.

## Three separate data domains

| Domain       | Store               | Contents                                                                         |
| ------------ | ------------------- | -------------------------------------------------------------------------------- |
| Atlas        | `WorldSchemaStore`  | Particular entities, typed graph edges, owned lore, and embeddings               |
| Encyclopedia | `EncyclopediaStore` | Reusable entries, applicability, classifications, origin options, and embeddings |
| Chronicle    | `ChronicleStore`    | Characters, Chronicles, turns, history search, and checkpoints                   |

Encyclopedia entries never become Atlas nodes, edges, lore, focus, or anchors.
The classification table connects particular Atlas records to reusable types
without making those types graph participants. Chronicle-local discoveries
remain session evidence until a canon proposal explicitly promotes them.

## Canon writes

`CanonWriter.commitBatch` validates an Atlas proposal against the shared
vocabulary and commits under the transaction-level canon advisory lock.
Within-batch references connect new records; existing identities can be named
by ID or external key. Non-import proposals affect the records they declare.

Imports are authoritative. `CanonSnapshotWriter.commit` wraps the Atlas writer,
context-tag and Encyclopedia upserts, classification replacement, and stale
record reconciliation in one transaction. It rolls back if a classification
does not resolve. An unchanged external key preserves identity; a renamed key
is a replacement. Removed imported entities are deleted before replacement
slug allocation, allowing a stable name to reuse its canonical slug. Stale
imported relationships and lore are reconciled after writes.

An import cannot overwrite an edge already owned by play or an author.
Deleting an entity still invokes database constraints for its dependent edges
and lore. There is no inferred identity mapping for renamed source keys.

`revertBatch` deletes batch-attributed Atlas records. It is not a historical
snapshot restore: overwritten values and the full mixed catalog are not
restored by that method. Correct authoritative content through the source
pipeline and a new reviewed snapshot.

The production `seedCanon` entry point uses the checked-in artifact and skips
an already-recorded source ID. Embeddings are completed by the private seed
Lambda after the snapshot transaction, including on unchanged-source retries.
See [the canon pipeline](../../docs/canon-pipeline.md).

## Reads and visibility

Atlas exposes entity, relationship, lore, neighbor, and context-slice reads.
`getContextSlice` remains a bounded graph traversal; it is not the canonical
narrator's complete knowledge boundary. The scout composes discovery from Atlas
embeddings and lore text, Encyclopedia search, and Chronicle full-text history,
then opens records through qualified slugs.

Encyclopedia APIs distinguish complete, draft, and shell entries. Complete
entries are eligible for proactive context. Drafts are available to explicit
browse/search/open; shells remain stored only for classification integrity.
Player projections omit DM entries, GM sections, and private usage material.
The existing JSON selector matcher evaluates applicability without a second
relationship graph.

The current ability contract is singular optional `tier`, with values
`broad`, `focused`, or `narrow`. Migration 019 adds its nullable text column;
the historical `tiers` column has no current application consumer.

## Session persistence

Chronicles store narrative threads, focus, one bounded active scene, and local
continuity. Turns retain player and GM prose, checks, world prose, direct
reference slugs, reference usage and mentions, and model comparisons. Checkpoints
support scene-evidence reads and branching. Branching copies Chronicle history
while retaining one canonical character record.

A Chronicle's current location name can describe a place invented during play.
Its starting Atlas identity remains separate. Updating the local name does not
create a global Atlas location. Historical tracker JSON stays inert, while
canonical fields receive safe defaults.

Thread and continuity updates read stored turn evidence rather than treating
summaries as an authoritative substitute. See the
[GM runtime](../../docs/design/gm-runtime.md) for boundary cadence and advisory
failure behavior.

## Schema and vocabulary

`db/migrations` is the only schema history. Applied files are immutable; local
and hosted database checks use that same history. Atlas kinds, subkinds,
statuses, relationship rules, and tags are declared in
`packages/dto/src/world/vocabulary.ts` and materialized through the application
seed. Encyclopedia kinds and subkinds are source-authored strings.

The main storage families are `node` / `entity` / `edge` / `lore_fragment`,
`ingest_batch`, `encyclopedia_entry`, `reference_context_tag`,
`atlas_encyclopedia_classification`, and Chronicle/character tables.
Nodes provide referential identity for graph participants; reusable Encyclopedia
entries have their own lifecycle and do not enter that identity table.
