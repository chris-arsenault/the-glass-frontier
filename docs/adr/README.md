# Architecture decisions

These ADRs record the implemented decisions as of 2026-09-21. They consolidate
the completed root plans; dates below identify when each record was written,
not when every underlying change first shipped.

| ADR                                                   | Decision                                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------- |
| [0001](0001-authoritative-canon-snapshots.md)         | One authoritative import pipeline, separate Atlas and Encyclopedia stores |
| [0002](0002-qualified-retrieval-and-scout-writer.md)  | Qualified references and a scout/writer split                             |
| [0003](0003-threads-scenes-and-advisory-updates.md)   | Narrative threads, bounded scenes, and advisory post-narration updates    |
| [0004](0004-forward-migrations-and-canonical-tier.md) | Immutable migration history and the singular ability tier                 |
