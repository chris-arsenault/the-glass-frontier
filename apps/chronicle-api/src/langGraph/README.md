# LangGraph GM DAG Overview

This document explains how the Chronicle GM graph is currently wired and what context each prompt receives. Treat it as the reference point before introducing new concepts (NPC state, faction influence, etc.).

## High-Level Flow

```
Player Message
   ↓
Intent Intake
   ├─► Beat Detector
   └─► Skill Detector (action/inquiry only)
          ↓
      Check Planner ──┬─► Action Resolver
                      │   Inquiry Responder
                      │   Clarification Responder
                      │   Possibility Advisor
                      │   Planning Narrator
                      └─► Reflection Weaver
                           ↓
              Location Delta ─► Inventory Delta
                           ↓
                  GM Summary
                           ↓
                  Beat Tracker
                           ↓
                 Update Character
```

### Node Responsibilities

| Node | Purpose | Notes |
|------|---------|-------|
| **IntentIntakeNode** | Classifies the utterance (intent type, tone, summary, risk). | Emits router confidence/rationale plus baseline `playerIntent`. Uses `gpt-5-nano`. |
| **BeatDetectorNode** | Tags the turn with a beat directive (existing/new/independent). | Uses `intent-beat-detector` template and runs on `gpt-5-nano`. |
| **SkillDetectorNode** | Chooses best-fit skill + attribute (action/inquiry intents only). | Uses `skill-detector` template and runs on `gpt-5-nano`. |
| **CheckPlannerNode** | Runs only for action or risky planning turns. Generates `skillCheckPlan` and pre-resolves `skillCheckResult`. | Branches to the correct handler ID so later nodes can short-circuit. |
| **Intent Handler Nodes** | Produce the GM response for their intent type. | Each handler writes `gmMessage`, `handlerId`, `worldDeltaTags`, `advancesTimeline`, and sets `resolvedIntentType`. |
| **LocationDeltaNode** | Moves scene anchors only when intents advance the world. | Uses `location-delta` template output to build location plans. |
| **InventoryDeltaNode** | Applies equip queues and LLM-driven deltas for Action/Planning turns. | Returns both display and persistence deltas so UpdateCharacter can persist state. |
| **GmSummaryNode** | Produces a short line for transcripts/logging and wrap-up heuristics. |
| **BeatTrackerNode** | Updates beat state using GM/system output and intent directives. |
| **UpdateCharacterNode** | Persists character inventory, momentum, skill gains, plus location state. |

## Prompt Templates & Inputs

Below are the prompts the graph invokes and the canonical parameters you can rely on when extending behavior.

### `intent-intake.hbs`

| Key | Description |
|-----|-------------|
| `playerMessage` | Raw player utterance. |
| `attributeList` / `attributeQuotedList` | All allowed attributes. |
| `beatsSection` / `totalBeatCount` | Text summary + count of active beats. |
| `characterName`, `characterTags` | Player character identity for grounding. |
| `locale` | Current location description. |
| `skillsLine` | Comma-separated skill names. |
| `promptHeader` | Instruction header aligning the LLM. |

Template output must include `intentSummary`, `intentType`, `tone`, `requiresCheck`, `creativeSpark`,
`handlerHints`, plus router confidence/rationale. It no longer tags beats or selects skills.

### `intent-beat-detector.hbs`

| Key | Description |
|-----|-------------|
| `playerMessage` | Raw utterance. |
| `intentSummary`, `intentType` | Classifier output. |
| `beatsSection`, `totalBeatCount` | Render-ready beat list. |

Returns a single `beatDirective` block specifying kind / target beat id / summary.

### `check-planner.hbs`

| Key | Description |
|-----|-------------|
| `attribute`, `skill` | The resolved mechanical vector. |
| `characterName`, `characterTags`, `skillsLine` | Additional context for determining advantage. |
| `intentSummary` | Short text from the router. |
| `locale` | Current location details. |
| `momentum` | Latest momentum value for tone. |

Expected output fields: `riskLevel`, `advantage`, `rationale`, `complicationSeeds`.

### `skill-detector.hbs`

| Key | Description |
|-----|-------------|
| `playerMessage` | Raw utterance. |
| `intentSummary`, `intentType` | Classifier output. |
| `characterTags`, `skillsLine` | Skill list to prefer existing names. |
| `locale`, `attributeList`, `attributeQuotedList` | Help pick attribute context. |

Outputs `skill`, `attribute`, and optional `handlerHints`. Only invoked for action/inquiry turns.

### Intent Handler Templates

All handler prompts receive the same base payload (via `compose*Prompt`) with these fields:

| Key | Description |
|-----|-------------|
| `characterName`, `characterTags` | Ground character perspective. |
| `locale`, `momentum` | Scene context. |
| `playerMessage` / `playerUtterance` | Raw text (long + truncated). |
| `intentSummary`, `intentAttribute`, `intentTone`, `skillLine` | Normalized intent data. |
| `checkAdvantage`, `checkDifficulty`, `checkOutcome`, `hasSkillCheck` | Present when a check ran. |
| `activeBeatLines`, `beatCount`, `hasActiveBeats` | Array of formatted beats. |
| `recentEvents` | Last 10 GM/player snippets stitched together. |
| `handlerMode` | One of `action`, `inquiry`, `clarification`, `possibility`, `planning`, `reflection`. |
| `wrapUpRequested`, `wrapTargetTurn`, `wrapTurnsRemaining`, `wrapIsFinalTurn` | Wrap toggle state. |

Individual templates lean on these values as follows:

| Template | Key Behaviors |
|----------|---------------|
| `action-resolver` | Uses check metadata to scale consequence. Optionally adds world delta tags when prompting for follow-up hooks. |
| `inquiry-describer` | Ignores checks, focuses on sensory render. Should not reference `advancesTimeline`. |
| `clarification-retriever` | Produces concise text without prose; wraps only existing facts. |
| `possibility-advisor` | Presents options and highlights risks using `recentEvents`, `activeBeatLines`, and `momentum`. |
| `planning-narrator` | Applies minor time deltas using `wrap*` info and optional check result to determine readiness. |
| `reflection-weaver` | Uses `intentTone` + `recentEvents` to craft introspection; no deltas. |

### Supporting Templates

| Template | Inputs |
|----------|--------|
| `location-delta.hbs` | `current`, `parent`, `children`, `adjacent`, `links`, `player_intent`, `gm_response`. Guides scene graph traversal. |
| `inventory-arbiter.hbs` | `gm_narration`, `gm_summary`, `intent_*`, `inventory_json`, `pending_equip_json`, `registry_json`, `revision`. |
| `gm-summary.hbs` | `gmMessage`, `intentSummary`, `wrap*`, check metadata. |
| `beat-director.hbs` | `beats`, `intentDirective`, `gmMessage`, `gmSummary`, `playerUtterance`. Used by BeatTrackerNode. |

## Adding New Concepts

1. **Extend DTOs first** so intent metadata or turn state is serialized everywhere (`packages/dto`).
2. **Update the intent router and templates together** when introducing new utterance categories so downstream handlers keep a stable contract.
3. **Feed new context through `PromptTemplateRuntime`**—extend `shared.ts` payload builders instead of injecting ad-hoc keys.
4. **Guard side-effect nodes** (Location/Inventory) so they only run when the new intents should mutate state.
5. **Surface metadata in the client** via `ChatMessage` extras to keep the UI consistent.

By keeping this DAG contract stable, future agents can add specialized nodes (e.g., NPC simulators, faction trackers) by hanging new edges off the handler outputs or between side-effect stages without breaking the existing turn pipeline.***
