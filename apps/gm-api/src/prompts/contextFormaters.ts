import type {
  Character,
  ChronicleBeat,
  InventoryEntry,
  Intent,
  OutcomeTier,
  Skill,
  SkillCheckPlan,
  SkillCheckResult,
} from '@glass-frontier/dto';

const SEEDED_TIERS = new Set<OutcomeTier>(['stall', 'regress', 'collapse']);

export function trimSkillsList(skills: Skill[]): Array<{
  attribute: string;
  name: string;
  tier: string;
}> {
  return skills.map((s) => {
    return {
      attribute: s.attribute,
      name: s.name,
      tier: s.tier,
    };
  });
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

// Formatters
export function formatCharacter(
  character: Character,
  originNames: OriginNames
): Record<string, unknown> {
  return {
    archetype: character.archetype,
    attributes: character.attributes,
    bio: character.bio,
    callings: character.nature.callings,
    drive: character.nature.drive,
    flaw: character.nature.flaw,
    instinct: character.nature.instinct,
    name: character.name,
    origin: {
      allegiance: originNames.allegiance,
      allegianceStance: character.origin.allegianceStance,
      culture: originNames.culture,
      homeland: originNames.homeland,
      species: originNames.species,
    },
    pronouns: character.pronouns,
    skills: trimSkillsList(Object.values(character.skills)),
    uniqueThing: character.nature.uniqueThing,
  };
}

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
    plannedAdvantage: planDetails.advantage,
    requiresCheck: planDetails.requiresCheck,
    resultAdvantage: resultDetails.advantage,
    resultDisadvantage: resultDetails.disadvantage,
    riskLevel: planDetails.riskLevel,
    skill: planDetails.skill,
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
