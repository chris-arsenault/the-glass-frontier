import type {
  EntityReference,
  EntityReferenceSpan,
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
 * model which spans of GM prose referred to which of them. Both were guessing
 * at something the retrieving agent already knew — it opened those entities on
 * purpose. The sidecar is authoritative now, and the only inference left is
 * finding where each entity's name appears in the prose, which is a string
 * search.
 */
export const applySidecar = async (
  context: GraphContext,
  sidecar: ProseSidecarEntry[],
  gmResponse: TranscriptEntry
): Promise<GraphNodeDelta> => {
  const playerReferenceIds = (context.entityReferences ?? [])
    .filter((reference) => reference.speaker === 'player')
    .map((reference) => reference.entityId);
  const tagsById = await context.worldSchemaStore.listTagsByEntities({
    entityIds: [...new Set([...sidecar.map((entry) => entry.entityId), ...playerReferenceIds])],
  });
  const usage: EntityUsageClassification[] = sidecar.map((entry) => ({
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
      ...gmSpanReferences(sidecar, gmResponse),
    ],
    entityUsage: usage,
  };
};

const overlaps = (left: EntityReferenceSpan, right: EntityReferenceSpan): boolean =>
  left.start < right.end && right.start < left.end;

/** Where each retrieved entity is named in the narration, first mention only. */
const gmSpanReferences = (
  sidecar: ProseSidecarEntry[],
  gmResponse: TranscriptEntry
): EntityReference[] => {
  const references: EntityReference[] = [];
  for (const entry of sidecar) {
    const span = findSpan(gmResponse.content, entry.entitySlug.replaceAll('_', ' '));
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
