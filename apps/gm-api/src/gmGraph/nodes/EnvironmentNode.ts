import { entityView, renderBlock } from '@glass-frontier/app';
import type { Front, HardState } from '@glass-frontier/dto';
import { WorldTurn } from '@glass-frontier/dto';
import { isNonEmptyString, log } from '@glass-frontier/utils';

import { extractFragment } from '../../prompts/chronicleFragments';
import type { GraphContext } from '../../types';
import {
  ENVIRONMENT_INSTRUCTIONS,
  FIRST_FRONT_NUDGE,
} from '../../world/environmentInstructions';
import { applyWorldTurn, visibleFronts } from '../../world/fronts';
import type { GraphNode, GraphNodeDelta } from './graphNode';

const MAX_OUTPUT_TOKENS = 1_500;
const REASONING_EFFORT = 'low';
/** The world's own prior lines; three turns of record is continuity enough. */
const WORLD_RECORD_TURNS = 3;
/** Every note an entity publishes — the notes are the front material. */
const CANON_NOTE_LIMIT = 8;

/**
 * The GM's turn as the world.
 *
 * One structured call on the prose model, fed a player-free view of the turn:
 * the fronts, the canon of the place and the front agents (pre-fetched — the
 * stage knows exactly which entities matter, so it holds no tools), the last
 * narration, and its own prior record. The player's message, intent, sheet,
 * and check never enter, so the world cannot complete the player's action —
 * the failure this stage kept producing when it read the full seed pack.
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
    const report = await vetProposal(context, await this.#ask(context, fronts));
    const nextFronts = applyWorldTurn(fronts, report, context.turnSequence);
    log('info', 'gm.environment', {
      chronicleId: context.chronicleId,
      fired: report.firedFrontId ?? '',
      liveFronts: nextFronts.filter((front) => front.status === 'active').length,
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

  async #ask(context: GraphContext, fronts: Front[]): Promise<WorldTurn> {
    const live = visibleFronts(fronts);
    const playerId = context.chronicleState.chronicle.playerId;
    const model = await context.modelConfigStore.getModelForCategory('prose', playerId);
    const response = await context.llm.generateStructured(
      {
        input: [{
          content: [{ text: await renderWorldInput(context, live), type: 'input_text' }],
          role: 'user',
        }],
        instructions: live.length === 0
          ? `${ENVIRONMENT_INSTRUCTIONS}\n\n${FIRST_FRONT_NUDGE}`
          : ENVIRONMENT_INSTRUCTIONS,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
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
      },
      WorldTurn,
      'world_turn_schema'
    );
    return response.data;
  }
}

/**
 * A proposal is only as real as its agent. The schema asks for a canon slug,
 * but the first front this stage ever proposed named the player character —
 * not canon, not the world's to run. An agent that does not resolve to a
 * visible canon entity drops the proposal; the fronts already running are
 * untouched.
 */
const vetProposal = async (context: GraphContext, report: WorldTurn): Promise<WorldTurn> => {
  if (report.proposal === null) {
    return report;
  }
  const agent = await context.worldSchemaStore.getEntityBySlug({
    slug: report.proposal.agentSlug,
  });
  if (agent !== null && !agent.dm) {
    return report;
  }
  log('warn', 'gm.environment.proposal-dropped', {
    agentSlug: report.proposal.agentSlug,
    chronicleId: context.chronicleId,
    turnId: context.turnId,
  });
  return { ...report, proposal: null };
};

/** The canon this turn's world move can draw on: the place and the front agents. */
const worldCanon = async (context: GraphContext, fronts: Front[]): Promise<string> => {
  const store = context.worldSchemaStore;
  const [location, agents] = await Promise.all([
    store.findLocationByName({ name: context.chronicleState.locationName }),
    Promise.all(fronts.map((front) => store.getEntityBySlug({ slug: front.agentSlug }))),
  ]);
  const seen = new Set<string>();
  const entities = [location, ...agents].filter((entity): entity is HardState => {
    if (entity === null || entity.dm || seen.has(entity.id)) {
      return false;
    }
    seen.add(entity.id);
    return true;
  });
  return entities
    .map((entity) => renderBlock(entityView(entity, [], { noteLimit: CANON_NOTE_LIMIT })))
    .join('\n\n');
};

/** The ledger's present figures without the player: the world's own cast. */
const npcPresent = (context: GraphContext): unknown => {
  const ledger = context.chronicleState.chronicle.sceneLedger;
  if (ledger === null || ledger === undefined) {
    return undefined;
  }
  const characterName = context.chronicleState.character.name.trim().toLowerCase();
  const others = ledger.present.filter(
    (entry) => !characterName.startsWith(entry.name.trim().toLowerCase())
      && !entry.name.trim().toLowerCase().startsWith(characterName)
  );
  return others.length === 0 ? undefined : others;
};

/** The world's own prior lines, oldest first, as a record to continue. */
const worldRecord = (context: GraphContext): string | undefined => {
  const lines = context.chronicleState.turns
    .slice(-WORLD_RECORD_TURNS)
    .flatMap((turn) => isNonEmptyString(turn.worldContent)
      ? [`Turn ${turn.turnSequence}: ${turn.worldContent}`]
      : []);
  return lines.length === 0 ? undefined : lines.join('\n');
};

const isEmpty = (value: unknown): boolean =>
  value === undefined
  || value === null
  || (typeof value === 'string' && value.trim().length === 0)
  || (typeof value === 'object' && value !== null && Object.values(value).every(
    (inner) => inner === undefined || inner === null
  ));

/** The player-free view of the turn; the instructions name these blocks. */
const renderWorldInput = async (context: GraphContext, fronts: Front[]): Promise<string> => {
  const sections: Array<{ name: string; value: unknown }> = [
    { name: 'FRONTS', value: await extractFragment('fronts', context) },
    { name: 'WORLD-CANON', value: await worldCanon(context, fronts) },
    { name: 'LOCATION', value: await extractFragment('location', context) },
    { name: 'SCENE', value: await extractFragment('scene', context) },
    { name: 'PRESENT', value: npcPresent(context) },
    { name: 'LAST-REPLY', value: await extractFragment('last-reply', context) },
    { name: 'WORLD-RECORD', value: worldRecord(context) },
  ];
  return sections
    .filter((section) => !isEmpty(section.value))
    .map((section) => `### ${section.name}\n${
      typeof section.value === 'string' ? section.value : renderBlock(section.value)
    }`)
    .join('\n\n');
};
