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

**Writer word floors are too low.** Raise once, deliberately, after the input
work lands — not as a reaction to one short turn.

**Scene ledger hygiene.** `sceneLedger.ts:33` concatenates `interactions` with
no dedup, and A Beautiful Thing Bought as Ringglass recorded "Hundson sets up a
resonant screen around the crate" twice from one event — the judge restated a
prior turn's line and nothing caught it. The same ledger lists the player
character in `present`, which is the roster of who acts when the player pauses.

## Retrieval

**Say what a similarity score means where it is read.** The `search` floor sits
at 0.32 with invented phrases topping out at 0.304 — 0.017 of separation, and
neither a z-score over the query's own background nor a margin-over-p99
separates the classes any better (both overlap worse; measured). The floor is
the best single discriminator available, so the mitigation is not a better
number: the tool already returns the similarity to the model, and the tool
description should say what the bands mean — at or above 0.5 a named match,
0.32 to 0.45 a lead to confirm rather than a fact — so a 0.33 hit is discounted
instead of believed.

**Coined names never register.** A player naming something the world has not
written down — "Globbin", "globitz" — leaves `entity_references` empty, so the
name exists only in that turn's prose and is gone by the next. The evaluator now
at least notices (it asked whether Globbin had any canon basis), but nothing
persists a coinage. Agreed shape, never built: a `coinedNames` list on chronicle
state alongside `fronts`, written by the entity-reference resolver when a
definite referent matches no candidate, surfaced as one seed-pack block.
Promotion of a coinage to real canon at chronicle closure is a separate
question. Supersedes the older "entity aliases" framing, which tried to hang the
alias off scene-ledger `present` entries and stalled on where the alias points
when the figure was never minted.

**Skills the sheet cannot serve.** Zale's three skills forced Bow hunting for a
stun piston and Manipulate others for a smoke-bomb escape, at rudimentary
finesse — the −2/−4 modifiers behind five straight bad tiers. Her instinct is
"when spotted, she hides" and a calling is "remain in the shadows", and no skill
covers either. Either the sheet needs a wider skill set at creation, or the
planner needs a fallback that is not the nearest bad match.

**Confirm the asymmetric embedding fixed same-query results.** `search` used to
return near-identical results whatever it was asked, because the place name
dominated a symmetric embedding — 4 of 5 rounds in Hidden Messages spent on
searches that added nothing. Cohere Embed v4 with separate query and document
spaces should fix exactly that, and measured against 400 production entities it
does. Unverified in play: the canon re-embed has not run.

## Models and providers

**Nova's content filter is nondeterministic.** Two of seven turns came back
`stopReason: content_filtered` with zero output tokens; replaying the exact
blocked payload passed 10/10 later. It is a classifier over generated text, not
a word list, and there is no strictness knob. Nova is no longer a prose default
but is still the classification model, so a filtered classifier still fails a
turn. One retry before surfacing the failure would hide most of it.

**Sonnet on Bedrock is intermittently unavailable.** `ServiceUnavailableException`
on `us.anthropic.claude-sonnet-5` dropped it from two turns' panels. The panel's
failure-drop is working as designed; drops are findable in the logs as
`prose-agent.panel.failed`. Watch whether it recurs.

**Haiku 4.5 joins the panel** once it has a model-catalog entry. Cheaper now
that the provider no longer rejects models by name.

## Evaluation

**Read retrieval against no retrieval.** The panel's whole purpose, and it has
never yielded a reading: the one chronicle that could have produced it had its
scout throw on three of three turns, and every alternate reported `stepCount: 0`
whether it had researched or not. `briefFailed` now distinguishes those, and the
forced-tool fix should stop the throws. Needs live turns, then a comparison of
each model's agentic response against its own one-shot on the same turn.
