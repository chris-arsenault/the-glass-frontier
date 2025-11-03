# Next Sprint Plan – Sessions 51 – 60

Date: 2025-11-04  
Planner: Codex (implementation kickoff grooming)

## Tier 1 – Gameplay Implementation (P1)

| Order | Focus | Backlog Items | Notes |
|-------|-------|---------------|-------|
| 1 | Session closure & offline trigger | `IMP-GM-05` | ✅ Completed in session 51 – closure endpoint now live and queuing offline jobs. |
| 2 | Offline orchestration | `IMP-OFFLINE-04` | Subscribe to closure events, chain consolidation → extraction → publishing cadence. |
| 3 | Verification & telemetry hardening | (linked to `IMP-GM-05`, `IMP-OFFLINE-04`) | Extend Jest/integration coverage, surface `telemetry.offline.*`, ensure admin alerts fire on failure. |

## Tier 1a – Unified Web Client (P1)

| Order | Focus | Backlog Items | Notes |
|-------|-------|---------------|-------|
| 1 | Session closure controls | `IMP-CLIENT-05` | Add accessible closure button, cadence reminders, and status refresh handling. |
| 2 | Overlay & dashboard refresh | `IMP-CLIENT-05`, follow-up TBD | Mirror closure state across overlays (character, momentum, moderation alerts) once base control ships. |

## Tier 2 – Secondary Systems (P2)

| Order | Focus | Backlog Items | Notes |
|-------|-------|---------------|-------|
| 1 | Moderation dashboard | `IMP-MOD-01` | Deliver live alert triage, override drawer, and audit logging. |
| 2 | Prohibited capability registry | `IMP-MOD-02` | CRUD + event propagation for capability policies. |
| 3 | Moderation queue ↔ publishing sync | `IMP-MOD-03` | Block cadence while decisions outstanding; expose SLA timers. |

## Tier 3 – Deferred Platform Work (P2–P3)

| Order | Focus | Backlog Items | Notes |
|-------|-------|---------------|-------|
| 1 | Storage lifecycle automation | `IMP-MINIO-01` | Tier retention policies for lore bundles, attachments, hub logs. |
| 2 | Lore/news search drift controls | `IMP-SEARCH-01` | Differential indexing, fallback queries, drift telemetry. |
| 3 | Observability baseline | `IMP-OBS-01` | OTEL collectors, VictoriaMetrics, Loki, Grafana dashboards & alerts. |
| 4 | Hub PvP schema (design) | `DES-PVP-01` | Revisit during hub combat enablement; keep deprioritised until Tier 1 completes. |

## Capacity Guardrails

- Maintain ≤10 in-flight PBIs (current WIP: 0 active; reserve 3 slots for Tier 1 items above).
- Drop Tier 3 work if Tier 1 velocity slips; keep moderation surfaces queued until closure/offline path validated.
