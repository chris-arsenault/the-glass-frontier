import {
  createStartingMomentum,
  skillKey,
  validateCharacterBuild,
  type Character,
  type CharacterDraft,
  type CharacterOrigin,
  type HardState,
  type PlayableRole,
} from '@glass-frontier/dto';
import type { StoredEncyclopediaEntry } from '@glass-frontier/worldstate';
import { TRPCError } from '@trpc/server';
import { randomUUID } from 'node:crypto';

import type { Context } from './context';

const atlasOriginChecks = (
  origin: CharacterOrigin
): Array<{ id: string; label: string; role: PlayableRole }> => [
  { id: origin.homelandId, label: 'homeland', role: 'homeland' },
  { id: origin.allegianceId, label: 'allegiance', role: 'allegiance' },
];

const resolveAtlasOrigin = async (
  ctx: Context,
  origin: CharacterOrigin
): Promise<HardState[]> => {
  const checks = atlasOriginChecks(origin);
  const entities = await ctx.worldSchemaStore.listEntitiesByIds(checks.map((check) => check.id));
  const byId = new Map(entities.map((entity) => [entity.id, entity]));

  return checks.map((check) => {
    const entity = byId.get(check.id);
    if (entity === undefined) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: `Unknown ${check.label} in canon.` });
    }
    if (!entity.playableAs.includes(check.role)) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `${entity.name} cannot be a character's ${check.label}.`,
      });
    }
    return entity;
  });
};

const resolveReferenceOrigin = async (
  ctx: Context,
  origin: CharacterOrigin
): Promise<{ culture: StoredEncyclopediaEntry; species: StoredEncyclopediaEntry }> => {
  const [species, culture] = await Promise.all([
    ctx.encyclopediaStore.getEntryById(origin.speciesReferenceId),
    ctx.encyclopediaStore.getEntryById(origin.cultureReferenceId),
  ]);
  const checks = [
    { entry: species, label: 'species', role: 'species' as const },
    { entry: culture, label: 'culture', role: 'culture' as const },
  ];
  for (const check of checks) {
    if (check.entry === null) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: `Unknown ${check.label} in canon.` });
    }
    if (
      check.entry.characterRole !== check.role
      || check.entry.status !== 'complete'
      || check.entry.dm
    ) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `${check.entry.title} cannot be a character's ${check.label}.`,
      });
    }
  }
  if (species === null || culture === null) {
    throw new Error('Character origin validation completed without both reference entries.');
  }
  return { culture, species };
};

/** Turns a player-authored draft into a server-owned character record. */
export const buildCharacter = async (
  ctx: Context,
  draft: CharacterDraft,
  playerId: string
): Promise<Character> => {
  const issues = validateCharacterBuild({ attributes: draft.attributes, skills: draft.skills });
  if (issues.length > 0) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: issues.map((issue) => issue.message).join(' '),
    });
  }

  const [atlasOrigin, referenceOrigin] = await Promise.all([
    resolveAtlasOrigin(ctx, draft.origin),
    resolveReferenceOrigin(ctx, draft.origin),
  ]);
  const [homeland] = atlasOrigin;

  return {
    archetype: draft.archetype.trim(),
    attributes: draft.attributes,
    bio: draft.bio.trim(),
    id: randomUUID(),
    inventory: [],
    momentum: createStartingMomentum(),
    name: draft.name.trim(),
    nature: draft.nature,
    origin: draft.origin,
    playerId,
    pronouns: draft.pronouns.trim(),
    skills: Object.fromEntries(
      draft.skills.map((skill) => [
        skillKey(skill.name),
        { attribute: skill.attribute, name: skill.name.trim(), tier: skill.tier, xp: 0 },
      ])
    ),
    tags: [
      referenceOrigin.species.title,
      referenceOrigin.culture.title,
      homeland.name,
      draft.archetype.trim(),
    ],
  };
};
