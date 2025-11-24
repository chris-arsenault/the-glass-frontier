import { z } from 'zod';

import { buildEntityContext } from '../../../entity/entitySelector';
import { applyEntityUsage, type EntityUsageClassification } from '../../../entity/entityFocus';
import type { GraphNode } from '../graphNode';
import type { GraphContext } from '../../../types';
import { LlmClassifierNode } from './LlmClassiferNode';

const ENTITY_JUDGE_SCHEMA = z.object({
  results: z.array(
    z.object({
      slug: z.string().describe('The slug of the entity'),
      usage: z.enum(['unused', 'mentioned', 'central']).describe('How central this entity was to the story'),
      emergentTags: z.array(z.string()).nullable().optional().describe('2-4 word tags capturing new narrative themes about this entity'),
    })
  ),
});

type EntityJudgeResponse = z.infer<typeof ENTITY_JUDGE_SCHEMA>;

export class EntitySelectorNode implements GraphNode {
  readonly id = 'entity-selector';

  async execute(context: GraphContext): Promise<GraphContext> {
    if (context.failure) {
      return context;
    }
    const entityContext = await buildEntityContext(context);
    console.log('Entity context:', entityContext);
    return {
      ...context,
      entityContext,
    };
  }
}

export class EntityJudgeNode extends LlmClassifierNode<EntityJudgeResponse> {
  readonly id = 'entity-judge';

  constructor() {
    super({
      id: 'entity-judge',
      schema: ENTITY_JUDGE_SCHEMA,
      schemaName: 'entity_judge_schema',
      applyResult: (context, result) => this.#applyEntityUsage(context, result),
      shouldRun: (context) => {
        return !context.failure && Boolean(context.gmResponse) && Boolean(context.entityContext?.offered.length);
      },
      telemetryTag: 'llm.entity-judge'
    });
  }

  #applyEntityUsage(context: GraphContext, result: EntityJudgeResponse): GraphContext {
    console.log('LLM returned entity slugs:', result.results.map(r => r.slug));
    console.log('Offered entity slugs:', context.entityContext?.offered.map(o => o.slug));

    const usage: EntityUsageClassification[] = result.results.map((entry) => {
      const source = context.entityContext?.offered.find((candidate) => candidate.slug === entry.slug);
      if (!source) {
        console.warn(`No matching entity found for slug: ${entry.slug}`);
      }
      return {
        entityId: source?.id ?? '',
        entitySlug: entry.slug,
        tags: source?.tags ?? [],
        usage: entry.usage,
        emergentTags: entry.emergentTags,
      };
    });

    const nextFocus = applyEntityUsage(context.chronicleState.chronicle.entityFocus, usage);
    const updatedChronicle = {
      ...context.chronicleState.chronicle,
      entityFocus: nextFocus,
    };

    return {
      ...context,
      chronicleState: {
        ...context.chronicleState,
        chronicle: updatedChronicle,
      },
      entityUsage: usage,
    };
  }
}
