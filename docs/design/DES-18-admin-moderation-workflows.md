# DES-18 – Admin & Moderation Workflows

Backlog anchor: `DES-18`, Feature: `DES-CORE`

## Purpose
Define the role taxonomy, tooling, and end-to-end workflows that let admins, moderators, and GMs uphold safety policies without undermining collaborative storytelling. This artefact unifies live override mechanics, offline delta review, and transparency cues across the web client so the Prohibited Capabilities List remains enforceable, audit trails stay intact, and players understand how disputes are resolved.

## Guiding Tenets
- **Narrative-first safety:** Moderation protects consent and canon while keeping creative expression unblocked; interventions offer alternate paths instead of hard stops.
- **Single source of truth:** Every decision binds to immutable `auditRef` IDs recorded in CouchDB event logs and propagated through Temporal workflows (DES-15/16).
- **Role clarity:** Distinct permissions prevent overreach—admins manage policy and publishing, moderators arbitrate individual beats, and GMs handle in-session framing.
- **Transparency & accessibility:** All surfaces disclose interventions with screen-reader friendly summaries, leveraging DES-12 aria tokens and pacing cues.
- **Self-hosted resilience:** Tooling runs within the Node/Temporal/CouchDB stack established in prior sessions; no managed moderation SaaS.

## Role Taxonomy & Permissions
| Role | Core Permissions | Safety Scope | Tooling Surfaces |
|------|-----------------|--------------|------------------|
| **Admin** | Manage role assignments, Prohibited Capabilities registry, publishing cadence overrides, policy updates | Global—can approve/retcon deltas, pause pipelines, escalate incidents | Admin console (`/admin`), cadence strip, policy editor |
| **Moderator** | Review `admin.alert` queues, apply overrides, annotate transcripts, resolve disputes, trigger safe breaks | Session & hub scoped—cannot alter policy but can escalate to admin | Moderation dashboard, live override panel, backlog triage |
| **GM (LLM proxy + human overseer)** | Initiate narrative wraps, request human review, apply soft fails, emit `system.directive` hints | Scene scoped—cannot publish or approve deltas; can defer to moderation | GM HUD overlays, chat tooling, pacing ribbon |
| **Safety Liaison** *(optional rotation)* | Monitor consent cues, audit safety flags, run after-action reports | Cross-session trend analysis; read-only policy access | Safety analytics board, reporting exports |

- Role assignments live in PostgreSQL `user_roles` with JWT claims propagated to the unified web client. Admin changes emit `role.update` events mirrored to Redis for real-time permission refresh.
- Moderators inherit least privilege defaults: they cannot edit Prohibited Capabilities but can link incident reports to backlog tickets (`tag:moderation-incident`).

## Workflow Overview
1. **Live alert intake:** Narrative Engine, hub orchestrator, or check runner emit `admin.alert` events whenever safety flags, hard misses with veto, or contested overrides surface.
2. **Triage & decision:** Moderators act through the live override panel to approve outcomes, amend narrative, or escalate to admins.
3. **Transparency broadcast:** Player-facing overlays display summaries (`overrideBadge`) while transcripts append annotations referencing `auditRef`.
4. **Offline consolidation:** All decisions attach to CouchDB event documents feeding Temporal pipelines (DES-15). Deferred items enter moderation queue ahead of publishing cadence (DES-16).
5. **Policy & capability upkeep:** Admins adjust the Prohibited Capabilities registry and moderation SLAs, with changes recorded as architecture decisions and backlog notes when scope shifts.

Refer to `docs/design/diagrams/DES-18-moderation-workflow.mmd` for the combined live and offline sequence.

## Live Override Lifecycle
1. **Detection:** `admin.alert` payload contains `eventType` (`checkVetoed`, `contestOverride`, `hubSafety`, `deltaDispute`), originating `eventId`, `safetyFlags`, and suggested remedy.
2. **Queueing:** Alert enters moderation dashboard columnised by urgency (`safety-critical`, `content-warning`, `rules-dispute`). SLA timers align with DES-16 cadence (`45` minute moderation window).
3. **Assessment:** Moderator opens detail drawer showing:
   - Transcript excerpt and momentum state
   - Applied move tags and dice rationale (DES-13)
   - Hub action log references when sourced from DES-17 stack
   - Prior decisions touching the same `auditRef`
4. **Decision Paths:**
   - **Approve:** Confirm original outcome; system logs `moderation.decision` with `decision:approved`.
   - **Amend:** Supply replacement narrative, adjust momentum delta, or change rule tier. Replays the scene by sending `moderation.override` to Narrative Engine; Temporal logs amendment.
   - **Defer/Escalate:** Pushes to admin queue with reasoning; marks event `status:needs-review` to pause publishing.
   - **Safety Break:** Triggers session wrap prompt (`session.marker` with `wrapIn=3`) and notifies players of pause.
5. **Broadcast:** Player UI surfaces toast (`"Moderator adjusted outcome: [summary]"`) with accessible alt text. Transcript attaches inline annotation bubble linking to policy rationale.
6. **Persistence:** Override stored in CouchDB `moderation_decisions` doc, appended to event envelope, and cross-posted to `telemetry.moderation.actions` metric stream.

