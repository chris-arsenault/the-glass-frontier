# Session 02 – Extended Narrative Benchmarking

Research deliverable for backlog item `RES-02`, expanding Session 01's groundwork with additional exemplars, tone bible integration mapping, and preliminary tone drift safeguards for the GM console.

## Additional Narrative Exemplars

| Experience | Format | Tone Management Practices | Relevance to The Glass Frontier | Sources |
|------------|--------|---------------------------|---------------------------------|---------|
| **Ironsworn: Starforged** | Solo / co-op journaling TTRPG set in a haunted sci-fi frontier. | Leans on vow clarity, oracle prompts, and “truths” that players set up front; the GM role curates tone via asset tags and scene framing prompts. | Reinforces defining campaign truths and tone guardrails before play; informs how our GM prompt templates can expose tone bible anchors and ask the player to reaffirm them when sessions start or shift arcs. | Shawn Tomkin, *Ironsworn: Starforged* (2022); asset truth tables. |
| **Wanderhome** | GM-optional pastoral fantasy TTRPG focused on collaborative worldbuilding. | Uses seasonal journeys, vibe-setting token exchanges, and safety tools baked into playbooks to keep scenes restorative rather than grim. | Highlights lightweight rituals (seasonal check-ins, emotion tokens) that we can port into our chat UI as “tone pings” reminding the GM engine to reaffirm hopepunk beats amid harsher narrative beats. | Jay Dragon, *Wanderhome* (2021); Possum Creek Games design diaries. |
| **Coyote & Crow** | Sci-fi TTRPG grounded in Indigenous futurism with community-first storytelling. | Emphasizes cultural touchstones, community obligations, and guided scene intents to protect tone authenticity; rulebook includes explicit tone violations and how to steer away. | Provides a template for prohibited capability lists and cultural guardrails; informs our need to expose in-console tone breach examples and redirect options when the LLM edges toward colonialist or nihilistic tropes. | Coyote & Crow LLC, GM section on Tone & Themes (2022). |
| **Citizen Sleeper** | Narrative indie RPG with dice-driven story nodes released episodically. | Paces tone through limited actions per cycle, relationship clocks, and hard-coded mood text in UI overlays. | Suggests using UI overlays (relationship/standing meters) as tone amplifiers; these can feed memory context that nudges the GM engine toward bittersweet resilience rather than bleak despair. | Jump Over the Age, *Citizen Sleeper* (2022); developer postmortems. |

## Tone Bible Integration Points

- **GM Prompt Templates:** Prepend persona reminders with session-specific tone tags (e.g., `hopepunk`, `mythic echoes`) and require explicit acknowledgement when a scene transitions into a different tone band. Include short exemplar snippets harvested from the tone bible to ground the LLM in desired cadence.
- **Memory Stack Hooks:** Store per-session “tone snapshots” alongside character sheets (state: current tone anchors, audience flags, banned tropes). Update snapshots when the GM console registers a tone shift, allowing later prompts to reference “Last scene leaned into Mystic-Western tension; maintain ritualistic cadence.”
- **Post-Session Consolidation:** Feed tone metadata into the offline Story Consolidation pipeline so summaries, lore entries, and delta proposals inherit correct voice; flag mismatches when automated drafts diverge from stored tone descriptors.
- **Naming Toolkit Integration:** Attach tone-specific lexicon filters (e.g., `Industrial + Liturgy`) to the naming helper and expose them as quick actions in the GM console, reducing on-the-fly name drift.

## Tone Drift Alert Heuristics

| Heuristic | Detection Signal | GM Console Surfacing | Mitigation Prompt |
|-----------|------------------|----------------------|-------------------|
| **Power Creep Spike** | Player or GM introduces abilities flagged against the Prohibited Capabilities List or exceeds predefined capability tiers. | Inline warning banner with quick links to acceptable capability examples and optional “offer grounded alternative” button. | “Reframe the ability within tech-mystic constraints (e.g., ritual boost, limited charge) or introduce a narrative cost that keeps canon intact.” |
| **Genre Mood Collapse** | Consecutive responses fall below tone sentiment floor (e.g., multiple despair-themed outputs without counterbalancing hopepunk imagery). | Sidebar meter dips into red with snackbar suggesting a micro-beat to restore optimism. | “Layer a scene showing communal resilience or artifact wonder to restore the Shattered Frontier tone.” |
| **Mythic Drift** | References to divine entities or artifacts deviate from canon pantheon glossary or introduce reality-breaking lore. | Tooltip over offending sentence with highlights; console offers quick glossary search. | “Swap in a canon pantheon symbol or tie the moment to an established relic; if new, mark as `candidate-lore` for admin review post-session.” |
| **Hub Verb Overreach** | In hub contexts, player input requests freeform actions outside verb whitelist. | Modal reminder of hub-specific verbs with example phrasing to keep MUD loops intact. | “Offer narrative flavor via allowed verbs or suggest moving scene out of hub for freeform resolution.” |

## Implications for Design

- Integrate tone bible metadata directly into GM prompt scaffolding and the session memory store, ensuring every scene reaffirms Session 01 archetypes before branching narratives.
- Prototype a GM console sidebar that visualizes tone drift heuristics in real time, with quick actions (naming helper, tone ping, glossary lookup) to course correct without breaking immersion.
- Extend the offline Story Consolidation workflow to include tone validation, tagging each recap with the tone mix that played out to support future analytics and moderation.
- Document tone breach exemplars—borrowing from Coyote & Crow’s guidance—to seed safety prompts and moderator training materials.

## Source Notes

- Tomkin, Shawn. *Ironsworn: Starforged*. Absolute Tabletop, 2022.
- Dragon, Jay. *Wanderhome*. Possum Creek Games, 2021.
- Coyote & Crow LLC. *Coyote & Crow Roleplaying Game*. 2022 GM section on Tone & Themes.
- Gýle, Gareth Damian Martin. *Citizen Sleeper*. Jump Over the Age, 2022 developer postmortems.
