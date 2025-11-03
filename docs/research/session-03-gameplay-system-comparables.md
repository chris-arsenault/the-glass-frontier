# Session 03 – Gameplay & System Comparables

Backlog anchor `RES-03` examines how cooperative GM-style RPGs orchestrate success checks without breaking immersion, informing The Glass Frontier’s approach to automated yet transparent resolution.

## Research Goals
- Survey tabletop and digital narrative RPGs that balance freeform narration with clearly signposted resolution mechanics.
- Identify automation hooks that a background “check runner” service can leverage while keeping the GM engine’s conversational tone intact.
- Capture risks and follow-ups for systems design and tooling.

## Comparative Systems Overview

| Experience | Medium | Resolution Pattern | Transparency & Player Expectation | Automation Hooks for TGF | Sources |
|------------|--------|--------------------|----------------------------------|--------------------------|---------|
| **Blades in the Dark** | Tabletop (Forged in the Dark) | Build pooled d6 rolls from Action rating; GM sets Position/Effect; 1-3 fail, 4/5 mixed, 6 full, double 6 crit; progress clocks track longer tasks. | Players always know Position/Effect before rolling and can resist consequences via stress; clocks visualise incremental gains. | Background service can parse declared Action + Position metadata, roll dice, update shared clock objects, and surface consequence templates for the GM to narrate. | John Harper, *Blades in the Dark* (2017). |
| **Apocalypse World / PbtA family** | Tabletop | Fiction-first “moves”: 2d6 + stat; 10+ strong hit, 7-9 partial, 6- miss with MC move. | Triggering moves is conversational; outcomes map to three predictable bands, keeping stakes explicit. | Intent classifier can map player input to move archetype, pull stat from character sheet, and return tiered outcome scaffolding for the GM’s prose. | D. Vincent Baker & Meguey Baker, *Apocalypse World 2e* (2017). |
| **Fate Core System** | Tabletop / Digital toolsets (Roll20, Foundry) | 4 Fate dice (−1/0/+1) + Approach vs ladder target; Aspects invoked for +2 or reroll; stress tracks absorb hits. | Ladder names (Mediocre→Legendary) make difficulty legible; Aspects are explicitly declared for boosts. | Service evaluates ladder target, tracks spendable Fate points, and proposes outcome text keyed to final ladder grade for the GM engine. | Fred Hicks & Rob Donoghue, *Fate Core System* (2013). |
| **Ironsworn / Starforged** | Solo/Co-op TTRPG with oracle support | Action roll: d6 + stat vs two d10 challenge dice; strong hit, weak hit, miss; momentum/asset tags modify outcomes; oracles supply prompts. | Outcome bands and oracle tables are front-loaded; solo drivers rely on structured prompts for narration. | Background runner handles Action vs Challenge comparison, adjusts momentum, and surfaces oracle prompts the GM engine can weave into chat output. | Shawn Tomkin, *Ironsworn* (2018); *Ironsworn: Starforged* (2022). |
| **Citizen Sleeper** | Narrative digital RPG | Pool of d6 generated each “cycle”; player assigns dice to actions with fixed difficulty tiers; clocks track story arcs. | UI exposes odds before commitment; partial success clocks show what progress will be gained. | GM console can emulate dice pool generation per scene beat, offer suggested assignments based on stakes, and update campaign clocks while the LLM narrates. | Gareth Damian Martin, *Citizen Sleeper* (2022) developer interviews. |

## Success-Check Orchestration Patterns

### Fiction-First Move Templates (PbtA)
- **Trigger detection:** Moves fire when narrative fiction matches a template (e.g., “act under fire”). Requires intent classification and context tags.
- **Automation path:** Background service detects move, fetches relevant stat, rolls 2d6, and returns structured payload: `{resultBand, consequenceHooks, followUpQuestions}`.
- **Narrative integration:** GM engine paraphrases payload, offering player-facing options while staying in-character.

### Position & Effect Negotiation (Forged in the Dark)
- **Inputs:** Declared action, Position, Effect, assist/devil’s bargain flags, stress budget, active clocks.
- **Automation path:** Service confirms modifiers, rolls pooled dice, increments or creates clocks, and emits consequence templates tied to Position.
- **Narrative integration:** GM engine references which clock segments filled and describes fallout, while inviting Resist rolls the player can accept or decline.

