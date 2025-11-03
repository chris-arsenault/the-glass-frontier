# Next Sprint Plan – Sessions 41-50

| Tier | Priority | Focus Area | Linked Backlog Items | Key Outcomes |
|------|----------|-------------|----------------------|--------------|
| Tier 1 | P1 | Gameplay Implementation | `IMP-GM-04`, `IMP-HUB-02`, `IMP-HUB-03`, `IMP-HUB-04` | Ship LangGraph production graph, hub orchestrators, narrative bridge, and verb catalog persistence so live sessions and hubs operate end-to-end. |
| Tier 1 | P1 | Offline Post-Session Pipeline | `IMP-OFFLINE-01`, `IMP-OFFLINE-03` | Deliver story consolidation workflow and publishing cadence/search sync to enable offline world updates after each run. |
| Tier 1a | P1 | Unified Web Client | `IMP-CLIENT-04` | Launch account and session management UI with role-aware navigation and session resume controls. |
| Tier 2 | P2 | Moderation & Admin Surfaces | `IMP-MOD-01`, `IMP-MOD-02`, `IMP-MOD-03` | Build moderation dashboard, capability registry, and publishing sync so safety teams can govern deltas before release. |
| Tier 3 | P2 | Platform Foundations | `IMP-IAC-01`, `IMP-MINIO-01`, `IMP-SEARCH-01` | Prepare infrastructure-as-code, storage lifecycle, and search indexing automation needed once Tier 1 systems stabilize. |
| Tier 3 | P3 | Observability & Incident Response | `IMP-OBS-01` | Stand up observability stack (Grafana/VictoriaMetrics/Loki) after core loops reach MVP completeness. |

## Supporting Notes

- Tier 1 scopes run in parallel but must converge on a playable solo + hub experience feeding the offline pipeline within the next 10 sessions.
- Tier 2 moderation tooling depends on pipeline outputs; sequencing begins once story consolidation and publishing cadence reach functional status.
- Tier 3 items remain queued; elevate only when Tier 1/1a delivery is unblocked or requires platform support.
