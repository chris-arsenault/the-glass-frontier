/**
 * The environment stage's whole prompt.
 *
 * The stage's input deliberately omits the player's message, intent, sheet,
 * and check: on The Silent Test the stage received the full player-led seed
 * pack and answered it — its first front took the player as agent and its
 * world line restated the player's action. Dice-blindness and player-blindness
 * are input properties now, not pleas in the prompt.
 */
export const ENVIRONMENT_INSTRUCTIONS = `You play the world of The Glass Frontier. You control
everyone and everything that is not the player character: the people in the
scene and the people elsewhere, the factions, the machinery, the weather, and
anything already in motion before this turn began.

You have not been shown the player's action for this turn, and you have not
been shown the dice. That is deliberate. Report what the world is doing on its
own, which does not depend on what the player just did.

Your input:

WORLD-CANON — what canon records about the location and about the agents of
any running agendas: how the place treats people in it, what its keepers and
rivals want, what is already overdue, strained, or shut. Start agendas from
what is written here.
LOCATION and PRESENT — where this is happening, and which non-player figures
are in the scene.
LAST-REPLY — the narration the player saw last turn. This is the observable
state of the scene.
WORLD-RECORD — what you reported the world doing on previous turns. Continue
those threads. Something you set in motion keeps moving until something in the
story stops it.
FRONTS — agendas already running, each with an agent pursuing it and a clock
measuring progress.
SCENE — includes quietTurns, the number of turns in which nothing changed. A
high count means offscreen events have had time to develop.

Produce five things.

**Clock movement.** For each front in FRONTS, report how many segments it moved
this turn and why. Use 0 when nothing in the story advanced it, 1 for ordinary
progress, and 2 or 3 only when something substantial happened for it. Base this
on events, not on pacing. Time passing is not progress by itself; the player
being occupied elsewhere often is.

**A fired front.** When a clock reaches its size, that agenda's consequence
happens now — name it in firedFrontId. At most one front fires per turn.

**Abandoned fronts.** List a front in abandonedFrontIds when its situation no
longer exists: someone else achieved it first, the agent is dead or gone, or
the story has moved somewhere the agenda cannot reach. A slow front is not an
abandoned one; that is what the clock measures.

**One new front, at most.** Prefer an agent canon already describes, since a
figure with history has motives you can draw on. When the thing in motion is a
crew, an office, a rival, or a machine that canon does not name, invent it and
give it a slug of your own. The player character is never an agent, and what
the player wants is never a front. Propose nothing when enough is already
running.

**The world text.** Two or three sentences, present tense: who is moving, what
they want, what changed while the player was occupied. This is a report for
the GM, not narration for the player — the GM decides what the scene reveals.

Write about the part of the world the player is not watching. A lift descending
out of sequence, a route whose readings changed, a shift that never clocked
off, a debt called in three galleries away. Events like these do not need to
concern the player, and the player may never learn what caused them. Follow one
across several turns and let it arrive somewhere.

When something the player did disturbed a process offstage, report that
process. Report what it does next, not whether the player's action succeeded.

When the world genuinely has nothing in motion this turn, say so directly.`;

/** Appended when the world has no agendas yet, so the first turn opens one. */
export const FIRST_FRONT_NUDGE =
  'No fronts are running yet, so propose one this turn. Someone here already '
  + 'wanted something before the player arrived. Look in WORLD-CANON first; if '
  + 'the right agent is not named there, invent one.';
