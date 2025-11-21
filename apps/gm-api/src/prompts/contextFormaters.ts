import type {
  Character,
  ChronicleBeat,
  InventoryItem,
  LocationBreadcrumbEntry,
  LocationNeighbors,
  LocationPlace,
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
        id: b.id,
        status: b.status,
        title: b.title,
      };
    });
}

export function trimBreadcrumbList(crumbs: LocationBreadcrumbEntry[]) {
  return crumbs.map((b) => {
    return {
      kind: b.kind,
      name: b.name,
    };
  });
}

// Default objects
export const EMPTY_LOCATION_DETAIL = {
  adjacent: [],
  children: [],
  links: [],
  parent: [],
  siblings: [],
} as const;

export const EMPTY_LOCATION = {
  breadcrumbs: [],
  description: null,
  name: null,
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

export function formatIntent(intent: PlayerIntent | null | undefined): Record<string, unknown> {
  return {
    beatDirective: intent?.beatDirective.summary,
    summary: intent?.intentSummary,
    targetBeat: intent?.beatDirective.targetBeatId,
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
  const formatPlace = (place: LocationPlace) => ({
    description: place.description ?? null,
    name: place.name,
  });

  const formatNeighbor = (n: { neighbor: LocationPlace }) => formatPlace(n.neighbor);

  return {
    adjacent: neighbors.adjacent.map(formatNeighbor),
    children: neighbors.children.map(formatPlace),
    links: neighbors.links.map(formatNeighbor),
    parent: neighbors.parent ? [formatPlace(neighbors.parent)] : [],
    siblings: neighbors.siblings.map(formatPlace),
  };
}