import { MODEL_CATALOG } from '@glass-frontier/app';
import { type Front, WorldTurn } from '@glass-frontier/dto';
import { log } from '@glass-frontier/utils';

import { buildSeedPack, renderSeedPack } from '../../proseAgent/seedPack';
import { createProseAgentTools } from '../../proseAgent/tools';
import { ToolSession } from '../../proseAgent/toolSession';
import type { GraphContext } from '../../types';
import {
  ENVIRONMENT_INSTRUCTIONS,
  FIRST_FRONT_NUDGE,
} from '../../world/environmentInstructions';
import { applyWorldTurn, visibleFronts } from '../../world/fronts';
import type { GraphNode, GraphNodeDelta } from './graphNode';

const MAX_STEPS = 4;
const MAX_OUTPUT_TOKENS = 1_500;
const REASONING_EFFORT = 'low';

/**
 * The GM's turn as the world.
 *
 * It runs before `check-planner` on purpose: the world moves, and only then is
 * the player's action planned and rolled against the situation as it now
 * stands. Placed after the roll it would write world action as consequence of
 * the player's failure, which is the reactive habit this stage exists to
 * break.
 *
 * Its failure is never the turn's failure. A world that could not be reached
 * this turn is a world that held still.
 */
export class EnvironmentNode implements GraphNode {
  readonly id = 'environment';

  async execute(context: GraphContext): Promise<GraphNodeDelta> {
    if (context.failure || context.playerIntent === undefined) {
      return {};
    }
    try {
      return await this.#run(context);
    } catch (error) {
      log('warn', 'gm.environment-failed', {
        chronicleId: context.chronicleId,
        message: error instanceof Error ? error.message : 'unknown',
        turnId: context.turnId,
      });
      return {};
    }
  }

  async #run(context: GraphContext): Promise<GraphNodeDelta> {
    const fronts = context.chronicleState.chronicle.fronts;
    const result = await this.#ask(context, fronts);
    const report = WorldTurn.parse(result.finishToolInput);
    const nextFronts = applyWorldTurn(fronts, report, context.turnSequence);
    log('info', 'gm.environment', {
      chronicleId: context.chronicleId,
      fired: report.firedFrontId ?? '',
      liveFronts: nextFronts.filter((front) => front.status === 'active').length,
      stepCount: result.stepCount,
      turnId: context.turnId,
    });
    return {
      chronicleState: {
        ...context.chronicleState,
        chronicle: { ...context.chronicleState.chronicle, fronts: nextFronts },
      },
      worldContent: report.world,
      worldFronts: nextFronts,
    };
  }

  async #ask(
    context: GraphContext,
    fronts: Front[]
  ): Promise<{ finishToolInput: unknown; stepCount: number }> {
    const pack = await buildSeedPack(context);
    const session = new ToolSession({ maxSteps: MAX_STEPS, seedEntities: pack.seedEntities });
    const playerId = context.chronicleState.chronicle.playerId;
    const modelId = await context.modelConfigStore.getModelForCategory('prose', playerId);
    const model = MODEL_CATALOG.models.find((entry) => entry.modelId === modelId);
    if (model === undefined) {
      throw new Error('The environment stage has no prose model in the catalog.');
    }
    const live = visibleFronts(fronts);
    return context.agentLoop.run({
      finishToolName: 'submit_world',
      instructions: live.length === 0
        ? `${ENVIRONMENT_INSTRUCTIONS}\n\n${FIRST_FRONT_NUDGE}`
        : ENVIRONMENT_INSTRUCTIONS,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      maxSteps: MAX_STEPS,
      // Null player message: the world is told where things stand and nothing
      // about the move the player is in the middle of making.
      messages: [{ content: renderSeedPack(pack, null), role: 'user' }],
      metadata: {
        chronicleId: context.chronicleId,
        nodeId: this.id,
        playerId,
        turnId: context.turnId,
        turnSequence: String(context.turnSequence),
      },
      model,
      player: context.llmPlayer,
      reasoningEffort: REASONING_EFFORT,
      tools: createProseAgentTools({ context, session }),
    });
  }
}
