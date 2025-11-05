# Next Sprint Plan – Sessions 132–141

Scope: Prioritize Tier 1 gameplay delivery, offline post-session publishing, and unified client mandates from `REQUIREMENTS.md`, with supporting systems queued behind successful validations.

| Priority | Focus Area | MCP Item(s) | Desired Outcome | Dependencies / Notes |
|----------|------------|-------------|-----------------|----------------------|
| P1 | Platform follow-through | IMP-PLATFORM-03 | Execute Tier 1 reminder sends, capture SME acknowledgements, and restart CI rehearsal to keep tag 7 images current. | Requires Slack env vars; follow schedule (09:00Z/09:05Z pings, 12:00Z escalation) before CI rerun. |
| P1 | Offline publishing validation | IMP-OFFLINE-05 | Replay offline QA with tag 7, bundle drift + moderation evidence, and publish validation pack to unblock downstream features. | Wait for Tier 1 acks, then coordinate artefact sharing with IMP-CLIENT-06. |
| P1 | Unified client SME signoff | IMP-CLIENT-06 | Distribute stage smoke/alert bundle (port 4443) and capture SME confirmations covering overlays + admin pipeline. | Archive approvals in docs + MCP; confirm fallback auto-disables once live alerts flow. |
| P1 | Hub PvP telemetry | IMP-HUBS-05 | Gather >3 actor contest telemetry on tag 7, circulate moderation feedback, and finalize balancing brief. | Stage contest monitor run shares artefacts with IMP-MOD-03. |
| P1 | Moderation cadence alignment | IMP-MOD-03 | Shadow tag 7 QA/contest runs, archive cadence evidence, and document remaining moderation gaps for SME review. | Depends on IMP-OFFLINE-05 + IMP-HUBS-05 telemetry to validate queue integrations. |
| P2 | Storage lifecycle readiness | IMP-MINIO-01 | Plan Nomad rehearsal + Backblaze checks for MinIO lifecycle automation once Tier 1 items land. | Blocked on IMP-PLATFORM-03 closure and CI stability. |
| P2 | Lore search deltas | IMP-SEARCH-01 | Prepare differential indexing flow leveraging stable offline delta feeds. | Requires IMP-OFFLINE-05 completion for reliable telemetry. |
| P2 | Capability governance | IMP-MOD-02 | Design and stage policy editor backend/UI for Prohibited Capabilities once moderation cadence stabilizes. | Wait for IMP-MOD-03 handoff and pipeline confirmations. |
| P3 | Observability suite | IMP-OBS-01 | Schedule observability/incident dashboard rollout after Tier 1 loops are production-ready. | Keep deferred until gameplay + pipeline systems demonstrate sustained stability. |

### Validation Reminders

- Link every execution step back to feature commitments in `REQUIREMENTS.md`.
- Maintain WIP ≤ 10; close PBIs immediately after criteria pass.
- Update MCP backlog and docs after each milestone to preserve traceability.
