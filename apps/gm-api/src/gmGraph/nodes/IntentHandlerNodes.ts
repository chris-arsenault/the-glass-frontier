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

const NARRATIVE_MAX_OUTPUT_TOKENS = 2000
const NARRATIVE_MODEL = 'gpt-5-mini'
const NARRATIVE_REASONING = { reasoning: { effort: 'minimal' as const } };
const NARRATIVE_VERBOSITY = 'medium'

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
    this.#handlers = [actionResolverNode, inquiryResponderNode, clarificationResponderNode,
      possibilityAdvisorNode, planningNarratorNode, reflectionWeaverNode
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
      const handler = this.#handlers.find(handler => handler.options.intentType === context.playerIntent?.intentType);

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
      const composer = new PromptComposer(context.templates)
      const prompt = await composer.buildPrompt(this.options.id, context);
      const narration = await context.llm.generate({
        max_output_tokens: NARRATIVE_MAX_OUTPUT_TOKENS,
        model: NARRATIVE_MODEL,
        ...prompt,
        metadata: {chronicleId: context.chronicleId, nodeId: this.options.id},
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

      const transcript: TranscriptEntry = {
        content: narration.message,
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
      };

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
