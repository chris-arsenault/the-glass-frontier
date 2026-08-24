import type { EntityReference, EntityReferenceSpan, EntityRosterEntry } from '@glass-frontier/dto';
import type { ReferenceEntityCandidate } from '@glass-frontier/worldstate';
import { z } from 'zod';

import type { EntitySnippet, GraphContext } from '../../types';
import type { GraphNode, GraphNodeDelta } from './graphNode';

const MAX_REFERENCES = 3;
const MIN_SEMANTIC_SIMILARITY = 0.5;

type ResolverSpeaker = 'player' | 'gm';
type ResolverMatch = { slug: string; text: string };
type ResolverRequest = {
  candidates: EntitySnippet[];
  content: string;
  context: GraphContext;
  ranked: ReferenceEntityCandidate[];
  transcriptEntryId: string;
};

const escapePattern = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const findSpan = (content: string, term: string): EntityReferenceSpan | null => {
  const normalized = term.trim();
  if (normalized.length === 0) {
    return null;
  }
  const match = new RegExp(`(^|[^\\p{L}\\p{N}])(${escapePattern(normalized)})(?=$|[^\\p{L}\\p{N}])`, 'iu')
    .exec(content);
  if (match === null || match.index === undefined || match[2] === undefined) {
    return null;
  }
  const start = match.index + (match[1]?.length ?? 0);
  return { end: start + match[2].length, start, text: match[2] };
};

const aliases = (entity: EntitySnippet): string[] => {
  const aka = entity.facts.aka;
  return typeof aka === 'string'
    ? aka.split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0)
    : [];
};

const exactSpan = (content: string, entity: EntitySnippet): EntityReferenceSpan | null =>
  [entity.name, ...aliases(entity)]
    .sort((left, right) => right.length - left.length)
    .map((term) => findSpan(content, term))
    .find((span) => span !== null) ?? null;

const overlaps = (left: EntityReferenceSpan, right: EntityReferenceSpan): boolean =>
  left.start < right.end && right.start < left.end;

const publicEntry = (entity: EntitySnippet): EntityRosterEntry => ({
  availability: ['connected'],
  description: entity.description,
  id: entity.id,
  kind: entity.kind,
  name: entity.name,
  slug: entity.slug,
  status: entity.status,
  subkind: entity.subkind,
});

const candidatePrompt = (
  candidates: EntitySnippet[],
  ranked: ReferenceEntityCandidate[]
): string => {
  const bySlug = new Map(candidates.map((candidate) => [candidate.slug, candidate]));
  return JSON.stringify(ranked.map((candidate) => {
    const entity = bySlug.get(candidate.slug);
    return {
      aliases: entity === undefined ? [] : aliases(entity),
      description: entity?.description,
      kind: entity?.kind,
      name: candidate.name,
      slug: candidate.slug,
    };
  }));
};

const semanticReferences = ({
  content,
  matches,
  ranked,
  speaker,
  transcriptEntryId,
}: {
  content: string;
  matches: ResolverMatch[];
  ranked: ReferenceEntityCandidate[];
  speaker: ResolverSpeaker;
  transcriptEntryId: string;
}): EntityReference[] => {
  const rankBySlug = new Map(ranked.map((candidate) => [candidate.slug, candidate]));
  const references: EntityReference[] = [];
  for (const match of matches) {
    const candidate = rankBySlug.get(match.slug);
    const span = findSpan(content, match.text);
    if (candidate === undefined || span === null || references.some((reference) =>
      reference.span !== null && overlaps(reference.span, span))) {
      continue;
    }
    references.push({
      confidence: candidate.similarity,
      entityId: candidate.id,
      entitySlug: candidate.slug,
      method: 'semantic',
      span,
      speaker,
      transcriptEntryId,
    });
  }
  return references;
};

const promoteReferences = (
  context: GraphContext,
  references: EntityReference[]
): Pick<GraphNodeDelta, 'chronicleState' | 'entityContext' | 'turnEntityRoster'> => {
  const entityContext = context.entityContext;
  if (entityContext === undefined) {
    return {};
  }
  const promoted = references.flatMap((reference) => {
    const candidate = entityContext.candidates.find((entity) => entity.id === reference.entityId);
    return candidate === undefined ? [] : [candidate];
  });
  const offered = [...promoted, ...entityContext.offered]
    .filter((entity, index, all) => all.findIndex((other) => other.id === entity.id) === index)
    .slice(0, 7);
  const prior = new Map(entityContext.roster.map((entry) => [entry.id, entry]));
  const roster = offered.map((entity) => prior.get(entity.id) ?? publicEntry(entity));
  return {
    chronicleState: {
      ...context.chronicleState,
      chronicle: {
        ...context.chronicleState.chronicle,
        entityRoster: {
          ...context.chronicleState.chronicle.entityRoster,
          entries: roster,
          updatedAtTurn: context.turnSequence,
        },
      },
    },
    entityContext: { ...entityContext, offered, roster },
    turnEntityRoster: roster,
  };
};

