# Agents of Glass -> Glass Frontier mechanics port review

Status: analysis for later revisit. No code changed by this document.

Sources reviewed: `agents-of-glass` at HEAD `961aaee` (2026-08-20), the current
`the-glass-frontier` working tree (including uncommitted changes), Git history,
and `templates/srd/` in both repos. Some older Agents design docs are stale:
`../agents-of-glass/docs/design/mechanics.md:373` still says XP/levels are
omitted though the code implements them, and
`../agents-of-glass/docs/design/scene-ending.md:1-7` calls scene closure
deferred though it is implemented. Current code and `templates/srd/` win where
they disagree.

## Verdict

Port the momentum rewrite, explicit scenes, scene pressure, and fail-forward
rules. Do not port the autonomous-table orchestration. Do not port the Agents
skill system without more Glass Frontier play data.

`agents-of-glass` solved several game-design problems (not just
model-management problems). The strongest additions:

1. Momentum that affects narration instead of compounding roll odds.
2. Explicit scenes with objectives, clocks, and short-lived scene questions.
3. Failed rolls that change the situation and eventually close an exhausted
   approach.
4. Explicit scene closure.
5. Signature moves as character-defining fictional permissions.

## A. System differences

### 1. Control model

Glass Frontier: one human drives one character through natural-language
messages; a graph of model calls classifies the message, plans a check,
generates the GM response, then derives state changes
(`apps/gm-api/src/gmEngine.ts:164-207`). The player drives the fiction; the GM
amplifies and adjudicates
(`apps/client/src/components/modals/UserGuideModal/UserGuideModal.tsx:14-43`).

Agents of Glass: a persistent campaign with one DM agent and four player
agents; the orchestrator chooses actors, prepares role context, enforces turn
completion, and maintains scene scheduling (initiative, handoffs,
rapid-response queues, housekeeping turns, scene-prep/transition turns,
mandatory tool calls, closeout records, drift pressure, unattended recovery).

Conclusion: none of that orchestration belongs in Glass Frontier. The human
supplies judgment, pacing correction, and initiative.

### 2. Narrative units

Glass Frontier hierarchy: character -> chronicle -> (turns, long-term beats).
A chronicle has one current location name, open/closed status, long-term beats,
optional target closing turn; no explicit scene records
(`packages/dto/src/narrative/Chronicle.ts:12-39`). "Scene" appears in prompts
but has no first-class boundary.

Agents hierarchy: campaign -> arc -> scene -> (play mode, objective/threat/timer
clocks, scene-local beats, pressure trackers, explicit outcome/transition).
No sessions; the scene is the unit of play
(`../agents-of-glass/docs/design/game-start.md:33-43`). Scenes nest, close,
return, or replace; active clocks are explicitly carried or retired on close.

Conclusion: Glass Frontier's biggest structural gap is that a chronicle does
the work of both an adventure and its individual scenes.

### 3. Meaning of "beat"

Glass Frontier beats are long-horizon threads: multi-turn goals/mysteries,
model-managed, status `in_progress`/`succeeded`/`failed`, no numeric progress,
no age/failure pressure/scene ownership
(`packages/app/templates/beat-tracker.hbs:1-19`,
`packages/dto/src/narrative/ChronicleBeat.ts:3-13`).

Agents beats are short-lived scene questions: attached to a scene clock, max
three active, resolve within ~10 non-pass turns (warn at 8), two failed rolls
close the approach, closing states clock movement including explicit zero
(`../agents-of-glass/src/cli/scene_beats.py:10-15,95-134`,
`../agents-of-glass/templates/srd/checks.md:54-66`).

Conclusion: do not overwrite Glass Frontier beats. Keep them as long-term
threads and add the Agents concept under a new name (scene questions).

### 4. Checks and momentum

