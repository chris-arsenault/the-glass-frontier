# DES-13 – Narrative Rules Framework & LLM Hand-Off

Backlog anchor: `DES-13`, Feature: `DES-CORE`

## Purpose
Define the mechanical scaffolding that lets The Glass Frontier deliver transparent narrative adjudication without constraining freeform play. This artefact codifies the success ladder, move taxonomy, and modifier economy while detailing how the Narrative Engine cooperates with the Temporal-driven Check Runner, moderation filters, and Web UI to keep players informed and empowered.

## Design Principles
- **Narrative-first:** Mechanics illuminate stakes and consequences but never supersede player creativity. Every rule must bend toward collaborative storytelling.
- **Transparent automation:** Background checks, modifiers, and safety overrides remain observable through structured events and UI cues.
- **Audit-friendly:** Temporal workflows, moderation actions, and LLM prompts are reproducible so disputed outcomes can be reviewed.
- **Momentum matters:** Advantage and disadvantage evolve from fictionally earned momentum, not arbitrary buffs.
- **Safety embedded:** Prohibited capabilities and content policies gate outcomes before narration hits the player.

## Success Ladder

| Tier | Mechanical Criteria | Narrative Guidance | Momentum Impact | UI Disclosure |
|------|---------------------|--------------------|-----------------|---------------|
| `critical-success` | Total ≥ difficulty + 4 **or** doubles with advantage flag | Player intent lands flawlessly plus introduces a beneficial surge (ally, resource, narrative twist). | +2 momentum | Chat message annotated with `checkReference` and badge; overlay lists surge effect. |
| `full-success` | Total ≥ difficulty | Goal achieved as described; narrator may offer optional flourish. | +1 momentum | Check overlay shows roll breakdown with green state. |
| `partial-success` | Total ≥ difficulty − 1 | Player gets what they want with a complication seeded from request envelope. | +0 momentum | Overlay highlights complication call-out; transcript tags the hook. |
| `fail-forward` | Total ≥ difficulty − 3 | Progress with grim cost; system surfaces `complication` plus `fallbackPrompt` for GM improv. | −1 momentum | Toast indicates fail-forward; pacing ribbon notes risk spike. |
| `hard-miss` | Total < difficulty − 3 **or** safety veto | Action backfires; system suggests soft move for GM plus flags safety review if vetoed. | Reset momentum to baseline | Overlay marks red state; admin alert emitted when veto triggered. |

- **Difficulty bands:** Default difficulty = 8 on 2d6+stat scale. Scenes can flex ±2 based on fiction. Resistances (NPC tier, environment hazard) map to additive modifiers in `intent.checkRequest.mechanics`.
- **Critical floor:** Advantage may escalate partials to full successes when creative input meets “rule of cool” prompt conditions.

## Momentum & Modifiers
- **Momentum score:** Integer stored in session memory (`momentum.current`, `momentum.floor`, `momentum.ceiling`). Starts at 0, clamps between −2 and +3.
- **Advantage/Disadvantage:**
  - Advantage triggers when momentum ≥ +2 or when the Narrative Engine tags player input with `creativeSpark: true`.
  - Disadvantage triggers when momentum ≤ −2 or when safety checks flag risky behavior (`safetyFlags` includes `reckless`).
- **Rule of Cool:** LangGraph node evaluates player utterance against creativity heuristics (novel verb usage, callback to lore, collaborative setup). When `true`, `mechanics.bonusDice` increments by 1 and `result.rationale` documents the justification.
- **Complication Seeds:** Derived from `intent.checkRequest.trigger.narrativeTags` and session safety context so fail-forward moments stay tethered to the scene.
- **Stat Mapping:** Core stats—`ingenuity`, `resolve`, `finesse`, `presence`, `weird`. Each move tag maps to a default stat, overridable per scene via `mechanics.statOverride`.

## Move Taxonomy & Tagging
- **Move Families:** `risk-it-all`, `sway-a-faction`, `delve-the-ruins`, `hack-the-signal`, `fortify-the-hub`, `mend-the-broken`, `discern-the-truth`, `channel-the-veil`.
- **Tags:** Moves are applied as arrays on `intent.checkRequest.trigger.detectedMoveTags` to support hybrid actions (e.g., `["risk-it-all","channel-the-veil"]`).
- **Hub Commands:** Structured verbs (`/move`, `/trade`, `/inspect`) emit `hub.moveRequest` which map to the same taxonomy for downstream consolidation.
- **Override Hooks:** GM can emit `system.directive` events to temporarily reshape the taxonomy (e.g., seasonal event granting `tag:storm-chaser`). Overrides stored with `expiresAt` to enforce reversion.
- **Safety Alignment:** Each move references the Prohibited Capabilities matrix; if a player attempts banned action, the Narrative Engine routes to moderation flow before check evaluation.

