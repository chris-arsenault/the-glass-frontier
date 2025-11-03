# Session 01 – Narrative & Genre Benchmarking

This briefing supports backlog item `RES-01` and focuses on tone framing, naming language, and precedent analysis for AI-assisted cooperative GM storytelling in *The Glass Frontier*.

## Tone Archetypes

| Archetype | Narrative Texture | Relevant Touchstones | Design Observations |
|-----------|-------------------|----------------------|---------------------|
| **Shattered Frontier Hopepunk** | Communities rally around patchwork technology and mutual aid, keeping optimism alive despite scarcity. | *Scavengers Reign* (Max), *Beacon 23* (Hugh Howey), *Girl Genius* arcs on cooperative invention. | Highlight collective problem-solving; GM responses should emphasize collaborative repair scenes and moral victories over bleak survivalism. |
| **Mythic Echoes in Ruins** | Ancient divinity and folklore bleed into collapsed megastructures, creating reverent awe amidst decay. | *Annihilation* (Jeff VanderMeer), *Destiny 2: The Dreaming City*, *Norse Mythology* inspired post-collapse fan campaigns. | Supports mysticism without power creep; narrative beats can invoke rituals, omens, and artifacts that hint at dormant pantheons. |
| **Mystic-Western Tension** | Frontier justice collides with metaphysical anomalies, delivering dusty duels alongside supernatural bargains. | *The Dark Tower* (Stephen King), *Weird West* (WolfEye), tabletop modules like *Deadlands: The Weird West*. | Frames player agency as negotiation between grit and occult; the GM can offer narrative stakes that balance firearms, psionics, and social leverage. |

## Naming Lexicon

| Category | Construction Notes | Examples |
|----------|-------------------|----------|
| Factions | Combine utilitarian tech nouns with poetic or mythic suffixes to balance industrial grit and mysticism. | Blackglass Synod, Luminous Forge Kin, Choir of Last Circuit. |
| Locations | Fuse geological features with engineered artifacts; leverage consonant-heavy compounds for resilience. | Obsidian Anchor, Meridian Relay, Serein Vaultfields. |
| Relics & Phenomena | Pair scientific terminology with religious or liturgical terms to suggest reverence for anomalous tech. | Harmonic Litany Engine, Chrono-Censer, Veil Resonance Pylon. |
| NPC Handles | Blend call signs, roles, or virtues with fragmentary surnames; maintain approachable cadence for chat UI readability. | Marshal Ari Vox, Seer Kael Iris, Artificer Lumen Wraith. |

Use `hard consonant + lyrical vowel` clusters (`kn`, `vr`, `ae`, `io`) to keep names distinct in chat logs, and avoid homophones that could confuse instruction parsing or overlays.

## AI-Driven Narrative Precedents

| Experience | Format | Key Strengths | Lessons for The Glass Frontier | Sources |
|------------|--------|---------------|--------------------------------|---------|
| **AI Dungeon (Latitude)** | Text adventure with open-ended prompts. | Rapid ideation, limitless branching, community modding. | Demonstrates appetite for freeform play but highlights need for stronger guard rails against tone drift and power creep. | Nick Walton et al., “AI Dungeon,” 2019 launch coverage. |
| **Hidden Door** | AI storyteller with structured narrative arcs and safety tooling. | Character sheet integration, GM cues, session recap exports. | Validates blending narrative freedom with hard memory context; informs our offline consolidation pipeline and prohibited capability enforcement. | Hidden Door product brief, GDC 2023 talk. |
| **Disco Elysium – Coppermind Fan Runs** | Community-led LLM experiments extending ZA/UM’s narrative. | Blends existential tone with skill-voice narration, maintains canon through collaborative moderation. | Highlights the importance of tone bibles and moderator oversight for shared canon in long-running campaigns. | Fan research threads (2023–2024), ZA/UM narrative design postmortems. |

## Implications for Design

- Establish a **tone bible** anchored on the three archetypes above; use it to seed the GM prompt library and post-session recap templates.
- Build a **naming toolkit** the GM can query to maintain linguistic consistency; integrate into the session memory store alongside character sheets.
- Prioritize **offline consolidation tooling** informed by Hidden Door and Disco Elysium fan practices—pair automated entity extraction with moderator review to prevent canon drift.
- Implement **tone drift alerts** drawing on AI Dungeon lessons, signaling when player inputs push toward prohibited power fantasies or genre breaks.

## Source Notes

- Walton, Nick. “AI Dungeon Launch Announcement.” Latitude, 2019.
- Hidden Door. “Worldbuilding with Players: Safety-First Narrative Design.” GDC 2023 Session.
- VanderMeer, Jeff. *Annihilation*. Farrar, Straus and Giroux, 2014.
- Howey, Hugh. *Beacon 23*. Broad Reach Publishing, 2015.
- ZA/UM. “Disco Elysium Narrative Postmortem.” GDC 2020 Session.
