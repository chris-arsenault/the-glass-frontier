# Session 06 – Context Dock Resilience & Pacing Telemetry

Backlog anchor `RES-06` investigates how The Glass Frontier’s chat client can keep memory overlays, safety tools, and pacing widgets trustworthy during long-form play—even when connectivity degrades—and how those elements emit structured events for downstream services.

## Research Goals
- Catalogue resilient “context dock” patterns that prevent pinned references (character sheets, clocks, safety tools) from blocking or vanishing during network drops.
- Evaluate offline-first delivery techniques that keep transcripts readable and wrap-up prompts actionable in low-bandwidth scenarios.
- Identify structured telemetry hooks for pacing cues (turn reminders, breaks, wrap-up markers) that respect freeform play while feeding post-session pipelines.

## Comparative Notes

| Source | Context Dock & Memory Handling | Pacing / Telemetry Considerations |
|--------|--------------------------------|----------------------------------|
| **Matrix Client-Server Spec (v1.16)** | `m.room.pinned_events` keeps an ordered list of highlighted events so clients can present critical reference cards without re-querying the log; clients filter pins they cannot render before display.[^matrix-pins] | Read and unread markers let clients post “up to event X” receipts and separate attention flags, reducing chatter while preserving where pacing interventions occurred.[^matrix-markers] |
| **MDN Service Worker API** | Service workers intercept fetches, cache granular resources, and run off the main thread; they are ideal for pinning transcript slices, context cards, or safety checklists locally in HTTPS contexts.[^mdn-sw] | Lifecycle hooks (install/activate/fetch) support preloading pacing assets (wrap-up prompts, break templates) and reconciling stale caches once the network returns. |
| **MDN Background Sync API** | Sync events queue tasks until connectivity stabilizes, letting us persist context dock edits offline and replay them when the service worker regains access.[^mdn-sync] | GM-triggered wrap-up markers or pacing logs can be scheduled as background sync jobs so telemetry never interrupts live narration when the link is flaky. |
| **web.dev Offline Fallback Guide** | Demonstrates building branded offline fallback pages with service workers so players always see transcript context and clear reconnection controls instead of blank screens.[^webdev-offline] | Encourages “something instead of nothing” when offline—ideal for pausing timers, surfacing last known breakpoints, and prompting reconnection without terminating the scene. |

## Findings

### 1. Pinned Context Needs Local Mirrors
- Matrix’s `m.room.pinned_events` flow keeps a deterministic order of spotlighted items while acknowledging that some participants may lack permission to view the underlying event.[^matrix-pins] The Glass Frontier should mirror pin metadata locally so context docks degrade gracefully when cross-session references are unavailable or cached.
- Storing the minimal payload (title, excerpt, last-updated timestamp) alongside an event ID lets the client surface context even when the backing document fails to load, and sync deltas once connectivity returns.

### 2. Offline-First Transcript Delivery Is Mandatory
- Service workers can cache transcripts, session safety tools, and UI chrome, allowing the GM engine to continue responding with local scaffolds when the network hiccups.[^mdn-sw]
- The web.dev guide shows that custom offline fallbacks keep the UX coherent by displaying branded “pause” states, reconnect buttons, and context reminders rather than browser error screens.[^webdev-offline] Our client should freeze the active transcript pane, highlight unsent player inputs, and expose a “Resume when online” action instead of silently dropping commands.

### 3. Background Sync Preserves Narrative Flow
- Background Sync lets the client defer telemetry packets—turn transitions, wrap-up confirmations, safety check acknowledgements—until the link stabilizes, preventing noticeable lag or duplicate prompts during freeform play.[^mdn-sync]
- We can tag each deferred item with scene IDs and timestamps, guaranteeing deterministic replay in the offline consolidation pipeline and letting admins audit any late-arriving pacing markers.

### 4. Structured Markers Create Reliable Post-Session Hooks
- Matrix receipts demonstrate how “up to event” markers reduce payloads while still telling other services the latest acknowledged moment.[^matrix-markers] We can adopt the same model for wrap-up prompts: each prompt posts a marker containing scene ID, sequence index, and optional tension level.
- Separate “attention” markers (akin to `m.marked_unread`) allow GMs or players to flag segments for after-action review without altering read positions—useful for tagging safety pauses or disputed rulings.

## Implications for The Glass Frontier
- Implement a **Context Dock cache** driven by service workers: store pinned cards, safety tools, and session clocks locally with optimistic updates so they remain interactive offline; reconcile via background sync to prevent conflicts.
- Treat **pacing widgets as chat-first emitters**: every turn cue, break notice, or wrap-up prompt posts a structured chat event plus a marker entry so Story Consolidation can replay scene tension accurately.
- Provide a **branded offline interstitial** that freezes the transcript, lists pending prompts, and surfaces a manual reconnect button; avoid dropping players into blank canvases that encourage refreshing (risking duplicate actions).
- Introduce **attention markers** distinct from read receipts so players can flag beats needing follow-up without resetting their scroll position; these markers should sync to admin tooling for moderation and post-session editing.

## Risks & Follow-Up
- Need conflict resolution rules if offline edits to context dock collide with changes already applied server-side—consider vector clocks or last-writer-wins scoped to each pinned reference.
- Background sync support is inconsistent across browsers; we need a feature-detection fallback (e.g., immediate retry queue with exponential backoff) for clients without the API.
- Determine how to display pins players cannot access (e.g., GM-only reveals) without leaking spoilers while still signalling that hidden context exists.

## References
- [^matrix-pins]: Matrix.org. “Client-Server API, `m.room.pinned_events`.” Matrix Specification v1.16 (2025). <https://spec.matrix.org/latest/client-server-api/>
- [^matrix-markers]: Matrix.org. “Client-Server API, Read and Unread Markers.” Matrix Specification v1.16 (2025). <https://spec.matrix.org/latest/client-server-api/>
- [^mdn-sw]: MDN Web Docs. “Service Worker API.” Mozilla (2025). <https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API>
- [^mdn-sync]: MDN Web Docs. “Background Synchronization API.” Mozilla (2025). <https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API>
- [^webdev-offline]: Pete LePage & Thomas Steiner. “Create an offline fallback page.” web.dev (2020). <https://web.dev/offline-fallback-page/>