### Aspect Ladder Resolution (Fate)
- **Inputs:** Approach score, difficulty ladder, invoked Aspects, Fate point state.
- **Automation path:** Service resolves 4dF, applies modifiers, and determines ladder tier delta (e.g., “beat by +2”). It can also suggest compels or boosts.
- **Narrative integration:** GM engine states the ladder outcome (“Great success”) and proposes how invoked Aspects manifest in fiction.

### Action vs Challenge Comparison (Ironsworn/Starforged)
- **Inputs:** Stat, adds from assets/momentum, scene challenge rating.
- **Automation path:** Service rolls the action die, two challenge dice, checks for weak/strong hits, applies momentum resets, and can select oracle prompts keyed to hit level.
- **Narrative integration:** GM engine cites oracle flavor and momentum shifts, reinforcing stakes without exposing raw numbers unless requested.

### Dice Assignment Planning (Citizen Sleeper)
- **Inputs:** Generated dice pool, action difficulty tiers, risk/reward clocks.
- **Automation path:** Service suggests optimal die placement based on desired risk posture, updates action clocks, and flags “safe” vs “desperate” outcomes reminiscent of FitD language.
- **Narrative integration:** GM engine interprets assigned dice as fictional effort choices (“You burn the 5 on negotiating core access...”), preserving player authorship while keeping math backstage.

## Automation & Data Requirements
- Maintain structured **character loadouts** (stats, assets, stress/momentum, Fate points) exposed to the check runner.
- Tag **scene context**: tone, hub/non-hub, risk posture, relevant clocks, safety constraints.
- Provide **intent classifiers** trained on move/action taxonomies; allow GM overrides to keep authorial control.
- Store **oracle and consequence libraries** keyed to result bands so automated outputs stay flavour-consistent with tone bible data.
- Log **check transcripts** (inputs, rolls, outcomes) for post-session auditing and Story Consolidation pipelines.

## Autonomy & Immersion Tradeoffs
- **Over-automation risk:** If checks resolve before the GM contextualizes, players may feel railroaded; require the GM engine to confirm stakes before triggering automation.
- **Transparency balance:** Expose result bands and narrative stakes in chat (“Strong Hit – You seize initiative”) while leaving raw dice optional to avoid math clutter.
- **Safety alignment:** Automatically compare requested outcomes against the Prohibited Capabilities List and offer grounded alternatives on weak hits or misses.
- **Pacing control:** Background runner should throttle repeated rolls, prompting scene shifts when clocks complete or risks escalate beyond tone guardrails.

## Implications for The Glass Frontier
- Implement a **Check Runner microservice** that ingests structured intent payloads (action archetype, stat, modifiers) and returns narrative-friendly result scaffolds for the GM engine.
- Extend the **session memory store** to track resolution artifacts: progress clocks, momentum, stress, and oracle selections, enabling consistent follow-up scenes and post-session deltas.
- Design GM console widgets mirroring FitD clocks and Fate ladders so humans (or oversight tools) can audit automated outcomes in real time.
- Build training data from PbtA move templates and Ironsworn oracles to teach the classifier how to align player prose with mechanical hooks without imposing verb lists.
- Prioritize **descriptive prompts** that invite players to author consequences on 7-9 / weak hits, keeping co-authorship central even when math runs in the background.

## Risks & Follow-Up Questions
- How will we calibrate difficulty ladders and Position definitions so the automation remains fair across varied playstyles?
- What governance process confirms oracle libraries and consequence templates stay within tone bible limits as content scales?
- Do we need offline reconciliation when automated clocks and admin-reviewed deltas disagree on world impact severity?
- How will the system expose roll history to moderators without leaking spoilers during live sessions?

## Source Notes
- Harper, John. *Blades in the Dark*. Evil Hat Productions, 2017.
- Baker, D. Vincent, and Meguey Baker. *Apocalypse World*, 2nd ed. Lumpley Games, 2017.
- Hicks, Fred, and Rob Donoghue. *Fate Core System*. Evil Hat Productions, 2013.
- Tomkin, Shawn. *Ironsworn*. 2018; and *Ironsworn: Starforged*. Absolute Tabletop, 2022.
- Martin, Gareth Damian. *Citizen Sleeper*. Jump Over the Age, 2022 developer postmortems and interviews.