Glass Frontier: `2d6 + skill + attribute + current momentum`, thresholds
7/8/9/10, and momentum also grants advantage at +2 / disadvantage at -2
(`packages/dto/src/mechanics.ts:9-29`,
`packages/skill-check-resolver/src/SkillCheckResolver.ts:36-77`,
`packages/skill-check-resolver/src/DiceRoller.ts:65-73`). Momentum is applied
twice, creating a strong feedback loop. Advance-or-better at neutral mods:
`-2` = 2.8%, `0` = 41.7%, `+2` = 92.3%.

Agents: `1d10 + skill + attribute`, thresholds 5/6/7/8, momentum never touches
the roll; resulting momentum is a narrative rider (>2 extra good, 1-2 nothing,
<=0 extra complication) (`../agents-of-glass/templates/srd/checks.md:9-56`).

Conclusion: adopt the Agents momentum rule. The 2d6 -> 1d10 switch is a
separate feel decision; removing momentum from the roll math is the real fix.

### 5. Skill acquisition

Glass Frontier: the check planner invents a new skill when none fits
(`packages/app/templates/check-planner.hbs:24-35`); on resolution it is written
to the sheet automatically and starts at `fool`. Only `regress`/`collapse`
grant skill XP (`+1`/`+2`). This is intentional: Glass Frontier uses the
Monster of the Week pattern where success grants the desired fictional result
and failure grants XP as a consolation prize. The skill can climb to `legend`
(`apps/gm-api/src/updaters/characterUpdater.ts:7-60`). One-off actions can
permanently expand the list, but this review has no measured play data showing
how often that happens or whether players dislike it. The skill's stored
attribute is also unused by the resolver
(`packages/dto/src/Character.ts:32-57`).

Agents: improvised vs declared skills; undeclared rolls at `fool` do not persist
or gain XP; the player explicitly saves a skill; declared skills gain XP on
success; thresholds 5/15/30; `legend` plot-only
(`../agents-of-glass/templates/srd/skill-advancement.md:32-89`). Skills carry a
machine id, spoken name, and prose descriptor so handles do not leak into prose
(`../agents-of-glass/src/cli/commands/character.py:900-933`).

Character creation: Glass Frontier is unrestricted
(`apps/client/src/components/modals/CreateCharacterModal/CreateCharacterModal.tsx:174-249`);
Agents uses a real budget (mostly-standard attributes, one artisan + two
apprentice skills) (`../agents-of-glass/templates/srd/character-creation.md:69-104`).

### 6. Pressure and consequences

Glass Frontier mechanical state: inventory, current location name, long-term
beats, skills, momentum. No first-class scene progress, opposition progress,
threats/timers, lasting injuries/consequences, or exhausted approach.

Agents: scene clocks, scene trackers, durable clocks, consequences, and coarse
HP (`../agents-of-glass/docs/design/mechanics.md:58-189`,
`../agents-of-glass/templates/srd/pressure.md:7-46`). Failed checks must
visibly change position/cost/choice/clock/beat
(`../agents-of-glass/templates/srd/checks.md:54-62`).

### 7. Scene closure

Glass Frontier closes the whole chronicle when stakes resolve or a wrap target
arrives (`apps/gm-api/src/gmEngine.ts:107-141`,
`packages/app/templates/gm-summary.hbs:1-13`). No "end this scene, continue the
chronicle" operation.

Agents has objective clocks, beat age/failure pressure, closing rounds, scene
transitions, clock carry/retire, and 12/18-turn landing prompts
(`../agents-of-glass/src/orchestrator/context.py:1572-1612`). The raw turn
thresholds compensate for unattended runs; the underlying rule (land the scene
once its question is answered) is still useful.

## B. Recommended backward ports

### Priority 1: now

1. Rewrite momentum: no roll modifier, no auto advantage/disadvantage; keep
   explicit advantage/disadvantage; momentum changes the narrated consequence.
   Keep 2d6 first; test 1d10 separately.
2. Add a character-creation attribute budget: limited starting increases and
   no starting `transcendent` attributes. Defer skill-count and starting-skill
   tier changes with the rest of the skill system.
