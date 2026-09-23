# ADR 0001: Authoritative canon snapshots

Status: accepted. Recorded: 2026-09-21.

## Context

Tsonu authors particular entities and reusable setting material with different
semantics. Treating both as graph entities makes reusable types eligible for
anchors, focus, and mutable play history. Independent import jobs could leave
classifications referring to a different revision from their targets.

## Decision

Use the existing internal site export, Glass translator, checked-in
`tsonuCanonSnapshot.json`, and deployment canon-seed Lambda. One snapshot contains
Atlas entities, relationships, lore, Encyclopedia entries, context tags, and
classifications. A source revision plus content-derived hash identifies it.

`CanonSnapshotWriter` commits the mixed snapshot in one PostgreSQL transaction
using `CanonWriter` and its transaction-level advisory lock. Missing imported
records are removals. Stable external keys preserve existing identities; a
changed key is a replacement, with no guessed alias or ID migration. Remove
obsolete imported entities before allocating replacement slugs so an unchanged
name can reclaim its canonical slug. Real collisions still get suffixes.

Keep Encyclopedia entries outside Atlas nodes, edges, lore, focus, and anchors.
Type and membership declarations live in a separate classification table.
Ordered sections belong to their entry and need no separate identity. Kinds and
subkinds remain source-authored strings. Applicability uses the existing JSON
selector matcher and supplies candidates, not assertions that instances exist.

Production uses normal CI/CD. The seed Lambda awaits missing Atlas and
Encyclopedia embeddings after seeding, including when the snapshot is unchanged.
The original Encyclopedia database reset was a one-time cutover, not a refresh
procedure. Guide pages are deferred until an explicit source contract exists.

## Consequences

Snapshot failures roll back the catalog transaction. Embeddings are a subsequent
phase; a failed backfill can resume on an ordinary deployment retry. Removing an
imported entity also removes dependent records through their database constraints;
preserving unrelated play-owned data is not a promise to preserve edges whose
endpoint has been removed. Review source removals before publishing an artifact.

An additive-only import, a second synchronizer, an Encyclopedia relationship
graph, and runtime source-file lookups are rejected. `revertBatch` deletes
batch-attributed Atlas records; it is not a mixed-snapshot restore operation.
Operational corrections use a new reviewed source snapshot through the same path.

See [the pipeline](../canon-pipeline.md),
[Encyclopedia contract](../design/encyclopedia-reference-catalog.md), and
[CanonSnapshotWriter](../../packages/worldstate/src/canonSnapshotWriter.ts).
