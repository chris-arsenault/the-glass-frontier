# GM Intent System — High-Level Implementation Guide

## Goal
Add non-action intent paths to the GM pipeline while preserving the current action flow. Route each player input to the correct handler, generate the appropriate style of response, and apply world changes only when warranted.

---

## Core Intent Types (in scope)

### 1. Action
**Purpose:** Resolve player actions and advance the scene.  
**Output:** Decisive outcome prose with consequences.  
**Pipeline:** Requires skill check when uncertain → apply world deltas.

### 2. Inquiry (environment, lore, social)
**Purpose:** Provide descriptive, sensory, or contextual information.  
**Output:** Focused descriptions; may hint at affordances.  
**Pipeline:** No skill check; no world deltas.

### 3. Clarification
**Purpose:** Answer short, factual questions about the current situation.  
**Output:** Concise, non-prosey confirmation or correction.  
**Pipeline:** No skill check; no world deltas.

### 4. Possibility / Hypothesis
**Purpose:** Expose viable options, constraints, and risks before acting.  
**Output:** Conditional guidance (“you could… costs/risks… likely outcomes”).  
**Pipeline:** No skill check; no world deltas.

### 5. Planning / Strategy
**Purpose:** Summarize preparation, rest, travel, or setup.  
**Output:** Transitional narration that positions the next scene.  
**Pipeline:** Skill check only if preparation itself is risky; apply **minor** world deltas (e.g., time, readiness).

### 6. Reflection / Emotional
**Purpose:** Internal monologue, mood, values, and bonds.  
**Output:** Introspective narration with thematic hooks.  
**Pipeline:** No skill check; no immediate world deltas (optionally tag for later use).

---

## System Architecture

### A. Router
- Input: Player utterance + recent context.  
- Task: Classify into one of the six intent types.  
- Output: `{intentType, confidence, rationale}` to drive downstream selection.  
- Constraint: Single intent type per turn; if ambiguous, prefer **Action → Inquiry → Clarification** in that order.

### B. Handler Modules
Each module should define:
- **Eligibility rules** — when to run or escalate to another type.  
- **Prompt scaffold** — tone and scope of output.  
- **Side-effect policy** — when to request skill checks or world deltas.  
- **Response shape** — immersive prose vs. factual statement.

### C. Skill Check Gate
- Trigger only for **Action** and sometimes **Planning**.  
- Annotate uncertainty or risk; feed result to handler for final outcome.

### D. World Delta Applier
- **Action:** apply deltas.  
- **Planning:** apply minor, transitional deltas.  
- **Others:** none.

### E. Transcript / History Update
- Record: intent type, handler, skill check status, deltas applied, GM response.  
- Mark whether the turn **advances** the timeline.

---

## Pipeline Integration

### 1. Determine Player Intent
- Use router to classify input.  
- Return a single intent type and confidence.  
- Prefer **Action** when uncertain.

### 2. Route to Handler
- **Action → Action Resolver**  
  - Generate outcome preview; trigger skill check if uncertain.
- **Inquiry → Descriptive Generator**  
  - Provide grounded description; avoid advancing time.
- **Clarification → Factual Retriever**  
  - Return concise factual data.
- **Possibility → Advisory Synthesizer**  
  - Present options and risks; do not resolve.
- **Planning → Transition Narrator**  
  - Summarize preparations; minor timeline shifts only.
- **Reflection → Emotional Weaver**  
  - Produce internal narration; seed future themes.

### 3. Skill Check (conditional)
- Triggered only for **Action** or risky **Planning**.  
- Feed results back to handler for final prose.

### 4. Narrative Weaver (when applicable)
- For **Action**: describe concrete outcomes and consequences.  
- For **Planning**: produce brief transitional narrative.

### 5. Determine Game-World Deltas
- **Action:** compute and apply.  
- **Planning:** compute and apply minor deltas.  
- **Others:** skip.

### 6. Persist Turn
- Save intent type, handler, skill check status, delta info, and GM output.  
- Flag as **advancing** (Action/Planning) or **non-advancing** (others).

---

## Handler Guidance

### Action Resolver
- Resolve decisively and show consequences.  
- Lead with most impactful outcome.  
- Include hooks only if emerging naturally.

### Descriptive Generator (Inquiry)
- Describe exactly what’s asked; avoid unnecessary reveals.  
- Imply 1–2 actionable affordances.

### Factual Retriever (Clarification)
- Respond plainly and succinctly.  
- Correct player misunderstandings directly.

### Advisory Synthesizer (Possibility)
- Present multiple valid options with brief pros/cons.  
- Avoid bias or premature outcomes.

### Transition Narrator (Planning)
- Compress time; reflect readiness or repositioning.  
- Apply minimal state shifts unless risk warrants check.

### Emotional Weaver (Reflection)
- Emphasize internal tone and resonance with current scene.  
- Do not alter world state directly.

---

## Routing Heuristics

| Phrase Pattern | Likely Intent |
|-----------------|---------------|
| Clear verb of doing | **Action** |
| "What / who / where / how / can I see..." | **Inquiry** |
| "Wait / remind me / did we / what's my..." | **Clarification** |
| "Could I / would it be possible / can we..." | **Possibility** |
| "We prepare / we rest / I set up / we travel..." | **Planning** |
| "I feel / I think / I pray / I reflect..." | **Reflection** |

---

## Output Modes

| Intent Type | Style | Advances Time |
|--------------|--------|----------------|
| Action | Immersive prose | Yes |
| Inquiry | Evocative but contained | No |
| Clarification | Concise factual | No |
| Possibility | Advisory / conditional | No |
| Planning | Transitional prose | Sometimes |
| Reflection | Introspective prose | No |

---

## Minimal Acceptance Criteria
- Router identifies one of six intent types per player input.  
- Each type has a handler defining side-effect policy.  
- Skill checks only occur for **Action** (and risky **Planning**).  
- World deltas only apply to **Action** and **Planning**.  
- Transcript records intent type and whether the turn advanced time.
