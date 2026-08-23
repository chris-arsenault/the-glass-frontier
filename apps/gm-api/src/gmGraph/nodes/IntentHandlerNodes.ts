import type { IntentType, PromptTemplateId, TranscriptEntry } from '@glass-frontier/dto';
import { PromptComposer } from '@glass-frontier/gm-api/prompts/prompts';
import { isLlmBudgetExceededError } from '@glass-frontier/llm-client';
import { isNonEmptyString, log } from '@glass-frontier/utils';

import type { GraphContext } from '../../types';
import type { GraphNode, GraphNodeDelta } from './graphNode';

type HandlerOptions = {
  advancesTimeline: boolean;
  id: PromptTemplateId;
  intentType: IntentType;
};

const NARRATIVE_MAX_OUTPUT_TOKENS = 2000;
const NARRATIVE_REASONING_EFFORT = 'low';

class GmResponseNode implements GraphNode {
  readonly id: string;
  readonly #handlers: BaseIntentHandlerNode[];

  constructor() {
    this.id = 'gm-response-node';

    const actionResolverNode = new ActionResolverNode();
    const inquiryResponderNode = new InquiryResponderNode();
    const clarificationResponderNode = new ClarificationResponderNode();
    const possibilityAdvisorNode = new PossibilityAdvisorNode();
    const planningNarratorNode = new PlanningNarratorNode();
    const reflectionWeaverNode = new ReflectionWeaverNode();
    const wrapResolverNode = new WrapResolverNode();

    this.#handlers = [actionResolverNode, inquiryResponderNode, clarificationResponderNode,
      possibilityAdvisorNode, planningNarratorNode, reflectionWeaverNode, wrapResolverNode
    ];
  }
  async execute(context: GraphContext): Promise<GraphNodeDelta> {
    if (!this.#isEligible(context)) {
      context.telemetry.recordToolNotRun({
        chronicleId: context.chronicleId,
        operation: this.id,
      });
      return {};
    }

    try {
      const intentType = context.playerIntent?.intentType;
      const handler = this.#handlers.find(
        (candidate) => candidate.options.intentType === intentType
      );
      if (handler === undefined) {
        log('error', `Handler not found for ${context.playerIntent?.intentType}`);
        return { failure: true };
      }
      log('info', `Using response type ${handler.id} for ${context.playerIntent?.intentType}`);
      return handler.execute(context);
    } catch {
      return { failure: true };
    }
  }

  #isEligible(context: GraphContext): boolean {
    if (context.failure) {
      return false;
    }
    if (context.playerIntent === undefined) {
      return false;
    }

    return isNonEmptyString(context.playerMessage.content);
  }
}

abstract class BaseIntentHandlerNode implements GraphNode {
  readonly id: string;
  readonly options: HandlerOptions;

  protected constructor(options: HandlerOptions) {
    this.options = options;
    this.id = options.id;
  }

  // Eligibility is enforced by GmResponseNode before dispatch.
  async execute(context: GraphContext): Promise<GraphNodeDelta> {
    try {
      const playerId = context.chronicleState.chronicle.playerId;
      const model = await context.modelConfigStore.getModelForCategory('prose', playerId);
      const composer = new PromptComposer(context.templates);
      const prompt = await composer.buildPrompt(this.options.id, context);
      const narration = await context.llm.generate({
        maxOutputTokens: NARRATIVE_MAX_OUTPUT_TOKENS,
        model,
        ...prompt,
        metadata: {
          chronicleId: context.chronicleId,
          nodeId: this.options.id,
          playerId,
          turnId: context.turnId,
          turnSequence: String(context.turnSequence)
        },
        player: context.llmPlayer,
        reasoningEffort: NARRATIVE_REASONING_EFFORT,
      }, 'string');
      const cleanedContent = this.#cleanNarration(narration.message);
      return {
        advancesTimeline: this.options.advancesTimeline,
        gmResponse: this.#buildTranscript(context, cleanedContent),
        gmTrace: {
          auditId: narration.requestId,
          nodeId: this.options.id,
          requestId: narration.requestId,
        },
      };

    } catch (error) {
      if (isLlmBudgetExceededError(error)) {
        throw error;
      }
      log('error', 'gm.narrative-generation-failed', {
        chronicleId: context.chronicleId,
        error: error instanceof Error ? error.message : String(error),
        nodeId: this.options.id,
        stack: error instanceof Error ? (error.stack ?? '') : '',
        turnSequence: context.turnSequence,
      });
      return { failure: true };
    }
  }

  #buildTranscript(context: GraphContext, content: string): TranscriptEntry {
    return {
      content,
      id: `intent-${this.id}-${context.chronicleId}-${context.turnSequence}`,
      metadata: {
        tags: [],
        timestamp: Date.now(),
      },
      role: 'gm',
    };
  }

  #cleanNarration(message: unknown): string {
    if (typeof message !== 'string') {
      throw new Error(`Narrative response for ${this.id} was not text.`);
    }
    return message
      .replace(/^#+\s*Response\s*\n/i, '')
      .replace(/^RESPONSE:?\s*/i, '')
      .trim();
  }
}

class ActionResolverNode extends BaseIntentHandlerNode {
  constructor() {
    super({
      advancesTimeline: true,
      id: 'action-resolver',
      intentType: 'action',
    });
  }
}

class WrapResolverNode extends BaseIntentHandlerNode {
  constructor() {
    super({
      advancesTimeline: true,
      id: 'wrap-resolver',
      intentType: 'wrap',
    });
  }
}

class InquiryResponderNode extends BaseIntentHandlerNode {
  constructor() {
    super({
      advancesTimeline: false,
      id: 'inquiry-describer',
      intentType: 'inquiry',
    });
  }
}

class ClarificationResponderNode extends BaseIntentHandlerNode {
  constructor() {
    super({
      advancesTimeline: false,
      id: 'clarification-responder',
      intentType: 'clarification',
    });
  }
}

class PossibilityAdvisorNode extends BaseIntentHandlerNode {
  constructor() {
    super({
      advancesTimeline: false,
      id: 'possibility-advisor',
      intentType: 'possibility',
    });
  }
}

class PlanningNarratorNode extends BaseIntentHandlerNode {
  constructor() {
    super({
      advancesTimeline: true,
      id: 'planning-narrator',
      intentType: 'planning',
    });
  }
}

class ReflectionWeaverNode extends BaseIntentHandlerNode {
  constructor() {
    super({
      advancesTimeline: false,
      id: 'reflection-weaver',
      intentType: 'reflection',
    });
  }
}

export {
  GmResponseNode
};
