# Backlog Snapshot

Updated for Session 131 grooming cycle. Tier 1 focus remains on gameplay validation, offline publishing, unified client overlays, and moderation cadence; supporting systems follow once those milestones land.

## Tier 0 (P0)
| Feature | Item | Status | Priority | Notes |
|---------|------|--------|----------|-------|
| IMP-PLATFORM: Platform Implementation Foundations | IMP-PLATFORM-03: Image management | in-progress | P0 | Stage deploy 2025-11-05 pushed tag 7; manifest `artifacts/docker/service-image-manifest.json`, report `docs/reports/stage-deploy-2025-11-05.md`, and distribution pack `docs/reports/stage-deploy-distribution-2025-11-05.md` published. Reminder calendar (`artifacts/reminders/stage-deploy-tag7-tier1-reminders-2025-11-05.ics`) and automation (`npm run reminders:tier1`) confirmed via preview; `--send` run blocked pending `SLACK_BOT_TOKEN` + channel IDs. Awaiting SME acknowledgements before restarting the CI rehearsal shortcut (`npm run docker:publish:services` + `npm run docker:publish:temporal-worker`). |

## Tier 1 (P1)
| Feature | Item | Status | Priority | Notes |
|---------|------|--------|----------|-------|
| IMP-OFFLINE: Post-Session Publishing Pipeline | IMP-OFFLINE-05: Publishing Pipeline QA & Lore Sync | in-progress | P1 | Await Tier 1 acks, then replay offline QA with tag 7, bundle drift + moderation evidence, and share validation pack. |
| IMP-CLIENT: Unified Web Client Shell | IMP-CLIENT-06: Narrative Overlay & Pipeline Status Integration | in-progress | P1 | Stage smoke/alert harness rerun 2025-11-05 (fallback port 4443); distribute bundle + drift rollup for SME confirmations. |
| IMP-HUBS: Hub Implementation & Load Readiness | IMP-HUBS-05: Hub PvP Contested Interactions | in-progress | P1 | Execute tag 7 contest monitor runs, capture >3 actor telemetry, and finalize balancing brief with moderation feedback. |
| IMP-MOD: Moderation & Admin Surfaces | IMP-MOD-03: Moderation Queue & Publishing Sync | in-progress | P1 | Shadow tag 7 QA/contest telemetry, archive cadence evidence, and document remaining moderation gaps. |

## Tier 2 (P2)
| Feature | Item | Status | Priority | Notes |
|---------|------|--------|----------|-------|
| IMP-PLATFORM: Platform Implementation Foundations | IMP-MINIO-01: MinIO Lifecycle Automation | todo | P2 | Hold until Tier 1 validations land, then schedule the Nomad rehearsal and Backblaze checks during the next shared deploy window. |
| IMP-PLATFORM: Platform Implementation Foundations | IMP-SEARCH-01: Lore Search Differential Indexing | todo | P2 | Begin once publishing QA locks reliable delta feeds and retry telemetry from IMP-OFFLINE-05. |
| IMP-MOD: Moderation & Admin Surfaces | IMP-MOD-01: Moderation Dashboard & Live Overrides | done | P2 | Moderation dashboard shipped with DES-18 role guard, override drawer, and Playwright coverage for alert approval flows (`tests/e2e/admin-moderation.spec.js`). |
| IMP-MOD: Moderation & Admin Surfaces | IMP-MOD-02: Prohibited Capability Registry & Policy Editor | todo | P2 | Prep schema/UX drafts so implementation can start after IMP-OFFLINE-05 and IMP-HUBS-05 finalize staging artefacts. |

## Tier 3 (P3)
| Feature | Item | Status | Priority | Notes |
|---------|------|--------|----------|-------|
| IMP-PLATFORM: Platform Implementation Foundations | IMP-OBS-01: Observability & Incident Dashboards | todo | P3 | Deploy OTEL/VictoriaMetrics/Loki/Grafana stack after Tier 1 systems stabilize. |

## Delivered / Closed Features
- RES-CORE: Foundational Research
- DES-CORE: Foundational Design
- IMP-GM: Narrative Engine & Check Runner
- NAR-CORE: Worldbuilding Foundations

## Health Checks
- Active WIP (in-progress): 5 items, within the WIP ≤ 10 limit.
- No orphan PBIs; every backlog item remains linked to its owning feature in MCP.
