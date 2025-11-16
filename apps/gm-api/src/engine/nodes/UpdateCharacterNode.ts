import type { Turn } from '@glass-frontier/worldstate';
import { randomUUID } from 'node:crypto';

import type { GraphContext, GraphNode } from '../graphNode';

export class UpdateCharacterNode implements GraphNode {
  readonly id = 'update-character';

  execute(context: GraphContext): GraphContext {
    const characterId = context.character?.id ?? context.chronicle.characterId ?? '';
    const turn: Turn = {
      advancesTimeline: context.turnDraft.advancesTimeline ?? false,
      beatDelta: context.turnDraft.beatDelta,
      characterId,
      chronicleId: context.chronicle.id,
      createdAt: new Date().toISOString(),
      executedNodes: context.turnDraft.executedNodes,
      failure: context.turnDraft.failure ?? false,
      gmMessage: context.turnDraft.gmMessage,
      gmSummary: context.turnDraft.gmSummary,
      gmTrace: context.turnDraft.gmTrace,
      handlerId: context.turnDraft.handlerId,
      id: randomUUID(),
      inventoryDelta: context.turnDraft.inventoryDelta,
      loginId: context.chronicle.loginId,
      metadata: context.turnDraft.metadata,
      playerIntent: context.turnDraft.playerIntent,
      playerMessage: context.playerMessage,
      resolvedIntentConfidence: context.turnDraft.resolvedIntentConfidence,
      resolvedIntentType: context.turnDraft.resolvedIntentType,
      skillCheckPlan: context.turnDraft.skillCheckPlan,
      skillCheckResult: context.turnDraft.skillCheckResult,
      systemMessage: context.turnDraft.systemMessage,
      turnSequence: context.turnSequence,
      worldDeltaTags: context.turnDraft.worldDeltaTags,
    };
    return {
      ...context,
      effects: {
        ...context.effects,
        turn,
      },
      turnDraft: turn,
    };
  }
}