export class EntityReferenceResolverNode implements GraphNode {
  readonly id: string;
  readonly #speaker: ResolverSpeaker;

  constructor(speaker: ResolverSpeaker) {
    this.#speaker = speaker;
    this.id = `${speaker}-entity-reference-resolver`;
  }

  async execute(context: GraphContext): Promise<GraphNodeDelta> {
    const message = this.#speaker === 'player' ? context.playerMessage : context.gmResponse;
    if (context.failure || message === undefined || context.entityContext === undefined) {
      return {};
    }
    const candidates = this.#speaker === 'player'
      ? context.entityContext.candidates
      : context.entityContext.offered;
    const exact = this.#resolveExact(context, message.content, message.id, candidates);
    const semantic = exact.length === 0
      ? await this.#resolveSemantic(context, message.content, message.id, candidates)
      : [];
    const references = [...(context.entityReferences ?? []), ...exact, ...semantic];
    if (this.#speaker === 'gm') {
      return { entityReferences: references };
    }
    return {
      ...promoteReferences(context, [...exact, ...semantic]),
      entityReferences: references,
    };
  }

  #resolveExact(
    context: GraphContext,
    content: string,
    transcriptEntryId: string,
    candidates: EntitySnippet[]
  ): EntityReference[] {
    const targetIds = this.#speaker === 'player' ? new Set(context.targetEntityIds) : new Set<string>();
    const references: EntityReference[] = [];
    for (const entity of candidates) {
      const span = exactSpan(content, entity);
      if (!targetIds.has(entity.id) && span === null) {
        continue;
      }
      if (span !== null && references.some((reference) =>
        reference.span !== null && overlaps(reference.span, span))) {
        continue;
      }
      references.push({
        confidence: 1,
        entityId: entity.id,
        entitySlug: entity.slug,
        method: targetIds.has(entity.id) ? 'explicit' : 'exact',
        span,
        speaker: this.#speaker,
        transcriptEntryId,
      });
      if (references.length === MAX_REFERENCES) {
        break;
      }
    }
    return references;
  }

  async #resolveSemantic(
    context: GraphContext,
    content: string,
    transcriptEntryId: string,
    candidates: EntitySnippet[]
  ): Promise<EntityReference[]> {
    if (content.trim().length < 3 || candidates.length === 0) {
      return [];
    }
    try {
      const candidateKinds = [...new Set(candidates.map((candidate) => candidate.kind))];
      const hasEmbeddings = (await Promise.all(
        candidateKinds.map((kind) => context.worldSchemaStore.hasEntityEmbeddings(kind))
      )).some(Boolean);
      if (!hasEmbeddings) {
        return [];
      }
      const embedding = await context.embeddings.embed(content);
      const ranked = (await context.worldSchemaStore.findReferenceCandidates({
        candidateIds: candidates.map((candidate) => candidate.id),
        embedding,
        limit: 5,
      })).filter((candidate) => candidate.similarity >= MIN_SEMANTIC_SIMILARITY);
      if (ranked.length === 0) {
        return [];
      }
      return this.#askResolver({ candidates, content, context, ranked, transcriptEntryId });
    } catch (error) {
      context.telemetry.recordToolError({
        attempt: 0,
        chronicleId: context.chronicleId,
        message: error instanceof Error ? error.message : String(error),
        operation: this.id,
      });
      return [];
    }
  }

  async #askResolver(request: ResolverRequest): Promise<EntityReference[]> {
    const { candidates, content, context, ranked, transcriptEntryId } = request;
    const slugs = ranked.map((candidate) => candidate.slug) as [string, ...string[]];
    const schema = z.object({
      matches: z.array(z.object({
        slug: z.enum(slugs),
        text: z.string().min(1),
      })).max(MAX_REFERENCES),
    });
    const playerId = context.chronicleState.chronicle.playerId;
    const [instructions, model] = await Promise.all([
      context.templates.render('entity-reference-resolver', {}),
      context.modelConfigStore.getModelForCategory('classification', playerId),
    ]);
    const response = await context.llm.generateStructured({
      input: [
        { content: [{ text: content, type: 'input_text' }], role: 'user' },
        {
          content: [{
            text: candidatePrompt(candidates, ranked),
            type: 'input_text',
          }],
          role: 'developer',
        },
      ],
      instructions,
      maxOutputTokens: 700,
      metadata: {
        chronicleId: context.chronicleId,
        nodeId: this.id,
        playerId,
        turnId: context.turnId,
        turnSequence: String(context.turnSequence),
      },
      model,
      player: context.llmPlayer,
      reasoningEffort: 'low',
    }, schema, 'entity_reference_resolver_schema');
    return semanticReferences({
      content,
      matches: response.data.matches,
      ranked,
      speaker: this.#speaker,
      transcriptEntryId,
    });
  }
}
