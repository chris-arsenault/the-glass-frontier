import { z, type ZodType } from 'zod';

import { applyEntityUsage, type EntityUsageClassification } from '../../../entity/entityFocus';
import { buildEntityContext } from '../../../entity/entitySelector';
import type { GraphContext } from '../../../types';
import type { GraphNode, GraphNodeDelta } from '../graphNode';
import { LlmClassifierNode } from './LlmClassiferNode';

type EntityJudgeResponse = {
  results: Array<{
    emergentTags?: string[] | null;
    slug: string;
    usage: 'unused' | 'mentioned' | 'central';
  }>;
};

const entityJudgeSchema = (slugs: string[]): ZodType<EntityJudgeResponse> => {
  if (slugs.length === 0) {
    throw new Error('Entity judge requires at least one offered entity.');
  }
  return z.object({
    results: z.array(
      z.object({
        emergentTags: z.array(z.string()).nullable().optional().describe('2-4 word tags capturing new narrative themes about this entity. Recorded on the turn for later canon review; they do not steer this chronicle\'s retrieval.'),
        slug: z.enum(slugs as [string, ...string[]]).describe('The slug of the entity'),
        usage: z.enum(['unused', 'mentioned', 'central']).describe('How central this entity was to the story'),
      })
    ),
  });
};

export class EntitySelectorNode implements GraphNode {
  readonly id = 'entity-selector';

  async execute(context: GraphContext): Promise<GraphNodeDelta> {
    if (context.failure) {
      return {};
    }
    const entityContext = await buildEntityContext(context);
    return { entityContext };
  }
}

export class EntityJudgeNode extends LlmClassifierNode<EntityJudgeResponse> {
  readonly id = 'entity-judge';

  constructor() {
    super({
      applyResult: (context, result) => this.#applyEntityUsage(context, result),
      id: 'entity-judge',
      schema: (context) => entityJudgeSchema(
        (context.entityContext?.offered ?? []).map((entity) => entity.slug)
      ),
      schemaName: 'entity_judge_schema',
      shouldRun: (context) => !context.failure
        && context.gmResponse !== undefined
        && (context.entityContext?.offered.length ?? 0) > 0,
      telemetryTag: 'llm.entity-judge'
    });
  }

  #applyEntityUsage(context: GraphContext, result: EntityJudgeResponse): GraphNodeDelta {
    const usage: EntityUsageClassification[] = result.results.flatMap((entry) => {
      const source = context.entityContext?.offered.find((candidate) => candidate.slug === entry.slug);
      if (source === undefined) {
        console.warn(`No matching entity found for slug: ${entry.slug}`);
        return [];
      }
      return [{
        emergentTags: entry.emergentTags ?? null,
        entityId: source.id,
        entitySlug: entry.slug,
        tags: source.tags,
        usage: entry.usage,
      }];
    });

    const nextFocus = applyEntityUsage(context.chronicleState.chronicle.entityFocus, usage);
    const updatedChronicle = {
      ...context.chronicleState.chronicle,
      entityFocus: nextFocus,
    };

    return {
      chronicleState: {
        ...context.chronicleState,
        chronicle: updatedChronicle,
      },
      entityUsage: usage,
    };
  }
}
