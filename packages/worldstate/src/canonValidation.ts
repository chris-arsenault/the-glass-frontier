import {
  BANNED_RELATIONSHIP_TYPE_IDS,
  WORLD_TAG_IDS,
  getRelationshipType,
  getWorldKind,
  isRelationshipAllowed,
  type CanonProposal,
  type EntityRef,
  type ProposalViolation,
} from '@glass-frontier/dto';

/** An already-stored entity the proposal points at but does not declare. */
export type ResolvableEntity = {
  id: string;
  kind: string;
};

export type ProposalResolution = {
  violations: ProposalViolation[];
  /** Kind of every referable entity, keyed by ref, external key, or id. */
  kindByKey: Map<string, string>;
};

export const refKey = (ref: EntityRef): string => {
  if ('id' in ref) {
    return `id:${ref.id}`;
  }
  if ('externalKey' in ref) {
    return `key:${ref.externalKey}`;
  }
  return `ref:${ref.ref}`;
};

const describeRef = (ref: EntityRef): string => {
  if ('id' in ref) {
    return `id ${ref.id}`;
  }
  if ('externalKey' in ref) {
    return `external key ${ref.externalKey}`;
  }
  return `ref ${ref.ref}`;
};

/**
 * Checks a proposal against the world vocabulary and its own internal
 * references, collecting every violation. Nothing is written and nothing throws:
 * the caller decides what to do with the list.
 *
 * `existing` supplies the kind of entities the proposal points at but does not
 * declare, so relationship rules can be checked for those too.
 */
export const validateProposal = (
  proposal: CanonProposal,
  existing: Map<string, ResolvableEntity>
): ProposalResolution => {
  const kindByKey = new Map<string, string>();
  for (const [key, entity] of existing) {
    kindByKey.set(key, entity.kind);
  }

  const violations = [
    ...checkEntities(proposal, kindByKey),
    ...proposal.relationships.flatMap((relationship, index) =>
      checkRelationship(relationship, index, kindByKey)
    ),
    ...proposal.lore.flatMap((fragment, index) => checkLoreFragment(fragment, index, kindByKey)),
  ];

  return { kindByKey, violations };
};

/** Checks kinds, subkinds, statuses, and in-batch identity collisions. */
const checkEntities = (
  proposal: CanonProposal,
  kindByKey: Map<string, string>
): ProposalViolation[] => {
  const seen = { externalKeys: new Set<string>(), refs: new Set<string>() };

  return proposal.entities.flatMap((entity, index) => {
    const at = `entities[${index}]`;
    const kind = getWorldKind(entity.kind);
    if (kind === undefined) {
      return [{
        at,
        code: 'unknown_kind' as const,
        message: `Kind ${entity.kind} is not in the world vocabulary`,
      }];
    }
    return [
      ...checkEntityVocabulary(entity, kind, at),
      ...claimIdentity(entity, at, kindByKey, seen),
    ];
  });
};

const checkEntityVocabulary = (
  entity: CanonProposal['entities'][number],
  kind: NonNullable<ReturnType<typeof getWorldKind>>,
  at: string
): ProposalViolation[] => {
  // Status is deliberately unchecked: the source schema declares no status
  // vocabulary, so any string the source records is stored verbatim.
  if (entity.subkind !== undefined && !kind.subkinds.includes(entity.subkind)) {
    return [{
      at,
      code: 'unknown_subkind',
      message: `Subkind ${entity.subkind} is not valid for kind ${entity.kind}`,
    }];
  }
  return [];
};

/** Checks the lore target resolves and its tags are in the tag vocabulary. */
const checkLoreFragment = (
  fragment: CanonProposal['lore'][number],
  index: number,
  kindByKey: Map<string, string>
): ProposalViolation[] => {
  const at = `lore[${index}]`;
  const violations: ProposalViolation[] = [];
  if (!kindByKey.has(refKey(fragment.entity))) {
    violations.push({
      at,
      code: 'unresolved_reference',
      message: `Lore target ${describeRef(fragment.entity)} is not an existing entity or declared in this batch`,
    });
  }
  for (const tag of fragment.tags ?? []) {
    if (!WORLD_TAG_IDS.has(tag)) {
      violations.push({
        at,
        code: 'unknown_tag',
        message: `Tag ${tag} is not in the world tag vocabulary`,
      });
    }
  }
  return violations;
};

