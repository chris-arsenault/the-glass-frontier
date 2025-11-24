import type {IntentType, TranscriptEntry,} from '@glass-frontier/dto';

import type { GraphContext } from '../../types';
import type { GraphNode } from '../orchestrator';

import {PromptComposer} from "@glass-frontier/gm-api/prompts/prompts";
import {isNonEmptyString, log} from "@glass-frontier/utils";

type HandlerOptions = {
  advancesTimeline: boolean;
  id: string;
  intentType: IntentType;
  temperature: number;
  worldDeltaTag?: string;
};

const NARRATIVE_MAX_OUTPUT_TOKENS = 2000;
const NARRATIVE_REASONING = { reasoning: { effort: 'minimal' as const } };
const NARRATIVE_VERBOSITY = 'low';
const FALLBACK_NARRATIVE_MODEL = 'gpt-5-mini';

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
  async execute(context: GraphContext): Promise<GraphContext> {
    if (!this.#isEligible(context)) {
      context.telemetry?.recordToolNotRun?.({
        chronicleId: context.chronicleId,
        operation: this.id,
      });
      return context;
    }

    try {
      const intentType = context.playerIntent?.intentType;

      let handler = this.#handlers.find(handler => handler.options.intentType === intentType);

      if (!handler) {
        log("error", `Handler not found for ${context.playerIntent?.intentType}`)
        return { ...context, failure: true };
      }
      log("info", `Using response type ${handler.id} for ${context.playerIntent?.intentType}`)
      return await handler.execute(context) || context;
    } catch (error) {
      return {...context, failure: true};
    }
  }

  #isEligible(context: GraphContext): boolean {
    if (context.failure) {
      return false;
    }
    if (context.playerIntent === undefined) {
      return false;
    }

    const utterance = context.playerMessage?.content;
    return isNonEmptyString(utterance);
  }
}

abstract class BaseIntentHandlerNode implements GraphNode {
  readonly id: string;
  readonly options: HandlerOptions;

  protected constructor(options: HandlerOptions) {
    this.options = options;
    this.id = options.id;
  }

  async execute(context: GraphContext): Promise<GraphContext> {
    if (!this.#isEligible(context)) {
      context.telemetry?.recordToolNotRun?.({
        chronicleId: context.chronicleId,
        operation: this.options.id,
      });
      return context;
    }

    try {
      const playerId = context.chronicleState.chronicle.playerId;
      let model: string;
      try {
        model = await context.modelConfigStore.getModelForCategory('prose', playerId);
      } catch (error) {
        // Fallback to default model if lookup fails
        model = FALLBACK_NARRATIVE_MODEL;
      }

      const composer = new PromptComposer(context.templates)
      const prompt = await composer.buildPrompt(this.options.id, context);
      const narration = await context.llm.generate({
        max_output_tokens: NARRATIVE_MAX_OUTPUT_TOKENS,
        model,
        ...prompt,
        metadata: {
          chronicleId: context.chronicleId,
          turnId: context.turnId,
          turnSequence: String(context.turnSequence),
          nodeId: this.options.id,
          playerId
        },
        reasoning: NARRATIVE_REASONING.reasoning,
        text: {
          format: {
            type: 'text'
          },
          verbosity: NARRATIVE_VERBOSITY
        }
      }, 'string');
      if (narration === null) {
        return {...context, failure: true};
      }

      // Clean up the response - remove "RESPONSE" heading/prefix if present
      let cleanedContent = narration.message as string;
      if (typeof cleanedContent === 'string') {
        // Remove markdown headings like "# Response" or plain "RESPONSE:" at the start
        cleanedContent = cleanedContent
          .replace(/^#+\s*Response\s*\n/i, '')  // Remove "# Response" heading
          .replace(/^RESPONSE:?\s*/i, '')        // Remove "RESPONSE:" prefix
          .trim();
      }

      const transcript: TranscriptEntry = {
        content: cleanedContent,
        id: `intent-${this.id}-${context.chronicleId}-${context.turnSequence}`,
        metadata: {
          tags: [],
          timestamp: Date.now(),
        },
        role: 'gm',
      };
      return {
        ...context,
        advancesTimeline: this.options.advancesTimeline,
        gmResponse: transcript,
        gmTrace: {
          auditId: narration.requestId,
          nodeId: this.options.id,
          requestId: narration.requestId,
        },
      };

    } catch (error) {
      console.error('[IntentHandlerNode] Narrative generation failed:', {
        nodeId: this.options.id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return {...context, failure: true};
    }
  }

  #isEligible(context: GraphContext): boolean {
    if (context.failure) {
      return false;
    }
    if (context.playerIntent === undefined) {
      return false;
    }
    const utterance = context.playerMessage?.content;
    if (!isNonEmptyString(utterance)) {
      return false;
    }
    return context.playerIntent.intentType === this.options.intentType;
  }
}

class ActionResolverNode extends BaseIntentHandlerNode {
  constructor() {
    super({
      advancesTimeline: true,
      id: 'action-resolver',
      intentType: 'action',
      temperature: 0.85,
    });
  }
}

class WrapResolverNode extends BaseIntentHandlerNode {
  constructor() {
    super({
      advancesTimeline: true,
      id: 'wrap-resolver',
      intentType: 'wrap',
      temperature: 0.85,
    });
  }
}

class InquiryResponderNode extends BaseIntentHandlerNode {
  constructor() {
    super({
      advancesTimeline: false,
      id: 'inquiry-describer',
      intentType: 'inquiry',
      temperature: 0.45,
    });
  }
}

class ClarificationResponderNode extends BaseIntentHandlerNode {
  constructor() {
    super({
      advancesTimeline: false,
      id: 'clarification-responder',
      intentType: 'clarification',
      temperature: 0.1,
    });
  }
}

class PossibilityAdvisorNode extends BaseIntentHandlerNode {
  constructor() {
    super({
      advancesTimeline: false,
      id: 'possibility-advisor',
      intentType: 'possibility',
      temperature: 0.55,
    });
  }
}

class PlanningNarratorNode extends BaseIntentHandlerNode {
  constructor() {
    super({
      advancesTimeline: true,
      id: 'planning-narrator',
      intentType: 'planning',
      temperature: 0.6,
    });
  }
}

class ReflectionWeaverNode extends BaseIntentHandlerNode {
  constructor() {
    super({
      advancesTimeline: false,
      id: 'reflection-weaver',
      intentType: 'reflection',
      temperature: 0.6,
    });
  }
}

export {
  GmResponseNode
};
