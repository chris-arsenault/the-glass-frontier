import { z } from 'zod';

import { composeSkillDetectorPrompt } from '../../prompts';
import type { StructuredLlmClient } from '../structuredLlmClient';
import { LlmClassifierNode } from './LlmClassifierNode';

const SkillDetectorResultSchema = z.object({
  attribute: z.string().optional(),
  requiresCheck: z.boolean().optional(),
  skill: z.string().optional(),
});

type SkillDetectorResult = z.infer<typeof SkillDetectorResultSchema>;

export class SkillDetectorNode extends LlmClassifierNode<SkillDetectorResult> {
  constructor(client: StructuredLlmClient) {
    super(client, {
      applyResult: (context, result) => {
        const intent = context.turnDraft.playerIntent;
        if (intent === undefined) {
          return { ...context, failure: true };
        }
        return {
          ...context,
          turnDraft: {
            ...context.turnDraft,
            playerIntent: {
              ...intent,
              attribute: result.attribute ?? intent.attribute,
              requiresCheck:
                typeof result.requiresCheck === 'boolean'
                  ? result.requiresCheck
                  : intent.requiresCheck,
              skill: result.skill ?? intent.skill,
            },
          },
        };
      },
      buildPrompt: (context) =>
        composeSkillDetectorPrompt({
          character: context.character,
          chronicle: context.chronicle,
          intentSummary: context.turnDraft.playerIntent?.summary ?? '',
          playerMessage: context.playerMessage.content ?? '',
        }),
      id: 'skill-detector',
      schema: SkillDetectorResultSchema,
      telemetryTag: 'llm.skill-detector',
    });
  }
}
