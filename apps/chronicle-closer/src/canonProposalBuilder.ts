import type {
  CanonProposal,
  EntityRef,
  HardState,
  LoreFragment,
  ProposedEntity,
  ProposedLoreFragment,
  ProposedRelationship,
} from '@glass-frontier/dto';
import { isRelationshipAllowed } from '@glass-frontier/dto';
import { toSnakeCase } from '@glass-frontier/utils';

import type {
  RelationshipProposal,
  RosterEntry,
  SanitizedKnownLore,
  SanitizedNewEntity,
} from './canonHelpers';

export type Resolution = { action: 'create' } | { action: 'merge'; entity: HardState };

type ProposalTarget = {
  key: string;
  kind: string;
  name: string;
  ref: EntityRef;
};

export type ProposedLoreSummary = { prose: string; tags: string[]; title: string };

export type DeriveTarget = {
  entity: ProposedEntity;
  existing: HardState | null;
  newEdges: Array<{ direction: 'in' | 'out'; otherName: string; relationship: string }>;
  newLore: ProposedLoreSummary[];
};

export type ProposalPlan = {
  entities: ProposedEntity[];
  lore: ProposedLoreFragment[];
  loreByEntityId: Map<string, ProposedLoreSummary[]>;
  relationships: ProposedRelationship[];
  targets: DeriveTarget[];
  targetsByKey: Map<string, DeriveTarget>;
};

type BuilderState = ProposalPlan & {
  chronicleId: string;
  pendingRelationships: Array<{ owner: ProposalTarget; rel: RelationshipProposal }>;
  targetIndex: Map<string, ProposalTarget>;
  usedLoreKeys: Set<string>;
};

const register = (state: BuilderState, token: string, target: ProposalTarget): void => {
  const key = token.trim().toLowerCase();
  if (key.length > 0 && !state.targetIndex.has(key)) {
    state.targetIndex.set(key, target);
  }
};

const addLore = (
  state: BuilderState,
  entityRef: EntityRef,
  externalKey: string,
  entry: { loreProse: string; loreTags: string[]; loreTitle: string }
): ProposedLoreSummary | null => {
  if (state.usedLoreKeys.has(externalKey)) {
    return null;
  }
  state.usedLoreKeys.add(externalKey);
  state.lore.push({
    entity: entityRef,
    externalKey,
    prose: entry.loreProse,
    tags: entry.loreTags,
    title: entry.loreTitle,
  });
  return { prose: entry.loreProse, tags: entry.loreTags, title: entry.loreTitle };
};

const recordEntityLore = (
  state: BuilderState,
  entityId: string,
  fragment: ProposedLoreSummary | null
): void => {
  if (fragment !== null) {
    state.loreByEntityId.set(entityId, [
      ...(state.loreByEntityId.get(entityId) ?? []),
      fragment,
    ]);
  }
};

const addKnownLore = (state: BuilderState, entries: SanitizedKnownLore[]): void => {
  for (const entry of entries) {
    const fragment = addLore(
      state,
      { id: entry.roster.id },
      `chronicle:${state.chronicleId}:lore:${entry.roster.slug}`,
      entry
    );
    recordEntityLore(state, entry.roster.id, fragment);
    const owner: ProposalTarget = {
      key: entry.roster.id,
      kind: entry.roster.kind,
      name: entry.roster.name,
      ref: { id: entry.roster.id },
    };
    for (const rel of entry.relationships) {
      state.pendingRelationships.push({ owner, rel });
    }
  }
};

const addMergedCandidate = (
  state: BuilderState,
  candidate: SanitizedNewEntity,
  entity: HardState
): void => {
  const target: ProposalTarget = {
    key: entity.id,
    kind: entity.kind,
    name: entity.name,
    ref: { id: entity.id },
  };
  register(state, candidate.name, target);
  register(state, entity.slug, target);
  const fragment = addLore(
    state,
    { id: entity.id },
    `chronicle:${state.chronicleId}:lore:${entity.slug}`,
    candidate
  );
  recordEntityLore(state, entity.id, fragment);
  for (const rel of candidate.relationships) {
    state.pendingRelationships.push({ owner: target, rel });
  }
};

const addCreatedCandidate = (state: BuilderState, candidate: SanitizedNewEntity): void => {
  const target: ProposalTarget = {
    key: `ref:${candidate.name}`,
    kind: candidate.kind,
    name: candidate.name,
    ref: { ref: candidate.name },
  };
  register(state, candidate.name, target);
  const entity: ProposedEntity = {
    externalKey: `chronicle:${state.chronicleId}:${toSnakeCase(candidate.name)}`,
    isLocation: candidate.isLocation,
    kind: candidate.kind as ProposedEntity['kind'],
    name: candidate.name,
    prominence: 'marginal',
    ref: candidate.name,
    subkind: candidate.subkind as ProposedEntity['subkind'],
  };
  state.entities.push(entity);
  const fragment = addLore(
    state,
    { ref: candidate.name },
    `chronicle:${state.chronicleId}:lore:${toSnakeCase(candidate.name)}`,
    candidate
  );
  const derive: DeriveTarget = {
    entity,
    existing: null,
    newEdges: [],
    newLore: fragment === null ? [] : [fragment],
  };
  state.targets.push(derive);
  state.targetsByKey.set(target.key, derive);
  for (const rel of candidate.relationships) {
    state.pendingRelationships.push({ owner: target, rel });
  }
};

const relationshipAccepted = (
  state: BuilderState,
  owner: ProposalTarget,
  rel: RelationshipProposal
): ProposalTarget | null => {
  const destination = state.targetIndex.get(rel.target.trim().toLowerCase());
  if (destination === undefined || destination.key === owner.key) {
    return null;
  }
  return isRelationshipAllowed(rel.relationship, owner.kind, destination.kind)
    ? destination
    : null;
};

