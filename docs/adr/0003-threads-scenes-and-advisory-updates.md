# ADR 0003: Threads, bounded scenes, and advisory updates

Status: accepted. Recorded: 2026-09-21.

## Context

Separate beat, front, clock, scene-ledger, and turn-judge models duplicated
continuity responsibilities and could block otherwise complete narration.
Independent world motion still needs a durable direction, while immediate scenes
need a finite question and player goals need progress beyond one scene.

## Decision

Use one `NarrativeThread` collection for player and world perspectives, one
`focusedThreadId`, one bounded `ActiveScene`, and plain `localContinuity`.
Each thread records its owner, goal, position, title, and update turn. The active
scene records a question, type, linked thread, and at most four consequential
turns. Leaving, replacement, expiry, or an answered question ends a scene.

Scene completion updates its linked player thread even when focus has changed.
Read the stored scene turns plus the boundary turn as evidence. Local continuity
reads committed turns since the previous note. Do not recreate a generic turn
judge to decide these narrow boundaries.

Run inventory, location, and narrative-boundary reads after narration, then run
thread position, local continuity, and environment updates. These updates are
advisory: failure retains completed narration and prior valid state.

World agency advances at most one world thread at a scene boundary or established
time passage. It reads completed narration and resolved location, stores the
development as turn prose, and supplies it to the next writer. This supersedes
the old before-check, every-turn front-clock proposal. Planning can consume a
scene turn without automatically establishing elapsed world time.

## Consequences

There are no separate beat/front lifecycle trackers, countdown clocks for world
agendas, or scene notebook to synchronize. Player threads retain the long-term
goal role. Failed advisory updates can leave notes stale; stored prose remains
the evidence for subsequent work. World agendas stay private until narrated.

Legacy tracker keys in historical JSON remain inert. New canonical fields
default safely; no translation, JSON rewrite, or production reset is required.
Relational cleanup uses forward migration 018 with applied history preserved.

See [the runtime](../design/gm-runtime.md),
[scene projection](../../apps/gm-api/src/scenes/boundedScene.ts), and
[thread updates](../../apps/gm-api/src/gmGraph/nodes/ThreadPositionNode.ts).
