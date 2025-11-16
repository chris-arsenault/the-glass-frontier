import type { GraphContext } from '../../graphNode';
import {
  composeActionHandlerPrompt,
  composeClarificationHandlerPrompt,
  composeInquiryHandlerPrompt,
  composePlanningHandlerPrompt,
  composePossibilityHandlerPrompt,
  composeReflectionHandlerPrompt,
  type IntentHandlerPrompt,
} from '../../prompts/intentHandlers';
import type { StructuredLlmClient } from '../structuredLlmClient';
import { BaseIntentHandlerNode } from './BaseIntentHandlerNode';

class ActionIntentHandlerNode extends BaseIntentHandlerNode {
  constructor(client: StructuredLlmClient) {
    super(client, {
      advancesTimeline: true,
      id: 'action-handler',
      intentKind: 'action',
      temperature: 0.85,
      worldDeltaTag: 'action-delta',
    });
  }

  protected buildPrompt(context: GraphContext): Promise<IntentHandlerPrompt> {
    return Promise.resolve(
      composeActionHandlerPrompt({
        character: context.character,
        chronicle: context.chronicle,
        playerIntent: context.turnDraft.playerIntent!,
        playerMessage: context.playerMessage.content ?? '',
        turnSequence: context.turnSequence,
      })
    );
  }
}

class InquiryIntentHandlerNode extends BaseIntentHandlerNode {
  constructor(client: StructuredLlmClient) {
    super(client, {
      advancesTimeline: false,
      id: 'inquiry-handler',
      intentKind: 'inquiry',
      temperature: 0.45,
    });
  }

  protected buildPrompt(context: GraphContext): Promise<IntentHandlerPrompt> {
    return Promise.resolve(
      composeInquiryHandlerPrompt({
        character: context.character,
        chronicle: context.chronicle,
        playerIntent: context.turnDraft.playerIntent!,
        playerMessage: context.playerMessage.content ?? '',
        turnSequence: context.turnSequence,
      })
    );
  }
}

class ClarificationIntentHandlerNode extends BaseIntentHandlerNode {
  constructor(client: StructuredLlmClient) {
    super(client, {
      advancesTimeline: false,
      id: 'clarification-handler',
      intentKind: 'clarification',
      temperature: 0.1,
    });
  }

  protected buildPrompt(context: GraphContext): Promise<IntentHandlerPrompt> {
    return Promise.resolve(
      composeClarificationHandlerPrompt({
        character: context.character,
        chronicle: context.chronicle,
        playerIntent: context.turnDraft.playerIntent!,
        playerMessage: context.playerMessage.content ?? '',
        turnSequence: context.turnSequence,
      })
    );
  }
}

class PossibilityIntentHandlerNode extends BaseIntentHandlerNode {
  constructor(client: StructuredLlmClient) {
    super(client, {
      advancesTimeline: false,
      id: 'possibility-handler',
      intentKind: 'possibility',
      temperature: 0.55,
    });
  }

  protected buildPrompt(context: GraphContext): Promise<IntentHandlerPrompt> {
    return Promise.resolve(
      composePossibilityHandlerPrompt({
        character: context.character,
        chronicle: context.chronicle,
        playerIntent: context.turnDraft.playerIntent!,
        playerMessage: context.playerMessage.content ?? '',
        turnSequence: context.turnSequence,
      })
    );
  }
}

class PlanningIntentHandlerNode extends BaseIntentHandlerNode {
  constructor(client: StructuredLlmClient) {
    super(client, {
      advancesTimeline: true,
      id: 'planning-handler',
      intentKind: 'planning',
      temperature: 0.6,
      worldDeltaTag: 'planning-delta',
    });
  }

  protected buildPrompt(context: GraphContext): Promise<IntentHandlerPrompt> {
    return Promise.resolve(
      composePlanningHandlerPrompt({
        character: context.character,
        chronicle: context.chronicle,
        playerIntent: context.turnDraft.playerIntent!,
        playerMessage: context.playerMessage.content ?? '',
        turnSequence: context.turnSequence,
      })
    );
  }
}

class ReflectionIntentHandlerNode extends BaseIntentHandlerNode {
  constructor(client: StructuredLlmClient) {
    super(client, {
      advancesTimeline: false,
      id: 'reflection-handler',
      intentKind: 'reflection',
      temperature: 0.6,
    });
  }

  protected buildPrompt(context: GraphContext): Promise<IntentHandlerPrompt> {
    return Promise.resolve(
      composeReflectionHandlerPrompt({
        character: context.character,
        chronicle: context.chronicle,
        playerIntent: context.turnDraft.playerIntent!,
        playerMessage: context.playerMessage.content ?? '',
        turnSequence: context.turnSequence,
      })
    );
  }
}

export const createIntentHandlers = (
  client: StructuredLlmClient
): BaseIntentHandlerNode[] => [
  new ActionIntentHandlerNode(client),
  new InquiryIntentHandlerNode(client),
  new ClarificationIntentHandlerNode(client),
  new PossibilityIntentHandlerNode(client),
  new PlanningIntentHandlerNode(client),
  new ReflectionIntentHandlerNode(client),
];
