# IMP-OFFLINE Stage Terminology Alignment

Backlog: `IMP-CLIENT-07` (MCP `64d6a12c-15e6-4064-9e9f-2d4e6b9cfcf0`)

## Purpose
- Provide offline publishing owners a single reference for the stage chips now surfaced in the admin overlay dock.
- Confirm that player-facing nomenclature mirrors Temporal job/state identifiers so incident response and documentation stay consistent.
- Capture outstanding coordination points before we mark the terminology update as delivered.

## Stage Mapping

| Temporal Source | Overlay Chip Label | Description | Owner Follow-Up |
|-----------------|--------------------|-------------|-----------------|
| `StoryConsolidationWorkflow` job states `queued` / `running` / `completed` / `failed` | `Story Consolidation` | Transcript summarisation and entity extraction batch. | Confirm summary versioning aligns with `summaryVersion` emitted in workflow metadata. |
| `DeltaReviewWorkflow` job states | `Delta Review` | Lore delta drafting, conflict detection, and admin queueing. | Validate conflict resolution notes feed the moderation dashboard in the same terminology. |
| `LorePublishWorkflow` job states | `Publish` | Final lore push to wiki + feed ingestion. | Ensure `publishingBatchId` displayed in overlay matches Temporal batch identifiers used in runbooks. |
| Session cadence overrides (`publishingCadence.override`) | `Queued` chip annotations | Indicates admin deferral or automatic backlog hold. | Confirm override reasons map to documented deferral categories. |
| Temporal failure payload (`error` field) | `Failed` badge tooltip | Displays the latest failure string verbatim. | Provide sanitized messaging for user-facing copy if raw Temporal errors expose internals. |

## Coordination Notes
- Overlay uses lowercase Temporal state strings (`queued`, `processing`, `completed`, `failed`, `idle`)—ensure pipeline alerts and runbooks mirror the same casing.
- Stage chips surface at most one failure per stage; deeper error context remains in Temporal logs. Owners should confirm whether additional context (e.g., `lastRun.stackTrace`) needs exposing.
- Remind operations that cadence defer reasons now surface via `pipelineHistory` timeline entries with the same status labels.

## Action Items For Offline Owners
1. Review the mapping above and confirm Terminology parity with existing Temporal dashboards by 2025-11-08.
2. Provide sanitized error message templates if we should replace raw Temporal error strings before GA.
3. Flag any additional states (e.g., `retrying`, `paused`) that should be promoted to chips for Cycle 11 follow-up.

Updates to this note should be reflected both here and in MCP architecture/backlog references to keep cross-team visibility intact.
