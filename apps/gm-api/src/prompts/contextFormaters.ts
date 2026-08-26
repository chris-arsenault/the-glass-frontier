import type {
  ChronicleBeat,
  InventoryEntry,
  Intent,
  OutcomeTier,
  SkillCheckPlan,
  SkillCheckResult,
} from '@glass-frontier/dto';

const SEEDED_TIERS = new Set<OutcomeTier>(['stall', 'regress', 'collapse']);

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
 * The planner writes three complication seeds before the dice are rolled, and
 * the narrator played all three whatever came back — so a success still
 * shipped three fresh ways to lose and every turn ratcheted the pressure up.
 * A turn that went badly gets one seed; a turn that went well gets none.
 */
function seedsForOutcome(
  seeds: string[] | undefined,
  outcome: OutcomeTier | undefined
): string[] {
  if (outcome === undefined || !SEEDED_TIERS.has(outcome)) {
    return [];
  }
  return (seeds ?? []).slice(0, 1);
}

function resolveSwing(result: Partial<SkillCheckResult>): string | undefined {
  if (result.advantage === true) {
    return 'advantage';
  }
  return result.disadvantage === true ? 'disadvantage' : undefined;
}

export function formatSkillCheck(
  plan: SkillCheckPlan | null | undefined,
  result: SkillCheckResult | null | undefined
): Record<string, unknown> {
  const planDetails: Partial<SkillCheckPlan> = plan ?? {};
  const resultDetails: Partial<SkillCheckResult> = result ?? {};
  return {
    attribute: planDetails.attribute,
    complicationSeeds: seedsForOutcome(
      planDetails.complicationSeeds, resultDetails.outcomeTier
    ),
    outcome: resultDetails.outcomeTier,
    requiresCheck: planDetails.requiresCheck,
    riskLevel: planDetails.riskLevel,
    skill: planDetails.skill,
    // One field instead of three. The narrator was reading `plannedAdvantage:
    // disadvantage, resultAdvantage: false, resultDisadvantage: false` and
    // having to work out which one applied; only the state the roll actually
    // ran under matters, and when it ran even, there is nothing to say.
    swing: resolveSwing(resultDetails),
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
