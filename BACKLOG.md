# Backlog

Deferred work, with enough context to pick it up cold. Items leave this file
when they ship or when we decide against them.

## GM behavior

**Writer word floors are too low.** Raise once, deliberately, after the input
work lands — not as a reaction to one short turn.

## Retrieval

**Evaluate weak retrieval matches in the current tool contract.** Earlier
measurements put invented phrases at up to 0.304 against a 0.32 search floor.
The current model-facing search output strips ranking fields, so explaining
numeric bands to the model would not address the current interface. Evaluate
whether excerpts and authoritative opens distinguish a weak lead from evidence
before changing the measured search floor or adding score metadata.

**Evaluate recall of coined names after the history repair.** Names without
canon matches are retained in stored player and GM prose even when
`entity_references` is empty. Historical open now returns that full prose with
continuation pages. The earlier proposed `coinedNames` list remains unbuilt;
measure current retrieval before deciding whether a separate registry is still
needed. Promotion to shared canon at Chronicle closure remains a separate
question.

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
does. The completed Encyclopedia plan records production backfills of 553 Atlas
and 283 Encyclopedia entries. Current-version play quality remains unverified;
the old claim that re-embedding never ran is superseded by that recorded run.

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

**Read retrieval against no retrieval.** The earlier comparison was inconclusive:
the one chronicle that could have produced it had its
scout throw on three of three turns, and every alternate reported `stepCount: 0`
whether it had researched or not. `briefFailed` now distinguishes those, and the
forced-tool fix should stop the throws. Needs live turns, then a comparison of
each model's agentic response against its own one-shot on the same turn.
