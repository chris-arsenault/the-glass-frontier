import type { IntentType, PromptTemplateId, TranscriptEntry } from '@glass-frontier/dto';
import { isLlmBudgetExceededError } from '@glass-frontier/llm-client';
import { isNonEmptyString, log } from '@glass-frontier/utils';

import { runProseAgent } from '../../proseAgent';
import type { GraphContext } from '../../types';
import type { GraphNode, GraphNodeDelta } from './graphNode';

type HandlerOptions = {
  advancesTimeline: boolean;
  id: PromptTemplateId;
  intentType: IntentType;
};

/**
 * Provider guardrails replace the narration with a stock refusal instead of
 * erroring. That text must never reach the transcript as GM prose; it becomes
 * a content_filter turn failure with a player-facing rephrase notice instead.
 */
const FILTER_MARKERS = [
  'blocked by our content filter',
  'blocked by content filter',
  'cannot assist with that request',
];

const isFilterBlockedNarration = (content: string): boolean => {
  const normalized = content.toLowerCase();
  return FILTER_MARKERS.some((marker) => normalized.includes(marker));
};

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

  /**
   * Eligibility is enforced by GmResponseNode before dispatch.
   *
   * The turn the story keeps is written by the scout-and-writer path: a scout
   * retrieves what the turn needs and briefs a writer that holds nothing but
   * the narration job. The one-shot prompt this node used to send is gone —
   * it had the whole world index and the retrieval policy in front of it and
   * wrote around them.
   */
  async execute(context: GraphContext): Promise<GraphNodeDelta> {
    try {
      const outcome = await runProseAgent(context, { agentLoop: context.agentLoop });
      const cleanedContent = this.#cleanNarration(outcome.prose);
      if (isFilterBlockedNarration(cleanedContent)) {
        return this.#filteredNarrationDelta(context);
      }
      return {
        advancesTimeline: this.options.advancesTimeline,
        gmResponse: this.#buildTranscript(context, cleanedContent),
        gmTrace: {
          auditId: outcome.requestId,
          nodeId: this.options.id,
          requestId: outcome.requestId,
        },
        proseCostUsd: outcome.costUsd,
        turnBrief: outcome.brief,
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
      return { failure: true, failureReason: 'generation_error' };
    }
  }

  #filteredNarrationDelta(context: GraphContext): GraphNodeDelta {
    log('warn', 'gm.narrative-generation-filtered', {
      chronicleId: context.chronicleId,
      nodeId: this.options.id,
      turnSequence: context.turnSequence,
    });
    return { failure: true, failureReason: 'content_filter' };
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
