# Narrative Time Delta System — Implementation Guide

## Goal
Provide the narrative engine with a dynamic but consistent sense of *temporal progress*. Each turn should carry an implicit **time delta** that reflects how far the story moves forward, scaled to the current narrative pace (e.g., battle seconds, travel hours, settlement days).  
The system is not a hard rule but a *narrative metronome* that keeps pacing coherent.

---

## Core Concept
Every **Action** or **Planning** intent should advance story time by a *meaningful and contextually scaled increment* — the **narrative time delta**.

The delta is not fixed; it’s refined by the narrative engine over time based on the current scene’s **time scale**, **player behavior**, and **story state**.

---

## Time Delta States

| Label | Approx. Duration | Typical Context | Description |
|--------|------------------|------------------|--------------|
| **Moment** | Seconds to a few minutes | Combat, reactions, single actions | High tension, micro-detail; each turn covers a heartbeat or brief action sequence. |
| **Scene** | Minutes to an hour | Exploration, conversation, investigation | Standard story pace; actions unfold within a cohesive scene. |
| **Interval** | Hours to half a day | Travel, rest, preparation | Moderate compression; time passes naturally between beats. |
| **Cycle** | Day or multi-day | Downtime, settlement management | Broad strokes; events are summarized narratively. |
| **Epoch** | Weeks, months, or years | Construction, campaigns, societal change | Long-term narrative arcs; events described in montage or summary form. |

---

## Workflow Overview

### 1. Determine Current Time Scale
At the start of each turn (or chronicle), the narrative engine should infer or confirm the **active time scale** based on:
- **Recent events** (e.g., last turn’s time delta)
- **Player intent type** (combat vs. travel)
- **Scene tags or location context** (battlefield vs. city)
- **GM narrative tone** (fast-paced vs. reflective)

If uncertain, default to **Scene** scale.

---

### 2. Establish Time Delta for the Turn
When handling an **Action** or **Planning** intent:
- Use the **current time scale** to set an approximate time delta.
- Express it narratively (not numerically), e.g.:
  - *“Moments later…”* (Moment)
  - *“After some minutes of careful searching…”* (Scene)
  - *“By sundown, you finish packing the wagon.”* (Interval)
  - *“The next morning, your camp is quiet and ready.”* (Cycle)
  - *“Months pass as your colony expands.”* (Epoch)

For **Inquiry**, **Clarification**, **Possibility**, and **Reflection**, the delta remains **zero** — the scene’s clock pauses.

---

### 3. Adjust the Delta Dynamically
The narrative engine should refine the time delta as context changes:
- **Compression:** When repetitive or low-detail actions dominate (e.g., travel), gradually shift from *Scene → Interval → Cycle*.
- **Expansion:** When tension or precision increases (e.g., combat), shift *Cycle → Scene → Moment*.
- **Anchor points:** On significant events (discoveries, outcomes, transitions), reset or confirm the current scale.

This dynamic adjustment allows pacing to breathe while maintaining logical continuity.

---

### 4. Persist the Time Context
Each turn record should store:
- `timeScale` — current global narrative scale (Moment → Epoch)
- `timeDelta` — textual or symbolic descriptor of time progression
- `advancesTime` — boolean (true for Action/Planning with delta > 0)
  
When a new turn begins, default to the last turn’s `timeScale` unless the scene or intent suggests otherwise.

---

### 5. Use Delta to Guide Narrative Generation
The **narrative weaver** prompt should include clear temporal guidance:
- Describe how far the story moves forward this turn.
- Reflect elapsed time in tone, pacing, and description.
- When transitioning between scales, *acknowledge the shift* (e.g., “Hours later…”).

Example directive for the narrative model:
> “Assume this turn advances the story by roughly [time delta]. Reflect the passage of time naturally in your narration, maintaining continuity with the previous turn.”

---

## Example Flow

| Turn | Intent | Scene Context | Determined Time Scale | Resulting Time Delta | Narrative Expression |
|------|---------|----------------|------------------------|----------------------|----------------------|
| 1 | Action | Combat | Moment | ~5 seconds | “You duck beneath the sword and counter in a flash.” |
| 2 | Action | Exploration | Scene | ~10 minutes | “After prying the last stone loose, the mechanism clicks.” |
| 3 | Planning | Travel | Interval | ~6 hours | “By dusk, the forest thins and the road widens.” |
| 4 | Planning | Rest | Cycle | ~1 day | “The night passes quietly, save for the chirping insects.” |
| 5 | Action | City construction | Epoch | ~1 month | “Weeks of effort yield the first stone foundations.” |

---

## Prompt Integration (High-Level)

When constructing prompts for the narrative weaver:
- Pass in `currentTimeScale` and `suggestedTimeDelta` from session state.
- Include instruction:
  > “Advance the story naturally by the suggested amount of time, unless the player’s action demands otherwise.”
- Allow the engine to revise the scale when narrative tension or pacing requires a change.

---

## Minimal Acceptance Criteria
- Each Action or Planning turn sets and applies a time delta consistent with its scale.  
- The current time scale persists across turns until context shifts.  
- Non-advancing intents retain the same temporal moment.  
- The narrative engine reflects elapsed time naturally in prose and maintains coherent pacing between turns.