const flushRelationships = (state: BuilderState): void => {
  const seen = new Set<string>();
  for (const { owner, rel } of state.pendingRelationships) {
    const destination = relationshipAccepted(state, owner, rel);
    if (destination === null) {
      continue;
    }
    const dedupeKey = `${owner.key}|${destination.key}|${rel.relationship}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    state.relationships.push({
      dst: destination.ref,
      relationship: rel.relationship as ProposedRelationship['relationship'],
      src: owner.ref,
    });
    state.targetsByKey.get(owner.key)?.newEdges.push({
      direction: 'out',
      otherName: destination.name,
      relationship: rel.relationship,
    });
    state.targetsByKey.get(destination.key)?.newEdges.push({
      direction: 'in',
      otherName: owner.name,
      relationship: rel.relationship,
    });
  }
};

/**
 * Pure assembly of the closure batch: known-entity lore, merged and created
 * candidates, and the deduped, vocabulary-checked relationships between them.
 * Database-dependent additions (re-proposing play-born entities) come after,
 * via `appendPlayEntityTargets`.
 */
export const buildProposalPlan = (input: {
  candidates: SanitizedNewEntity[];
  chronicleId: string;
  knownLore: SanitizedKnownLore[];
  resolutions: Map<string, Resolution>;
  roster: RosterEntry[];
}): ProposalPlan => {
  const state: BuilderState = {
    chronicleId: input.chronicleId,
    entities: [],
    lore: [],
    loreByEntityId: new Map(),
    pendingRelationships: [],
    relationships: [],
    targetIndex: new Map(),
    targets: [],
    targetsByKey: new Map(),
    usedLoreKeys: new Set(),
  };
  for (const entry of input.roster) {
    const target: ProposalTarget = {
      key: entry.id,
      kind: entry.kind,
      name: entry.name,
      ref: { id: entry.id },
    };
    register(state, entry.slug, target);
    register(state, entry.name, target);
  }
  addKnownLore(state, input.knownLore);
  for (const candidate of input.candidates) {
    const resolution = input.resolutions.get(candidate.name.toLowerCase()) ?? {
      action: 'create' as const,
    };
    if (resolution.action === 'merge') {
      addMergedCandidate(state, candidate, resolution.entity);
    } else {
      addCreatedCandidate(state, candidate);
    }
  }
  flushRelationships(state);
  return state;
};

/**
 * Re-proposes existing play-born entities that this closure touched, so their
 * derived description and prominence can be recomputed. The caller supplies
 * the fetched entities, already filtered to `source = 'play'`: seed and import
 * entities are never re-proposed — their fields belong to their source, and
 * the writer would silently ignore the update anyway.
 */
export const appendPlayEntityTargets = (
  plan: ProposalPlan,
  playEntities: HardState[]
): void => {
  for (const existing of playEntities) {
    const entity: ProposedEntity = {
      facts: existing.facts,
      id: existing.id,
      isLocation: existing.isLocation,
      kind: existing.kind,
      name: existing.name,
      prominence: existing.prominence,
      status: existing.status,
      subkind: existing.subkind,
    };
    plan.entities.push(entity);
    const derive: DeriveTarget = {
      entity,
      existing,
      newEdges: [],
      newLore: plan.loreByEntityId.get(existing.id) ?? [],
    };
    plan.targets.push(derive);
    plan.targetsByKey.set(existing.id, derive);
  }
  for (const relationship of plan.relationships) {
    recordEdgeOnExisting(plan, relationship);
  }
};

const recordEdgeOnExisting = (plan: ProposalPlan, relationship: ProposedRelationship): void => {
  const srcId = 'id' in relationship.src ? relationship.src.id : undefined;
  const dstId = 'id' in relationship.dst ? relationship.dst.id : undefined;
  for (const [id, otherRef, direction] of [
    [srcId, relationship.dst, 'out'],
    [dstId, relationship.src, 'in'],
  ] as const) {
    if (id === undefined) {
      continue;
    }
    const derive = plan.targetsByKey.get(id);
    if (derive === undefined || derive.existing === null) {
      continue;
    }
    const alreadyRecorded = derive.newEdges.some(
      (edge) => edge.relationship === relationship.relationship && edge.direction === direction
    );
    if (!alreadyRecorded) {
      derive.newEdges.push({
        direction,
        otherName: 'ref' in otherRef ? otherRef.ref : 'another entity',
        relationship: relationship.relationship,
      });
    }
  }
};

export const toCanonProposal = (plan: ProposalPlan, chronicleId: string): CanonProposal => ({
  entities: plan.entities,
  lore: plan.lore,
  relationships: plan.relationships,
  source: 'play',
  sourceId: chronicleId,
});

/**
 * Everything the entity-summarizer should see about one target: stored lore
 * and edges merged with what this batch is about to add.
 */
export const buildDeriveContext = (
  target: DeriveTarget,
  storedLore: LoreFragment[],
  neighborNames: Map<string, string>
): {
  loreFragments: ProposedLoreSummary[];
  relationships: Array<{ direction: 'in' | 'out'; otherName: string; relationship: string }>;
} => {
  const storedFragments = storedLore.map((fragment) => ({
    prose: fragment.prose,
    tags: fragment.tags,
    title: fragment.title,
  }));
  const storedEdges = (target.existing?.links ?? []).map((link) => ({
    direction: link.direction,
    otherName: neighborNames.get(link.targetId) ?? 'an unnamed entity',
    relationship: link.relationship,
  }));
  return {
    loreFragments: [...storedFragments, ...target.newLore],
    relationships: [...storedEdges, ...target.newEdges],
  };
};
