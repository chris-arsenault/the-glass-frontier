# DES-EDGE-01 – Contested Move Resolution Playbook

Backlog anchor: `DES-EDGE-01`, Feature: `DES-CORE`

## Purpose
Frame a reusable pattern for adjudicating contested moves when multiple actors pursue conflicting goals at the same narrative beat. The playbook extends the DES-13 momentum ladder so simultaneous checks remain transparent, auditable, and rare—preserving freeform storytelling while giving moderators clear override hooks.

## Design Principles
- **Narrative-first cadence:** Contests trigger only when simultaneous intents materially collide; otherwise, default to sequential narration to avoid over-gamifying scenes.
- **Fair + deterministic:** Shared dice seeds, synchronized modifiers, and explicit tie-breakers prevent hidden advantages.
- **Single complication queue:** Complications materialize once, cascade to all participants, and feed downstream reconciliation.
- **Full disclosure:** Players see every participant’s roll context, tier, and resulting complication in the chat UI and overlays.
- **Moderator observability:** Contest packets mirror to admin dashboards with audit tokens, flagging safety overrides and veto triggers.

## Contested Move Scenarios
| Scenario | Trigger | Contest Shape | Additional Notes |
|----------|---------|---------------|------------------|
| **Opposed action** (combat clash, sabotage) | Two actors declare incompatible intents within a 1–2 turn window | Shared `contestId` with mirrored move family (e.g., `risk-it-all`) | Safety filter evaluates both intents before contest formation. |
| **Social duel** (debate, sway vs. resist) | Player persuasion meets an NPC or rival player counterpoint with stated stakes | Dual check bundle mixing `sway-a-faction` and `resolve`-focused defensive move | Complication queue seeds fallout threads for post-session consolidation. |
| **Race/chase** (escape vs. pursuit) | Movement intents targeting same objective where momentum differentials matter | Multi-actor bundle where rank order determines position deltas | Injects `pacing marker` events when chase nears completion to comply with breakpoint UI cues. |

**Hub implementation note:** `IMP-HUBS-05` now exposes duel, sparring, and social confrontation verbs (`verb.challengeDuel`, `verb.sparringMatch`, `verb.clashOfWills`). Sparring flows prioritise consent cues (`moderationTags: ["hub-pvp","consent-required"]`) while social clashes lean on rhetoric tags, ensuring moderation dashboards can distinguish training rounds from high-stakes disputes. Refer to `artifacts/hub/contest-moderation-2025-11-04T07-39-50-547Z.json` for armed → launched → resolved payload samples destined for the dashboard.
## Coordination Workflow
Refer to `docs/design/diagrams/DES-EDGE-01-contested-move-flow.mmd` for sequence detail.

1. **Intent Intake & Collision Detection**
   - LangGraph Rules Router stamps each `intent.checkRequest` with `collisionHints` (target entity, stakes, timing).
   - A lightweight `contestCoordinator` service watches the Temporal queue for matching hints within the same `sessionId`. Window defaults to 8 seconds or 2 turns, whichever arrives first.
2. **Contest Bundle Formation**
   - Coordinator emits `contest.bundle` with `contestId`, ordered participant list, shared complication seeds, and deterministic `contestSeed`.
   - Each participant retains their own move tags, stats, and modifiers inherited from DES-13. Momentum influences advantage/disadvantage independently.
3. **Parallel Check Resolution**
   - Temporal spawns child workflows (`contest.check`) per participant using the shared `contestSeed` to derive dice seeds (`hash(contestSeed + participantId)`), ensuring reproducible randomness.
   - Child workflows emit provisional results (`contest.checkResult`) including tier, `momentumDelta`, complication suggestions, and latency metrics.
4. **Resolution Ordering & Tie-Breaking**
   - Coordinator ranks results by ladder tier > total roll > current momentum > stat rating > random draw (using shared seed to keep tie-break deterministic).
   - Highest-ranked participant claims the primary narrative outcome; lower tiers inherit partial or fail-forward templates.
   - Shared complication queue de-duplicates complications by tag before distribution.
5. **Narrative Weaving & UI Disclosure**
   - Narrative Weaver crafts a combined response packet with: ordered outcome summaries, shared complications, and follow-up prompts.
   - Web UI displays a contested badge on the turn block, collapsible detail per participant (roll breakdown, modifiers, momentum shifts).
   - Participants receive inline guidance on what partial/failed outcomes mean to preserve agency.
6. **Telemetry & Moderation Hooks**
   - `telemetry.contest` event captures contest metadata, participant tiers, complications, and moderator actions.
   - Safety or moderation veto triggers `contest.override` with audit references, re-queueing the contest if necessary.
7. **Post-Session Integration**
   - Story Consolidation pipelines treat the bundle as a single narrative beat, keeping complication notes grouped for editors.
   - Delta Determination prioritizes the highest-tier outcome while marking subordinate results as supporting evidence.

## Shared Complication Queue
- Stored as ordered list of `{tag, description, severity, appliedTo}` objects on the contest bundle.
- First participant to trigger a complication pushes it into the queue; subsequent participants reference existing entries instead of generating duplicates.
- Queue feeds both live UI (`complicationDrawer`) and offline reconciliation tasks to ensure consequences remain coherent.

## UI & Transparency Requirements
- Chat transcript tags contested turns with `ruleContext: "contested"` and `contestId`.
- Overlay surfaces per-participant cards showing:
  - Dice expression and final total
  - Momentum before/after
  - Advantage/disadvantage reasons
  - Applied complications (referencing shared queue IDs)
- Pacing ribbon emits a `contest` marker so players know the scene consumed additional resolution bandwidth.
- Accessibility: ensure screen reader flow announces participant names and outcome tiers sequentially; reuse DES-12 aria pattern tokens.

## Telemetry & Audit Trails
- Emit `telemetry.contest.start` and `telemetry.contest.resolved` events with timing deltas to track latency vs. DES-BENCH-01 targets.
- Attach `auditRef` referencing the originating `intent.checkRequest` IDs for replay.
- Flag contests with `moderationWatch: true` when move tags intersect Prohibited Capabilities matrix.
- Store aggregated stats (tiers, complications, momentum shifts) for analytics on contest frequency—should remain below 5% of total checks.

## Dependencies & Follow-Ups
- **DES-PVP-01:** Inherit contested workflow for hub PvP verbs; add hub command envelopes and role-based safety overrides.
- **DES-MOD-01:** Define admin UI to intervene on `contest.override` events, including partial replay and forced outcome injection.
- **DES-BENCH-01:** Validate parallel workflow latency under contest bundles; adjust window size based on benchmark findings.
- Offline pipeline updates to ensure consolidated stories annotate contests for editors (tag `contest: true`).

## Risks & Mitigations
- **Overuse of contests:** Mitigate by requiring explicit collision hints from Narrative Engine; fallback to sequential narration otherwise.
- **Latency spikes:** Parallel workflows may double check load; DES-BENCH-01 will tune contest window and child workflow concurrency caps.
- **Narrative confusion:** Ensure shared complications contain plain-language summaries and link to follow-up prompts so players understand consequences.
- **Moderation load:** Contests with safety flags auto-escalate to admin dashboard; moderation backlog should monitor frequency metrics.

## References
- `REQUIREMENTS.md` (conflict tooling is exceptional, not default loop)
- `docs/design/DES-13-rules-framework.md`
- MCP pattern `momentum-driven-success-ladder`
- Architecture decision `80b1e54f-5052-4d77-a3ca-ca73dd99c08a`
