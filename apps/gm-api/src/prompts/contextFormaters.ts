import type {
  ChronicleBeat,
  InventoryEntry,
  Intent,
  OutcomeTier,
  SkillCheckPlan,
  SkillCheckResult,
} from '@glass-frontier/dto';

/**
 * How the turn's outcome is framed, as one sentence.
 *
 * The tier used to reach the prompt as its own name — `outcome: collapse` —
 * beside a line telling the writer to "honor its tier". Nothing in any of the
 * thirty-one templates ever said what the five tiers mean, so the writer was
 * asked to honour a scale it had never been shown, and inferred from the
 * English word: on A Beautiful Thing Bought as Ringglass a collapse at −9 was
 * narrated as a triumph, complication and all, because "collapse" in a room
 * full of resonant screens reads as something falling over.
 *
 * A sentence needs no glossary. It states what the check did to what the
 * character was reaching for, which is the one thing a term could never carry,
 * and leaves every question of how that lands to the stage that has read the
 * world.
 */
const OUTCOME_FRAMING = new Map<OutcomeTier, (skill: string) => string>([
  ['breakthrough', (skill) =>
    `The character set out to ${skill} and it worked better than they had any `
    + 'right to expect. Give them what they were reaching for and something '
    + 'beyond it that they did not think to ask for.'],
  ['advance', (skill) =>
    `The character set out to ${skill} and did it to the best of their `
    + 'ability. They get what they were reaching for; the turn costs them '
    + 'nothing they will feel.'],
  ['stall', (skill) =>
    `The character set out to ${skill} and neither gained nor lost ground. `
    + 'They do not get what they were reaching for, and nothing has gone wrong '
    + 'yet — the situation is where it was, and time has passed in it.'],
  ['regress', (skill) =>
    `The character set out to ${skill} and did not get it. Something is worse `
    + 'than before they tried, and it follows from what they did.'],
  ['collapse', (skill) =>
    `The character set out to ${skill} and failed at it. The failure costs `
    + 'them something well beyond the attempt, and what it costs them is the '
    + 'turn.'],
]);

/**
 * Momentum is a running tally of how the last several turns have gone, so it
 * frames the footing the character acts from rather than this roll's result.
 */
const momentumClause = (momentum: number | undefined): string => {
  if (momentum === undefined || momentum === 0) {
    return '';
  }
  return momentum > 0
    ? ' They have been on a good run lately, and it shows in how they carry '
      + 'themselves.'
    : ' Recent turns have gone against them, and they are acting from worn '
      + 'footing.';
};

/**
 * The swing the roll actually ran under. Advantage and disadvantage describe
 * the conditions rather than the result, so they colour how the attempt looked
 * and never contradict the framing above.
 */
const swingClause = (result: Partial<SkillCheckResult>): string => {
  if (result.advantage === true) {
    return ' They had something working in their favour going in.';
  }
  return result.disadvantage === true
    ? ' They were working against the odds going in.'
    : '';
};

/**
 * Nothing caps what a player can type, so the turn record needs its own
 * ceiling. Across every turn played so far the longest message runs 288
 * characters and the average 139, so this leaves ordinary play — and a good
 * deal of room above it — untouched, and catches only pasted material.
 */
const MAX_RECORDED_PLAYER_CHARS = 1_500;

/**
 * Past the ceiling the record carries the classifier's paraphrase rather than
 * a clipped message: a cut sentence reads as though the player stopped there,
 * while the paraphrase covers the whole of what they asked for. A turn that
 * failed before classification has no paraphrase to carry, so its message is
 * capped instead.
 */
export function recordedPlayerMessage(
  content: string,
  intentSummary: string | undefined
): string {
  if (content.length <= MAX_RECORDED_PLAYER_CHARS) {
    return content;
  }
  if (intentSummary !== undefined && intentSummary.trim().length > 0) {
    return `[long message, summarized] ${intentSummary}`;
  }
  return `${content.slice(0, MAX_RECORDED_PLAYER_CHARS)} […message continues]`;
}

export function trimBeatsList(beats: ChronicleBeat[]): Array<{
  description: string;
  id: string;
  lastProgressTurn: number | null;
  status: string;
  title: string;
}> {
  return beats
    .filter((b) => {
      return b.status === 'in_progress';
    })
    .map((b) => {
      return {
        description: b.description,
        id: b.id,
        lastProgressTurn: b.lastProgressTurn ?? null,
        status: b.status,
        title: b.title,
      };
    });
}

/** The canon entities behind a character's origin ids, resolved to names. */
export type OriginNames = {
  allegiance: string | undefined;
  culture: string | undefined;
  homeland: string | undefined;
  species: string | undefined;
};

// The character view lives in @glass-frontier/app so the seed and opening,
// which never went through this file, produce the same shape.

export function formatIntent(
  intent: Intent | null | undefined,
  beats?: ChronicleBeat[]
): Record<string, unknown> {
  const targetBeatId = intent?.beatDirective.targetBeatId;
  const targetBeat =
    targetBeatId !== null && targetBeatId !== undefined && beats !== undefined
      ? beats.find((beat) => beat.id === targetBeatId)
      : undefined;

  return {
    beatDirective: intent?.beatDirective.summary,
    summary: intent?.intentSummary,
    targetBeat: targetBeat?.id ?? null,
    type: intent?.intentType,
  };
}

/**
 * The whole result as one instruction, or nothing when no check ran.
 *
 * The margin never appears: a collapse at −9 and a collapse at −5 are the same
 * turn, and the tier already is the magnitude.
 */
const outcomeInstruction = (
  plan: Partial<SkillCheckPlan>,
  result: Partial<SkillCheckResult>
): string | undefined => {
  const framing = result.outcomeTier === undefined
    ? undefined
    : OUTCOME_FRAMING.get(result.outcomeTier);
  if (framing === undefined) {
    return undefined;
  }
  return framing(plan.skill ?? 'do what they described')
    + swingClause(result)
    + momentumClause(result.newMomentum);
};

export function formatSkillCheck(
  plan: SkillCheckPlan | null | undefined,
  result: SkillCheckResult | null | undefined
): Record<string, unknown> {
  const planDetails: Partial<SkillCheckPlan> = plan ?? {};
  const resultDetails: Partial<SkillCheckResult> = result ?? {};
  return {
    // One instruction instead of a tier, a swing, a margin and three seeds.
    // What survives is how to frame the turn; how that lands belongs to the
    // stage holding the world.
    outcome: outcomeInstruction(planDetails, resultDetails),
    requiresCheck: planDetails.requiresCheck,
    riskLevel: planDetails.riskLevel,
  };
}

export function formatInventoryItem(item: InventoryEntry): Record<string, unknown> {
  return {
    kind: item.kind,
    name: item.name,
    quantity: item.quantity,
  };
}

export function formatInventoryItemDetail(item: InventoryEntry): Record<string, unknown> {
  return {
    description: item.description,
    effect: item.effect,
    kind: item.kind,
    name: item.name,
    quantity: item.quantity,
  };
}
