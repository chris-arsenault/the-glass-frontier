import type {
  Character,
  ChronicleBeat,
  InventoryEntry,
  Intent,
  Skill,
  SkillCheckPlan,
  SkillCheckResult,
} from '@glass-frontier/dto';

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
  slug: string;
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
        slug: b.slug,
        status: b.status,
        title: b.title,
      };
    });
}

// Formatters
export function formatCharacter(character: Character | null | undefined): Record<string, unknown> {
  return {
    archetype: character?.archetype,
    attributes: character?.attributes,
    name: character?.name,
    pronouns: character?.pronouns,
    skills: trimSkillsList(Object.values(character?.skills ?? {})),
  };
}

export function formatIntent(
  intent: Intent | null | undefined,
  beats?: ChronicleBeat[]
): Record<string, unknown> {
  // Look up beat slug from ID if targetBeatId is set
  let targetBeatSlug = null;
  const targetBeatId = intent?.beatDirective.targetBeatId;
  if (targetBeatId !== null && targetBeatId !== undefined && beats !== undefined) {
    const targetBeat = beats.find((beat) => beat.id === targetBeatId);
    targetBeatSlug = targetBeat?.slug ?? null;
  }

  return {
    beatDirective: intent?.beatDirective.summary,
    summary: intent?.intentSummary,
    targetBeat: targetBeatSlug,
    type: intent?.intentType,
  };
}

export function formatSkillCheck(
  plan: SkillCheckPlan | null | undefined,
  result: SkillCheckResult | null | undefined
): Record<string, unknown> {
  return {
    advantage: result?.advantage,
    outcome: result?.outcomeTier,
    riskLevel: plan?.riskLevel,
    skill: plan?.skill,
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