## Offline Moderation & Publishing Alignment
- Temporal `moderationQueueWorkflow` (from DES-15) ingests any override or escalation left unresolved at session close.
- Admin console backlog view merges:
  - Live overrides requiring follow-up (outcome flagged `followUpRequired`).
  - Delta proposals awaiting approval before DES-16 `loreBatchPublishWorkflow`.
- Cadence strip shows countdown timers for: moderation SLA, batch publish, and daily digest; color-coded by backlog size (`green <20`, `amber 20–50`, `red >50`).
- Decisions made offline append to the same `auditRef`, ensuring the event graph remains linear.
- When admins retcon published lore, the system issues `retcon.append` events referencing the override record and automatically notifies players who bookmarked the affected session.

## Tooling Surfaces
### Moderation Dashboard
- Built on unified web client with React route `/admin/moderation`.
- Columns: `Live Alerts`, `Queued`, `Escalated`, `Resolved`.
- Filters: `eventType`, `hubId`, `factionTag`, `safetyFlag`.
- Batch actions limited to admins; moderators act per-item.
- Accessibility: DES-12 aria token `ariaModDecision` ensures screen readers announce decision context and timers.

### Live Override Panel
- Inline drawer triggered from chat transcript or hub log entry.
- Presents dice breakdown, safety notes, and quick actions (`Approve`, `Amend`, `Escalate`, `Pause Session`).
- Supports attaching template responses; templates stored per policy and localised.

### Policy & Capability Editor
- Admin-only view to manage Prohibited Capabilities list.
- Changes versioned; each update requires rationale, auto-linked to architecture decision or backlog note.
- Syncs to Narrative Engine and hub command parser caches via `capability.update` events.

### Safety Analytics Board
- Aggregates metrics: override frequency, average response time, top safety flags.
- Feeds `DES-BENCH-01` benchmark dashboards and future incident retrospectives.

## Telemetry & Audit
- Metrics exposed: `telemetry.moderation.queueDepth`, `telemetry.moderation.responseMs`, `telemetry.moderation.overrideRate`, `telemetry.moderation.safetyBreaks`.
- All decisions emit immutable records with `actorId`, `role`, `decisionType`, `timestamp`, `latencyMs`, `relatedDeltaIds[]`.
- Audit log retrieval flows through IndexedDB cache for offline-friendly admin clients; fetches chunked by `auditRef`.
- Incident exports produce signed CSV bundles stored in MinIO (`audits/{YYYY-MM-DD}/moderation-{slug}.csv`).

## Data & Event Contracts
- **`admin.alert`**
  - `alertId`, `eventId`, `auditRef`, `sessionId`, `origin` (`narrative`, `hub`, `workflow`), `urgency`, `safetyFlags[]`, `suggestedAction`, `expiresAt`.
- **`moderation.decision`**
  - `decisionId`, `auditRef`, `actorId`, `role`, `decisionType`, `resolution`, `notes`, `followUpRequired`, `attachments[]`.
- **`capability.update`**
  - `capabilityId`, `changeType`, `description`, `enforcedAt`, `policyLink`.
- **`retcon.append`**
  - `deltaId`, `supersededBy`, `playerNotification[]`, `provenance`.

Schemas extend DES-15 pipeline definitions; JSON schema docs live in `docs/design/schemas/moderation/` (to be created during implementation).

## Risks & Mitigations
1. **Moderator overload during peak events:** Autoscale alert thresholds; backlog flag triggers DES-16 cadence slowdown and opens incident backlog item (`phase:implementation`, `tag:moderation-capacity`).
2. **Transparency gaps:** Enforce UI tests ensuring override badges display within 250 ms; integrate with accessibility pipeline (IMP-AXE-01) once available.
3. **Policy drift:** Require architecture decision update whenever capability matrix shifts beyond minor copy edits; automate reminder when registry changes exceed 5 entries/week.
4. **Security concerns:** All admin routes gated behind SSO + hardware token requirement; session tokens include `roleVersion` to invalidate stale privileges on change.

## Implementation Follow-Ups
- Implementation backlog seeds:
  - Build moderation dashboard React route with live alert sockets.
  - Extend Narrative Engine to consume `moderation.override` payloads and regenerate narration diffs.
  - Add Temporal activity for `retcon.append` propagation to publishing workflow.
  - Automate incident export job with MinIO uploads and retention policy.
- Coordinate with `DES-MOD-01` to translate override panel interactions into detailed UX wireframes and prototypes.

## References
- `REQUIREMENTS.md`
- `docs/design/DES-11-global-systems-map.md`
- `docs/design/DES-12-interface-schemas.md`
- `docs/design/DES-13-rules-framework.md`
- `docs/design/DES-15-persistence-lore-pipeline.md`
- `docs/design/DES-16-lore-publishing-cadence.md`
- `docs/design/DES-17-multiplayer-hub-stack.md`
- `docs/design/DES-EDGE-01-contested-move-playbook.md`
