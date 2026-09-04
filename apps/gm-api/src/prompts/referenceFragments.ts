import { entityView } from '@glass-frontier/app';
import type { HardState } from '@glass-frontier/dto';

import type { GraphContext } from '../types';

export const encyclopediaFragment = (
  context: GraphContext
): Array<Record<string, unknown>> =>
  (context.encyclopediaContext ?? []).map((entry) => ({
    affordance: entry.usage.affordances[0],
    cue: entry.usage.cues[0],
    kind: entry.kind,
    slug: `encyclopedia:${entry.slug}`,
    subkind: entry.subkind,
    summary: entry.summary,
    title: entry.title,
  }));

const encyclopediaReference = (
  entry: GraphContext['directEncyclopediaEntries'][number]
): Record<string, unknown> => ({
  aliases: entry.aliases,
  atlasExamples: [...entry.instances, ...entry.members],
  attachment: true,
  facts: entry.facts,
  identity: entry.descriptiveIdentity,
  kind: entry.kind,
  sections: entry.sections,
  slug: `encyclopedia:${entry.slug}`,
  subkind: entry.subkind,
  summary: entry.summary,
  tiers: entry.tiers,
  title: entry.title,
  topics: entry.topics,
  usage: entry.usage,
});

const atlasReference = async (
  context: GraphContext,
  entity: HardState
): Promise<Record<string, unknown>> => {
  const targetIds = [...new Set(entity.links
    .filter((link) => link.live !== false)
    .map((link) => link.targetId))];
  const [lore, targets, classifications] = await Promise.all([
    context.worldSchemaStore.listLoreFragmentsByEntity({ entityId: entity.id, limit: 6 }),
    context.worldSchemaStore.listEntitiesByIds(targetIds),
    context.encyclopediaStore.listClassificationsForEntity(entity.id),
  ]);
  const targetsById = new Map(targets.filter((target) => !target.dm).map(
    (target) => [target.id, target]
  ));
  return {
    ...entityView(entity, lore, { fullLore: true, loreLimit: 6, noteLimit: 8 }),
    attachment: true,
    classifications,
    relationships: entity.links.flatMap((link) => {
      const target = targetsById.get(link.targetId);
      return target === undefined ? [] : [{
        direction: link.direction,
        identity: link.descriptiveIdentity ?? {},
        slug: `atlas:${target.slug}`,
        title: target.name,
        verb: link.relationship,
      }];
    }),
    slug: `atlas:${entity.slug}`,
  };
};

export const entityReferencesFragment = async (
  context: GraphContext
): Promise<Array<Record<string, unknown>>> => {
  const directIds = new Set(context.targetEntityIds);
  const directEntities = await context.worldSchemaStore.listEntitiesByIds(
    context.targetEntityIds
  );
  const directAtlas = await Promise.all(
    directEntities.filter((entity) => !entity.dm).map((entity) =>
      atlasReference(context, entity)
    )
  );
  const mentions = (context.entityReferences ?? [])
    .filter((reference) => !directIds.has(reference.entityId))
    .map((reference) => ({
      attachment: false,
      method: reference.method,
      slug: `atlas:${reference.entitySlug}`,
      speaker: reference.speaker,
      text: reference.span?.text ?? null,
    }));
  return [
    ...directAtlas,
    ...context.directEncyclopediaEntries.map(encyclopediaReference),
    ...mentions,
  ];
};
