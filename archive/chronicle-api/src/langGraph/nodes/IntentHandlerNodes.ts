import type { Intent, TranscriptEntry } from '@glass-frontier/dto';
import { randomUUID } from 'node:crypto';

import type { GraphContext } from '../../types';
import type { GraphNode, GraphNodeResult } from '../orchestrator';
import {
  composeActionResolverPrompt,
  composeClarificationResponderPrompt,
  composeInquiryResponderPrompt,
  composePlanningNarratorPrompt,
  composePossibilityAdvisorPrompt,
  composeReflectionWeaverPrompt,
  type IntentHandlerPromptComposer,
} from '../prompts/intentHandlers';

type HandlerConfig = {
  advancesTimeline: boolean;
  composer: IntentHandlerPromptComposer;
  id: string;
  intentType: NonNullable<Intent['intentType']>;
  temperature: number;
  worldDeltaTag?: string;
};

abstract class BaseIntentHandlerNode implements GraphNode {
  readonly id: HandlerConfig['id'];
  readonly #config: HandlerConfig;

  protected constructor(config: HandlerConfig) {
    this.id = config.id;
    this.#config = config;
  }

  async execute(context: GraphContext): Promise<GraphNodeResult> {
    if (!this.#isEligible(context)) {
      return context;
    }
    const prompt = await this.#config.composer({
      check: context.skillCheckPlan,
      checkResult: context.skillCheckResult,
      chronicle: context.chronicle,
      intent: context.playerIntent!,
      playerMessage: context.playerMessage.content ?? '',
      templates: context.templates,
      turnSequence: context.turnSequence,
    });
    const narration = await this.#generateNarration(context, prompt);
    if (narration === null) {
      return { ...context, failure: true };
    }

    const transcript = this.#toTranscript(context, narration.text);
    const baseTags = context.worldDeltaTags ?? [];
    const worldDeltaTags =
      this.#config.worldDeltaTag !== undefined
        ? Array.from(new Set([...baseTags, this.#config.worldDeltaTag]))
        : baseTags;

    return {
      ...context,
      advancesTimeline: this.#config.advancesTimeline,
      gmMessage: transcript,
      gmTrace: {
        auditId: narration.requestId,
        nodeId: this.id,
        requestId: narration.requestId,
      },
      handlerId: this.id,
      resolvedIntentType: this.#config.intentType,
      worldDeltaTags,
    };
  }

  #isEligible(context: GraphContext): boolean {
    if (context.failure === true) {
      return false;
    }
    if (context.playerIntent === undefined || context.playerIntent === null) {
      return false;
    }
    const utterance = context.playerMessage?.content;
    if (!isNonEmptyString(utterance)) {
      return false;
    }
    const resolvedType =
      context.resolvedIntentType ?? context.playerIntent.intentType ?? 'action';
    return resolvedType === this.#config.intentType;
  }

  async #generateNarration(
    context: GraphContext,
    prompt: string
  ): Promise<{ text: string; requestId: string } | null> {
    try {
      const requestId = this.#buildRequestId(context);
      const result = await context.llm.generateText({
        maxTokens: 650,
        metadata: { chronicleId: context.chronicleId, nodeId: this.id },
        prompt,
        requestId,
        temperature: this.#config.temperature,
      });
      const text = (result.text ?? '').trim();
      if (!isNonEmptyString(text)) {
        return null;
      }
      return { requestId: result.requestId, text };
    } catch (error) {
      context.telemetry?.recordToolError?.({
        attempt: 0,
        chronicleId: context.chronicleId,
        message: error instanceof Error ? error.message : 'unknown',
        operation: `llm.${this.id}`,
        referenceId: null,
      });
      return null;
    }
  }

  #buildRequestId(context: GraphContext): string {
    return `gm-${context.chronicleId}-${context.turnSequence}-${randomUUID()}`;
  }

  #toTranscript(context: GraphContext, narration: string): TranscriptEntry {
    return {
      content: narration,
      id: `intent-${this.id}-${context.chronicleId}-${context.turnSequence}`,
      metadata: {
        tags: [],
        timestamp: Date.now(),
      },
      role: 'gm',
    };
  }
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

class ActionResolverNode extends BaseIntentHandlerNode {
  constructor() {
    super({
      advancesTimeline: true,
      composer: composeActionResolverPrompt,
      id: 'action-resolver',
      intentType: 'action',
      temperature: 0.85,
      worldDeltaTag: 'action-delta',
    });
  }
}

class InquiryResponderNode extends BaseIntentHandlerNode {
  constructor() {
    super({
      advancesTimeline: false,
      composer: composeInquiryResponderPrompt,
      id: 'inquiry-responder',
      intentType: 'inquiry',
      temperature: 0.45,
    });
  }
}

class ClarificationResponderNode extends BaseIntentHandlerNode {
  constructor() {
    super({
      advancesTimeline: false,
      composer: composeClarificationResponderPrompt,
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
      composer: composePossibilityAdvisorPrompt,
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
      composer: composePlanningNarratorPrompt,
      id: 'planning-narrator',
      intentType: 'planning',
      temperature: 0.6,
      worldDeltaTag: 'planning-delta',
    });
  }
}

class ReflectionWeaverNode extends BaseIntentHandlerNode {
  constructor() {
    super({
      advancesTimeline: false,
      composer: composeReflectionWeaverPrompt,
      id: 'reflection-weaver',
      intentType: 'reflection',
      temperature: 0.6,
    });
  }
}

export {
  ActionResolverNode,
  ClarificationResponderNode,
  InquiryResponderNode,
  PlanningNarratorNode,
  PossibilityAdvisorNode,
  ReflectionWeaverNode,
};
