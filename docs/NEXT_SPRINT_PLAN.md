# Next Sprint Plan – Sessions 141–150

Scope: Prioritize Tier 1 gameplay delivery, offline post-session publishing, and unified client mandates from `REQUIREMENTS.md`, staging moderation governance behind proven loops.

| Priority | Focus Area | MCP Item(s) | Desired Outcome | Dependencies / Notes |
|----------|------------|-------------|-----------------|----------------------|
| P1 | Hub PvP stabilization | IMP-HUBS-05 | Hold cooldown frustration below 40%, confirm Temporal payload compliance across two releases, and archive telemetry for closure. | Requires staged contest monitor runs on tag 7 with moderation dashboard review. |
| P1 | Offline contested ingestion | IMP-OFFLINE-06 | Ingest contested encounter artefacts, flag delta conflicts, and gate publishing until review completes. | Depends on finalized telemetry contract from IMP-HUBS-05. |
| P1 | Unified overlays | IMP-CLIENT-07 | Deliver combined contest and publishing overlays so players/admins see live sentiment plus post-session progress. | Needs contest telemetry API and offline pipeline status endpoints stabilized. |
| P1 | GM memory transparency | IMP-GM-07 | Produce multi-session memory stress artefacts and transparent check narration for auditability. | Coordinate with IMP-CLIENT overlays to surface roll context; reuse tag 7 build. |
| P1 | Contest fallout questing | IMP-HUBS-06 | Launch quest hook templates that react to contest outcomes and route fallout through the offline pipeline. | Blocked until IMP-HUBS-05 telemetry review finishes; align with IMP-OFFLINE-06 data contracts. |
| P2 | Capability governance | IMP-MOD-02 | Ship policy editor UX + backend for prohibited capabilities once Tier 1 loops are stable. | Wait for IMP-HUBS-05 and IMP-OFFLINE-06 evidence to identify required policy hooks. |
| P3 | Platform automation | — | Remains deferred; IMP-PLATFORM feature is delivered and will restart only when gameplay milestones demand it. | Continue to ignore CI/automation tracks per no-side-process directive. |

### Validation Reminders

- Anchor every execution step to feature commitments in `REQUIREMENTS.md`, especially offline world updates and unified client mandates.
- Maintain WIP ≤ 10; close PBIs immediately once acceptance criteria pass.
- Update MCP backlog, feature records, and docs after each milestone to preserve traceability.
