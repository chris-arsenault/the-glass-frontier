import type {
  EntityReference,
  EntityReferenceSpan,
  HardState,
  ProseSidecarEntry,
  TranscriptEntry,
} from '@glass-frontier/dto';

import type { GraphNodeDelta } from '../gmGraph/nodes/graphNode';
import type { GraphContext } from '../types';
import { applyEntityUsage, type EntityUsageClassification } from './entityFocus';
import { findSpan } from './spans';

/**
 * Turns the scout's sidecar into the turn's entity record.
 *
 * Two model calls used to do this after the fact: a judge re-read the
 * narration and scored the seven offered entities, and a resolver asked a
 * model which spans of GM prose referred to which of them. Retrieval proves
 * what material the writer received; the final prose proves what it used. We
 * keep only entries whose canonical name or slug appears in that prose.
 */
export const applySidecar = async (
  context: GraphContext,
  sidecar: ProseSidecarEntry[],
  gmResponse: TranscriptEntry
): Promise<GraphNodeDelta> => {
  const playerReferenceIds = (context.entityReferences ?? [])
    .filter((reference) => reference.speaker === 'player')
    .map((reference) => reference.entityId);
  const entityIds = [...new Set([
    ...sidecar.map((entry) => entry.entityId),
    ...playerReferenceIds,
  ])];
  const [tagsById, entities] = await Promise.all([
    context.worldSchemaStore.listTagsByEntities({ entityIds }),
    context.worldSchemaStore.listEntitiesByIds(sidecar.map((entry) => entry.entityId)),
  ]);
  const entitiesById = new Map(entities.map((entity) => [entity.id, entity]));
  const gmReferences = gmSpanReferences(sidecar, gmResponse, entitiesById);
  const narratedIds = new Set(gmReferences.map((reference) => reference.entityId));
  const usage: EntityUsageClassification[] = sidecar
    .filter((entry) => narratedIds.has(entry.entityId))
    .map((entry) => ({
      emergentTags: entry.emergentTags.length > 0 ? entry.emergentTags : null,
      entityId: entry.entityId,
      entitySlug: entry.entitySlug,
      tags: tagsById.get(entry.entityId) ?? [],
      usage: entry.usage,
    }));
  const playerReferences = playerReferenceIds.map((entityId) => ({
    entityId,
    tags: tagsById.get(entityId) ?? [],
  }));
  return {
    chronicleState: {
      ...context.chronicleState,
      chronicle: {
        ...context.chronicleState.chronicle,
        entityFocus: applyEntityUsage(
          context.chronicleState.chronicle.entityFocus, usage, playerReferences
        ),
      },
    },
    entityReferences: [
      ...(context.entityReferences ?? []),
      ...gmReferences,
    ],
    entityUsage: usage,
  };
};

const overlaps = (left: EntityReferenceSpan, right: EntityReferenceSpan): boolean =>
  left.start < right.end && right.start < left.end;

/** Where each retrieved entity is named in the narration, first mention only. */
const gmSpanReferences = (
  sidecar: ProseSidecarEntry[],
  gmResponse: TranscriptEntry,
  entitiesById: Map<string, HardState>
): EntityReference[] => {
  const references: EntityReference[] = [];
  for (const entry of sidecar) {
    const entity = entitiesById.get(entry.entityId);
    if (entity === undefined) {
      continue;
    }
    const span = [entity.name, entry.entitySlug.replaceAll(/[-_]/gu, ' ')]
      .map((name) => findSpan(gmResponse.content, name))
      .filter((candidate): candidate is EntityReferenceSpan => candidate !== null)
      .sort((left, right) => {
        const startOrder = left.start - right.start;
        return startOrder !== 0 ? startOrder : right.end - left.end;
      })[0] ?? null;
    if (span === null) {
      continue;
    }
    if (references.some((existing) =>
      existing.span !== null && existing.span !== undefined && overlaps(existing.span, span))) {
      continue;
    }
    references.push({
      confidence: 1,
      entityId: entry.entityId,
      entitySlug: entry.entitySlug,
      method: 'exact',
      span,
      speaker: 'gm',
      transcriptEntryId: gmResponse.id,
    });
  }
  return references;
};
