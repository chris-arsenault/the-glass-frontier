import { z } from 'zod';

import { buildLoreContext } from '../../../lore/loreSelector';
import { applyLoreUsage, type LoreUsageClassification } from '../../../lore/loreFocus';
import type { GraphNode } from '../graphNode';
import type { GraphContext } from '../../../types';
import { LlmClassifierNode } from './LlmClassiferNode';

const LORE_JUDGE_SCHEMA = z.object({
  results: z.array(
    z.object({
      fragmentId: z.string().describe('The exact ID of the lore fragment being classified'),
      usage: z.enum(['unused', 'glanced', 'grounding']).describe('How the fragment was used in the GM response'),
      emergentTags: z.array(z.string()).optional().describe('2-4 word tags capturing new narrative themes (only for glanced/grounding)'),
    })
  ),
});

type LoreJudgeResponse = z.infer<typeof LORE_JUDGE_SCHEMA>;

export class LoreSelectorNode implements GraphNode {
  readonly id = 'lore-selector';

  async execute(context: GraphContext): Promise<GraphContext> {
    if (context.failure) {
      return context;
    }
    const loreContext = await buildLoreContext(context);
    return {
      ...context,
      loreContext,
    };
  }
}

export class LoreJudgeNode extends LlmClassifierNode<LoreJudgeResponse> {
  readonly id = 'lore-judge';

  constructor() {
    super({
      id: 'lore-judge',
      schema: LORE_JUDGE_SCHEMA,
      schemaName: 'lore_judge_schema',
      applyResult: (context, result) => this.#applyLoreUsage(context, result),
      shouldRun: (context) => {
        return !context.failure && Boolean(context.gmResponse) && Boolean(context.loreContext?.offered.length);
      },
      telemetryTag: 'llm.lore-judge'
    });
  }

  #applyLoreUsage(context: GraphContext, result: LoreJudgeResponse): GraphContext {
    const usage: LoreUsageClassification[] = result.results.map((entry) => {
      const source = context.loreContext?.offered.find((candidate) => candidate.id === entry.fragmentId);
      return {
        fragmentId: entry.fragmentId,
        entityId: source?.entityId ?? '',
        tags: source?.tags ?? [],
        usage: entry.usage,
        emergentTags: entry.emergentTags,
      };
    });

    const nextFocus = applyLoreUsage(context.chronicleState.chronicle.loreFocus, usage);
    const updatedChronicle = {
      ...context.chronicleState.chronicle,
      loreFocus: nextFocus,
    };

    return {
      ...context,
      chronicleState: {
        ...context.chronicleState,
        chronicle: updatedChronicle,
      },
      loreUsage: usage,
    };
  }
}
