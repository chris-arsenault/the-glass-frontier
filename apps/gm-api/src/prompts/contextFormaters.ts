import type {
  Character,
  ChronicleBeat,
  InventoryItem,
  LocationNeighbors,
  PlayerIntent,
  Skill,
  SkillCheckPlan,
  SkillCheckResult,
} from '@glass-frontier/dto';

export function trimSkillsList(skills: Skill[]) {
  return skills.map((s) => {
    return {
      name: s.name,
      tier: s.tier,
      attribute: s.attribute,
    };
  });
}

export function trimBeatsList(beats: ChronicleBeat[]) {
  return beats
    .filter((b) => {
      return b.status == 'in_progress';
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

// Default objects
export const EMPTY_LOCATION_DETAIL: Record<string, unknown> = {};

export const EMPTY_LOCATION = {
  name: null,
  slug: null,
  description: null,
  status: null,
  tags: [],
} as const;

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

export function formatIntent(intent: PlayerIntent | null | undefined, beats?: ChronicleBeat[]): Record<string, unknown> {
  // Look up beat slug from ID if targetBeatId is set
  let targetBeatSlug = null;
  if (intent?.beatDirective.targetBeatId && beats) {
    const targetBeat = beats.find(b => b.id === intent.beatDirective.targetBeatId);
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

export function formatInventoryItem(item: InventoryItem): Record<string, unknown> {
  return {
    kind: item.kind,
    name: item.name,
    quantity: item.quantity,
  };
}

export function formatInventoryItemDetail(item: InventoryItem): Record<string, unknown> {
  return {
    description: item.description,
    effect: item.effect,
    kind: item.kind,
    name: item.name,
    quantity: item.quantity,
  };
}

export function formatLocationNeighbors(neighbors: LocationNeighbors): Record<string, unknown> {
  const formatted: Record<string, unknown> = {};
  for (const [relationship, entries] of Object.entries(neighbors)) {
    formatted[relationship] = entries.map((entry) => ({
      direction: entry.direction,
      hops: entry.hops,
      name: entry.neighbor.name,
      slug: entry.neighbor.slug,
      description: entry.neighbor.description ?? null,
      subkind: entry.neighbor.subkind ?? null,
      status: entry.neighbor.status ?? null,
      via: entry.via
        ? {
            direction: entry.via.direction,
            relationship: entry.via.relationship,
          }
        : null,
    }));
  }
  return formatted;
}
