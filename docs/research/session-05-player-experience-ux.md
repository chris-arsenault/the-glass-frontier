# Session 05 – Player Experience & UX Patterns

Backlog anchor `RES-05` examines how The Glass Frontier can deliver a chat-first client that sustains cooperative GM storytelling across multi-hundred-turn sessions without sacrificing transparency or cognitive calm.

## Research Goals
- Survey long-form narrative or RPG web clients that lead with chat while keeping overlays, history, and tooling accessible.
- Understand how memory scaffolds (character sheets, clocks, inventories) surface alongside freeform input without constraining creativity.
- Identify pacing cues and wrap-up signals that help players and GMs close scenes gracefully during extended sessions.

## Comparative Experience Survey

| Experience | Format | Long-Session Support | Memory & Context Surfaces | Pacing & Wrap-Up Cues | Sources |
|------------|--------|----------------------|---------------------------|------------------------|---------|
| **Roll20 Virtual Tabletop** | Browser VTT with persistent chat | Chat archive stores timestamped logs; pop-out character sheets and handouts stay docked during hours-long sessions; Turn Tracker maintains order when numerous actions stack up. | Journal tab delivers handouts, character sheets, and macros; GM info can be shared as read-only or editable overlays without leaving the chat view. | Turn Tracker advances round/turn counters in chat; GM page swaps broadcast scene transitions; API scripts optionally post break timers to chat. | Roll20 Wiki, “The Chat,” “Journal,” and “Turn Tracker” docs (2023). |
| **Foundry Virtual Tabletop** | Self-hosted web client (browser/Electron) | Modular sidebar lets players keep Chat, Combat Tracker, and Scene tools open simultaneously; journals and compendium packs stream on demand to reduce load during long sessions. | Journal pins and pop-out sheets layer context on top of the scene canvas; shared compendium entries keep reference data synchronized with chat narration. | Combat Tracker announces turn changes and round numbers; global Pause tool signals breaks; scene playlists shift mood between arcs. | Foundry VTT Knowledge Base, “User Interface Overview,” “Journal Entries,” “Combat Tracker,” “Audio Playlists” (2023). |
| **Hidden Door Story Beta** | AI-assisted narrative chat client | Session timeline persists across chapters with branching recap cards; world state cards remain visible next to the conversation. | Character, location, and relic cards pin to the sidebar; “Storyverse” metadata feeds prompts without locking player phrasing. | Dedicated “Wrap Up Scene” button prompts the GM engine to summarize, publish highlights, and suggest next beats; chapter map telegraphs pacing. | Hidden Door Blog, “Designing Storyverse Playgrounds,” Early Access FAQ (2023). |
| **AresMUSH Web Portal** | Web portal for play-by-chat/story games | Scene logs capture hundreds of poses with auto-pagination and export; live transcript view streams in real time for remote readers. | Scene sidebar tracks participants, locations, and shared props; character sheets and wiki entries open in modals alongside the chat. | Scene pace meter and pose order indicators highlight lulls; “Wrap Scene” workflow creates summaries and publishes to the wiki. | AresMUSH Documentation, “Scenes Portal,” “Scene Pace Meter & Pose Order,” “Scene Wrap-Up” (2022). |

## UX Pattern Highlights

### 1. Chat Remains Primary, Overlays Stay Lightweight
- All surveyed clients treat the chat log as the anchor pane while allowing auxiliary panes to dock or pop out. Roll20 and Foundry keep overlays expandable so they never block conversational flow.
- Hidden Door and AresMUSH push structured data (cards, scene metadata) into narrow sidebars, reinforcing context without forcing players into pre-baked verbs.
- Implication: The Glass Frontier client should default to a single-column chat view with opt-in flyouts for sheets, clocks, or map snippets so narrative text remains central.

### 2. Memory Scaffolds Are Persistent and Player-Controlled
- Roll20’s handouts and Foundry’s journal pins prove players rely on quick-reference cards more than deep navigation trees during long sessions.
- Hidden Door’s Storyverse cards and AresMUSH’s scene sidebars mirror the “hard memory context” requirement—information is visible but editable only through explicit actions, preserving freeform narration.
- Implication: Provide pinning for character sheets, session clocks, and safety tools that the player or GM can summon without leaving the chat channel.

### 3. Pacing Signals Surface in-Band
- Turn/Combat trackers (Roll20, Foundry) and pose order meters (AresMUSH) post state changes directly into chat, keeping players aligned on who acts next.
- Hidden Door’s wrap-up button and chapter map add explicit breakpoints, prompting retrospectives while the session transcript is fresh.
- Implication: Integrate pacing widgets (initiative-style turn queues, scene timers, wrap-up prompts) that speak through the chat stream while offering gentle reminders instead of hard locks.

### 4. Transcript Longevity Matters
- Every platform archives transcripts with timestamps and export paths, making post-session consolidation straightforward.
- Long sessions create risk of context loss; the comparables mitigate this with anchored log views, pagination, or filtered search.
- Implication: Session transcripts for The Glass Frontier must remain exportable with anchors tied to scene IDs so Story Consolidation tooling can replay context and flag deltas.

## Implications for The Glass Frontier
- Build the chat client around a persistent transcript with optional pinboard overlays; ensure overlays never occlude the text channel on smaller viewports.
- Offer player-initiated wrap-up prompts (e.g., “Mark Scene Break”) that ask the GM engine to summarize outcomes and suggest downtime hooks, aligning with offline consolidation pipelines.
- Maintain a shared “Context Dock” that lists active clocks, resources, and safety tools; allow participants to collapse or expand entries to manage cognitive load.
- Log pacing cues (turn cues, break markers, wrap-up triggers) as structured events so the Check Runner and Story Consolidation services can reconcile tension and resource flows after the session.
- Provide administrative toggles for long-session fatigue mitigation (scheduled stretch reminders, transcript bookmarks) without mandating rigid phase shifts.

## Risks & Follow-Up Questions
- How do we surface pacing aides without encouraging rigid initiative outside MUD hubs?
- What accessibility accommodations (high-contrast mode, transcript search, audio narration) are mandatory for multi-hour chat sessions?
- Which overlays require offline availability so sessions can continue during partial network loss?
- How do we prevent context docks from leaking spoilers when multiple characters share a client instance (spectator mode)?

## Sources & References
- Roll20 Wiki. “The Chat,” “Journal,” “Turn Tracker.” Roll20, 2023.
- Foundry Virtual Tabletop Knowledge Base. “User Interface Overview,” “Journal Entries,” “Combat Tracker,” “Audio Playlists.” Foundry Gaming, 2023.
- Hidden Door. “Designing Storyverse Playgrounds.” Hidden Door Blog, 2023.
- Hidden Door. “Early Access FAQ.” Hidden Door Help Center, 2023.
- AresMUSH Documentation. “Scenes Portal,” “Scene Pace Meter & Pose Order,” “Scene Wrap-Up.” AresMUSH Project, 2022.
