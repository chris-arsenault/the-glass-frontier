import { z } from 'zod';
import { zodTextFormat } from 'openai/helpers/zod';

import { buildLoreContext } from '../../lore/loreSelector';
import { applyLoreUsage, type LoreUsageClassification } from '../../lore/loreFocus';
import type { GraphNode } from './graphNode';
import type { GraphContext } from '../../types';

const LORE_JUDGE_SCHEMA = z.object({
  results: z.array(
    z.object({
      fragmentId: z.string(),
      usage: z.enum(['unused', 'glanced', 'grounding']),
      emergentTags: z.array(z.string()).optional(),
    })
  ),
});

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
      loreFocus: context.chronicleState.chronicle.loreFocus ?? context.loreFocus,
    };
  }
}

export class LoreJudgeNode implements GraphNode {
  readonly id = 'lore-judge';

  async execute(context: GraphContext): Promise<GraphContext> {
    if (context.failure || !context.gmResponse || !context.loreContext?.offered.length) {
      return context;
    }
    const judgeInput = {
      fragments: context.loreContext.offered.map((frag) => ({
        id: frag.id,
        title: frag.title,
        summary: frag.summary,
        tags: frag.tags,
      })),
      gmText: context.gmResponse.content,
    };

    const json = await context.llm.generate(
      {
        max_output_tokens: 600,
        model: 'gpt-5-nano',
        instructions:
          'Classify which lore fragments influenced the GM text. For each fragment, set usage to unused, glanced, or grounding. Optionally surface emergent tags seen in the GM text.',
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: JSON.stringify(judgeInput),
              },
            ],
          },
        ],
        metadata: {
          chronicleId: context.chronicleId,
          turnId: context.turnId,
          turnSequence: context.turnSequence,
          nodeId: this.id,
          playerId: context.chronicleState.chronicle.playerId
        },
        text: {
          format: zodTextFormat(LORE_JUDGE_SCHEMA, 'lore_judge'),
          verbosity: 'low',
        },
      },
      'json'
    );

    const parsed = LORE_JUDGE_SCHEMA.safeParse(json.message);
    if (!parsed.success) {
      return context;
    }

    const usage: LoreUsageClassification[] = parsed.data.results.map((entry) => {
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
      loreFocus: nextFocus,
    };
  }
}
