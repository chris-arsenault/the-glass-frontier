# Backlog

Deferred work, with enough context to pick it up cold. Items leave this file
when they ship or when we decide against them.

This is the current backlog. Historical snapshots under `docs/plans` retain
their original dates and do not define current delivery status. The
[September closeout](docs/reports/2026-09-21-feature-closeout.md) maps retired
root plans to implemented decisions and the work retained here.

## Canon and World Guide

**Guide ingestion needs a source contract.** The original Encyclopedia review
found guide pages such as `Life in the System` only in Tsonu's public site tree.
The Glass importer still has no guide collection. Define an internal export
contract upstream before extending the existing translator and World Guide;
do not add a second synchronization path. This remains implementation work,
deferred from `ENCYCLOPEDIA-INTEGRATION-PLAN.md` and plan
`9f4946db-b23d-4f2b-9dac-e051812537cb`.

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
does. The September 21 deployment applied 796 Atlas and 368 Encyclopedia entries
and completed the seed handler's missing-embedding passes for both catalogs.
These are corpus counts, not counts embedded in that invocation.
Current-version play quality remains unverified;
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

**Verify the scout and writer on a current live turn.** Retained from plan
`40268ab6-7546-404b-88b3-843945cd3c9a`, phase 5. Inspect the stored scout transcript,
served records, composed brief, and actual writer input from the same turn.
Confirm the player stays explicit character context, relevant historical prose
survives composition, and invented terms do not provoke repeated fruitless
searches. Record misses, discarded material, latency, tokens, and cost. Unit
tests and deployment success do not establish this result.

**Evaluate Chronicle creation with live models.** Retained from plan
`28d0ceca-a1bf-43d1-ac11-72eece493367`, phases 2–3. The seed/opening headroom repair,
explicit structured-answer instructions, and Bedrock truncation diagnostics are
implemented. Compare supported prose models and output ceilings on the same
production-shaped seeds, then exercise character-to-seed-to-opening creation.
Separate prose quality from `SeedArray` completion, reasoning exhaustion, and
provider stop behavior. No live comparison or end-to-end creation result is
claimed by closing the implementation plan.

**Read current progression and world motion in play.** Retained from audit plan
`d5c0b408-71fc-4eb8-92fd-439e9ce74916`, phase 5. Inspect consecutive turns that
switch player focus, conclude or replace a scene, and move location. Confirm
the outgoing goal receives its own evidence, local discoveries survive, and
world developments follow completed fiction and reach the next writer. The
hosted regression suites passed; narrative quality across live turns remains
unverified. Tune only from those captures, without restoring front clocks.

**Measure history retrieval before adding another classifier flag.** The old
M2 plan deferred an intent-level past-event flag and a history-search reminder.
Current search instructions already direct history retrieval. First measure
missed callbacks using the wire review above; implement an explicit trigger
only if that review demonstrates a remaining gap. A separate coined-name
registry is likewise conditional on the recall evaluation under Retrieval.

**Read retrieval against no retrieval.** The earlier comparison was inconclusive:
the one chronicle that could have produced it had its
scout throw on three of three turns, and every alternate reported `stepCount: 0`
whether it had researched or not. `briefFailed` now distinguishes those, and the
forced-tool fix should stop the throws. Needs live turns, then a comparison of
each model's agentic response against its own one-shot on the same turn.