## LLM ↔ Rules Hand-Off
1. **Intent Parsing:** LangGraph “Rules Router” node parses player utterance, identifies move family, stakes, and suggested stat using embeddings and lexicon gleaned from RES artefacts.
2. **Prompt Framing:** Router formats `rulesContextPrompt` with:
   - Move description + relevant lore snippets.
   - Momentum state and safety flags.
   - Candidate difficulty plus modifiers and justification.
   - Prior turn outcomes to maintain continuity.
3. **Guardrails:** Safety filter runs before prompt dispatch, blocking prohibited capabilities and sensitive content. Violations raise `event.checkVetoed` with `reason: "prohibited-capability"`.
4. **Temporal Dispatch:** Router emits `intent.checkRequest` with `rulesContextPrompt` hashed into `metadata.promptHash` for auditing. Temporal workflow seeds deterministic dice using `sessionId` + `turnSequence`.
5. **Workflow Execution:** Temporal activity resolves dice, applies modifiers, and emits `event.checkResolved` including `rationale` narrative plus `latencyMs`.
6. **Result Integration:** LangGraph “Narrative Weaver” merges `narrativePrompts` with live prose, tags transcript lines with `ruleTier` and `momentumDelta`.
7. **Moderation Tap:** If `result.tier = hard-miss` or `safetyFlags` present, the Weaver duplicates payload to `admin.alert` so moderators can override or annotate.

## Moderation & Safety Schema
- **Prohibited Capability Registry:** Managed via Admin console; stored as structured list consumed by Rules Router. Schema includes `capabilityId`, `description`, `severity`, `replacementGuidance`.
- **Safety Flags:** `safetyFlags` array supports values: `reckless`, `content-warning`, `consent-required`, `lore-violation`. Each flag triggers different UI overlays and escalation paths.
- **Override Flow:** Moderators can inject `moderation.decision` referencing `auditRef` to nullify or amend outcomes. Narrative Engine replays the turn with updated directive.
- **Logging:** Every check and moderation action logs to event store with `auditRef` tying back to session transcript.

## Player Transparency
- **UI Bindings:** `check.result` events bundle `tier`, `momentumShift`, and `complication`. Chat overlay surfaces badges and tooltips explaining why advantage/disadvantage applied.
- **Pacing Feedback:** Narrative Engine issues `session.marker` events when momentum crosses thresholds to encourage wraps or escalation.
- **Transcript Notation:** Each turn stores `turnMetadata` referencing `moveTags`, `momentum`, `ruleTier`, and `safetyFlags`. Offline pipeline uses this to summarize rule usage in wiki stories.

## Artefact Deliverables
- `docs/design/diagrams/DES-13-rules-flow.mmd` (sequence diagram between LangGraph, Rules Router, Temporal workflow, and moderation tap).
- MCP architecture decision `80b1e54f-5052-4d77-a3ca-ca73dd99c08a` covering narrative rules enforcement and Temporal hand-off.
- Planned follow-up backlog items: contested move edge cases, hub PvP resolution, and moderation override UX.

## Risks & Open Questions
- **Contested Moves:** Needs clarification for multiple actors vying for same objective; likely DES-14 follow-up.
- **PvP Interactions:** Hub duels may require simultaneous checks with shared complications.
- **LLM Drift:** Prompt packets risk prompt injection; require canonical prompt templates and sanitization.
- **Latency Variance:** Advantage math must remain deterministic to prevent fairness disputes; benchmarking backlog will validate.
- **Offline Reconciliation:** Ensure fail-forward outcomes tagged `needs-confirmation` are prioritized in Story Consolidation workflows.

## References
- `REQUIREMENTS.md`
- `DES-11 – Global Systems Map`
- `DES-12 – Interface Schemas & Accessibility Hooks`
- MCP architecture decision `87fc0d21-0b54-463e-85c0-02f9a903004f`
- MCP architecture decision `45bccdf8-7ab8-47e4-8cb9-6ccda3ef720e`