/**
 * Registers the names this entity can be referenced by, so later relationships
 * and lore in the same batch resolve, and flags any name claimed twice.
 */
const claimIdentity = (
  entity: CanonProposal['entities'][number],
  at: string,
  kindByKey: Map<string, string>,
  seen: { refs: Set<string>; externalKeys: Set<string> }
): ProposalViolation[] => {
  const { externalKeys: seenExternalKeys, refs: seenRefs } = seen;
  const violations: ProposalViolation[] = [];
  if (entity.ref !== undefined) {
    if (seenRefs.has(entity.ref)) {
      violations.push({
        at,
        code: 'duplicate_ref',
        message: `Ref ${entity.ref} is declared more than once in this batch`,
      });
    }
    seenRefs.add(entity.ref);
    kindByKey.set(`ref:${entity.ref}`, entity.kind);
  }
  if (entity.externalKey !== undefined) {
    if (seenExternalKeys.has(entity.externalKey)) {
      violations.push({
        at,
        code: 'duplicate_external_key',
        message: `External key ${entity.externalKey} is declared more than once in this batch`,
      });
    }
    seenExternalKeys.add(entity.externalKey);
    kindByKey.set(`key:${entity.externalKey}`, entity.kind);
  }
  return violations;
};

const unresolvedRef = (
  at: string,
  role: 'Source' | 'Target',
  ref: EntityRef
): ProposalViolation => ({
  at,
  code: 'unresolved_reference',
  message: `${role} ${describeRef(ref)} is not an existing entity or declared in this batch`,
});

/** Checks one relationship against the vocabulary and the batch's references. */
const checkRelationship = (
  relationship: CanonProposal['relationships'][number],
  index: number,
  kindByKey: Map<string, string>
): ProposalViolation[] => {
  const at = `relationships[${index}]`;
  const type = getRelationshipType(relationship.relationship);
  if (type === undefined) {
    return [{
      at,
      code: 'unknown_relationship',
      message: `Relationship ${relationship.relationship} is not in the world vocabulary`,
    }];
  }
  if (BANNED_RELATIONSHIP_TYPE_IDS.has(relationship.relationship)) {
    return [{
      at,
      code: 'banned_relationship',
      message:
        `Relationship ${relationship.relationship} is banned: ${type.description} ` +
        'Choose the narrowest verb that states the actual fact.',
    }];
  }

  const srcKind = kindByKey.get(refKey(relationship.src));
  const dstKind = kindByKey.get(refKey(relationship.dst));
  if (srcKind === undefined || dstKind === undefined) {
    return [
      ...(srcKind === undefined ? [unresolvedRef(at, 'Source', relationship.src)] : []),
      ...(dstKind === undefined ? [unresolvedRef(at, 'Target', relationship.dst)] : []),
    ];
  }

  if (isRelationshipAllowed(relationship.relationship, srcKind, dstKind)) {
    return [];
  }
  const constraint = type.constraint;
  return [{
    at,
    code: 'relationship_not_allowed',
    message:
      `Relationship ${relationship.relationship} is not allowed from ${srcKind} to ${dstKind}.` +
      (constraint === undefined
        ? ''
        : ` It is declared ${constraint.srcKind} → ${constraint.dstKind}.`),
  }];
};

export class ProposalRejected extends Error {
  readonly violations: ProposalViolation[];

  constructor(violations: ProposalViolation[]) {
    const summary = violations
      .slice(0, 5)
      .map((violation) => `${violation.at}: ${violation.message}`)
      .join('; ');
    const overflow = violations.length > 5 ? ` (+${violations.length - 5} more)` : '';
    super(`Canon proposal rejected with ${violations.length} violation(s). ${summary}${overflow}`);
    this.name = 'ProposalRejected';
    this.violations = violations;
  }
}