3. Require fail-forward outcomes on stall/regress/collapse.

### Priority 2: one scene-system feature

4. First-class scenes inside chronicles (id, title, location, objective,
   opposition, stake, status, start/end turn, outcome, scene questions, clocks).
   Do not port the mode scheduler; keep the human-message/GM-response loop.
5. Preserve current beats as long-term threads; add "scene questions" as the
   short-lived mechanic (1-3 active, clock-attached, never silently carried).
6. Objective/threat/timer clocks (objective visible; threat/timer optional).
7. Exhausted approaches: two failed checks against a scene question close that
   approach; GM offers a materially different route/cost/decision.
8. Explicit scene closure (outcome + clock disposition), separate from
   player-led chronicle closure.

### Priority 3: after the scene foundation

9. Signature moves (one starting move; name/descriptor/look/use/cost; feeds
   planning and narration; never auto-success). Defer the level-slot schedule.
10. Lasting consequences (injured, disgraced, indebted, separated, oath-bound,
   damaged gear, altered relationship).
11. Generalized pressure/impact dice, only after clocks and scene questions
    have been tested.

### Deferred pending play data

Do not port the Agents declared/improvised skill distinction, skill slots,
success-based skill XP, or automatic skill-declaration machinery yet. The
current skill behavior may create clutter, but this review found no measured
Glass Frontier play evidence establishing its frequency, severity, or effect on
player enjoyment. Emerging-skill counters, semantic merging, declaration
thresholds, and slot-cap behavior would encode guesses.

Retain failure XP. It is intentional Monster of the Week-style compensation:
success produces the desired fictional result; failure produces character
growth. Revisit skill persistence and acquisition only after transcripts and
character sheets show concrete recurring failure modes.

## Do not port

Multi-agent scheduling/initiative; DM/player handoffs and rapid-response queues;
housekeeping turns; automated character-creation/campaign-planning phases; Unix
isolation and the MCP command contract; "three scene toys" / problem-family
validation; raw 12/18-turn warnings as hard policy; forced final rounds;
autonomous anti-procedural/anti-drift prompt layers; the whole Agents
level/HP/signature-slot package as one change. Also do not port the Agents skill
system until Glass Frontier play data demonstrates a specific problem. These
systems either exist because no human is present or currently rest on
unverified assumptions about player experience.

## Recommended order

1. Check math and momentum.
2. Character-creation attribute budget.
3. Scene DTO and persistence.
4. Scene questions and clocks.
5. Fail-forward and exhausted-approach handling.
6. Explicit scene transitions and closure.
7. Signature moves and consequences.
8. Only then evaluate HP, impact dice, and character levels.
9. Revisit skills only when play transcripts and character sheets provide
   evidence about clutter, acquisition, naming, or progression.

## Skill-system decision

Do not change the skill system from this review. The earlier proposal for
improvised/declared states, usage counters, semantic deduplication, declaration
thresholds, and slot caps introduced substantial machinery without measured
evidence that it would improve play.

Preserve the product boundary: players type whatever they want, use no keyword
triggers, and can play entirely through text. Preserve the current pleasure of
the game naming unexpected skills for the character. Preserve failure XP as an
intentional Monster of the Week-style consolation prize.

Before revisiting skills, collect examples from real chronicles:

- how many new skills a character gains per chronicle;
- how many are near-duplicates;
- how many never appear again;
- whether players enjoy, ignore, or dislike unexpected names;
- whether failure XP produces satisfying growth;
- whether clutter causes an actual navigation or character-identity problem.

Design the smallest correction that addresses the measured failure. Until then,
the current skill behavior remains canonical.

## Curated scene-types follow-up

The concrete flat, heavily biased scene-type design is specified in
`docs/implementation/IMP-GM-07-flat-curated-scene-types.md`. It keeps the
existing intent graph, adds a single active typed scene with generalized
`subject`/`subjectKind` metadata, and begins with dialog and battle vertical
slices before adding hunt, chase, and search.
