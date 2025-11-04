# Next Sprint Plan – Sessions 91–100

| Priority | Focus Area | MCP Backlog Items | Key Actions & Dependencies |
|----------|------------|-------------------|----------------------------|
| P1 | Gameplay & Pipeline Integration | `IMP-OFFLINE-05`, `IMP-CLIENT-06`, `IMP-HUBS-05` | Finish offline publishing QA once storage credentials unlock, feed resulting telemetry into the unified client overlays, and ship contested hub interactions to round out the core loop. Coordinate staging rehearsals so retry queue metrics surface in client/admin views and PvP outcomes feed the offline cadence. |
| P2 | Moderation & Platform Support | `IMP-MOD-01`, `IMP-MOD-02`, `IMP-MOD-03`, `IMP-SEARCH-01`, `IMP-MINIO-01` | Prepare human-in-loop tooling and storage/search foundations immediately after Tier 1 sign-off. MinIO lifecycle rehearsal remains blocked on credentials; search differential indexing should start once publishing QA produces stable deltas. |
| P3 | Observability & Operations | `IMP-OBS-01` | Stand up OTEL/VictoriaMetrics/Loki/Grafana stack after gameplay/client/pipeline milestones stabilize; reuse IaC modules already authored under IMP-PLATFORM. |

## Guidance for the Next 10 Sessions
- Prioritise staging rehearsal that links the offline QA harness (`npm run offline:qa`) with overlay validation so SMEs can unblock `IMP-CLIENT-06`.
- Schedule contested hub interaction spikes early to expose any GM integration gaps before the next content drop.
- Track credential delivery for MinIO/Backblaze closely; unblock Tier 2 work immediately when secrets arrive.
- Keep moderation backlog warm by refining UI wireframes and dependencies while Tier 1 work is underway, but do not start implementation until gameplay/client pieces are signed off.
