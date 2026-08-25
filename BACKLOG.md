# Backlog

Deferred work, with enough context to pick it up cold. Items leave this file
when they ship or when we decide against them.

## GM behavior

**Let the player disengage.** From turn 0 of Shadowed Cargo the player steered
away from the broker and toward the cargo, and every turn pulled them back into
the fight. Some resistance is the point; a real GM reads the room and moves on.
Now that `lastProgressTurn` only advances on genuine beat progress, the distance
between it and the current turn measures how long the story has been away from
its goal — that number is the signal to build on. Related: the confrontation had
no exit because nothing in the pipeline ever decides a scene has run long enough.

**Persistent GM scene plan.** A durable plan the turn judge maintains and the
player never sees, extending the scene ledger: where the scene is heading, what
would end it, what is being held back. Designed after the current prompt round
is judged.

**Skills the sheet cannot serve.** Zale's three skills forced Bow hunting for a
stun piston and Manipulate others for a smoke-bomb escape, at rudimentary
finesse — the −2/−4 modifiers behind five straight bad tiers. Her instinct is
"when spotted, she hides" and a calling is "remain in the shadows", and no skill
covers either. Either the sheet needs a wider skill set at creation, or the
planner needs a fallback that is not the nearest bad match.

**Entity aliases.** Proposed, awaiting a decision: give each scene-ledger
`present` entry an optional `entitySlug`, so a player's improvised name ("the
scum") points at the canon figure it means (the rival broker). Fixes retrieval
misses on ledger nouns, sidecar entries dropped as unserved, and continuity
across improvised naming. Blocked on where the alias points when the figure was
never minted as an entity — smallest answer is letting the turn judge create a
chronicle-scoped entity for a figure the scene keeps naming.

## Turn pipeline

**Inventory deltas never land.** After seven turns `character.inventory` is
still `[]` while the delta node emitted `update`/`remove` ops for a stun piston,
Cute Girl Glasses, and a Smoke Bomb that were never added. Player-asserted props
get narrated and staged in the ledger but never become holdings. Not
investigated — the round was not aimed at inventory.

## Models and providers

**Nova's content filter is nondeterministic.** Two of seven turns came back
`stopReason: content_filtered` with zero output tokens; replaying the exact
blocked payload passed 10/10 later. It is a classifier over generated text, not
a word list, and there is no strictness knob. A turn currently fails and asks
the player to rephrase — one retry before surfacing the failure would hide most
of it.

**Sonnet retrieves nothing.** Every panel run finished at `stepCount: 1` —
straight to `submit_turn`, no tool calls — while writing the best prose from the
seed pack alone, at 3.5x the cost of the Nova paths. Decide whether that is
fine (the seed pack is enough) or whether the pack should shrink so retrieval
earns its keep.

**Sonnet on Bedrock is intermittently unavailable.** `ServiceUnavailableException`
on `us.anthropic.claude-sonnet-5` dropped it from two turns' panels. The panel's
failure-drop is working as designed; drops are findable in the logs as
`prose-agent.panel.failed`. Watch whether it recurs.

**Haiku 4.5 joins the panel** once it has a model-catalog entry.

## Evaluation

**Re-judge all four narrators** once live turns accumulate on the restored
pre-KEY prompts. No categorical model verdicts before then — the last round's
prompts are not the ones running now.
