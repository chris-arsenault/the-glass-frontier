import { entityView, renderBlock } from '@glass-frontier/app';
import type { HardState, NarrativeThread } from '@glass-frontier/dto';
import { isNonEmptyString, log } from '@glass-frontier/utils';
import type { StoredEncyclopediaEntry } from '@glass-frontier/worldstate';

import { extractFragment } from '../../prompts/chronicleFragments';
import type { GraphContext } from '../../types';
import { ENVIRONMENT_INSTRUCTIONS } from '../../world/environmentInstructions';
import type { GraphNode, GraphNodeDelta } from './graphNode';

const MAX_OUTPUT_TOKENS = 16_000;
const WORLD_RECORD_TURNS = 3;
const CANON_NOTE_LIMIT = 8;

/** Advances one world thread at a scene boundary or explicit passage of time. */
export class EnvironmentNode implements GraphNode {
  readonly id = 'environment';

  async execute(context: GraphContext): Promise<GraphNodeDelta> {
    const thread = selectWorldThread(context.effectiveThreads);
    if (
      context.failure
      || context.gmResponse === undefined
      || thread === undefined
      || (!context.sceneBoundary && !explicitTimePassage(context))
    ) {
      return {};
    }
    try {
      const worldContent = await this.#ask(context, thread);
      log('info', 'gm.environment', {
        chronicleId: context.chronicleId,
        threadTitle: thread.title,
        turnId: context.turnId,
      });
      return {
        worldContent,
        worldThreadUpdate: { position: worldContent, threadId: thread.id },
      };
    } catch (error) {
      log('warn', 'gm.environment-failed', {
        chronicleId: context.chronicleId,
        message: error instanceof Error ? error.message : 'unknown',
        turnId: context.turnId,
      });
      return {};
    }
  }

  async #ask(context: GraphContext, thread: NarrativeThread): Promise<string> {
    const playerId = context.chronicleState.chronicle.playerId;
    const model = await context.modelConfigStore.getModelForCategory('prose', playerId);
    const response = await context.llm.generate({
      input: [{
        content: [{ text: await renderWorldInput(context, thread), type: 'input_text' }],
        role: 'user',
      }],
      instructions: ENVIRONMENT_INSTRUCTIONS,
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
      reasoningEffort: 'low',
    }, 'string');
    if (!isNonEmptyString(response.message)) {
      throw new Error('The environment returned no prose.');
    }
    return response.message.replace(/^#+\s*WORLD(?:\s+REPORT)?\s*\n/iu, '').trim();
  }
}

const explicitTimePassage = (context: GraphContext): boolean =>
  context.playerIntent?.intentType === 'planning'
  || context.playerIntent?.intentType === 'wrap';

const selectWorldThread = (threads: NarrativeThread[]): NarrativeThread | undefined =>
  threads
    .filter((thread) => thread.perspective === 'world')
    .sort((left, right) => left.updatedAtTurn - right.updatedAtTurn)[0];

const worldCanon = async (context: GraphContext, thread: NarrativeThread): Promise<string> => {
  const store = context.worldSchemaStore;
  const [location, owners] = await Promise.all([
    store.findLocationByName({ name: context.chronicleState.locationName }),
    store.findEntitiesByName({ name: thread.owner }),
  ]);
  const seen = new Set<string>();
  const entities = [location, ...owners].filter((entity): entity is HardState => {
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

const worldTexture = async (context: GraphContext): Promise<unknown> => {
  const location = await context.worldSchemaStore.findLocationByName({
    name: context.chronicleState.locationName,
  });
  if (location === null) {
    return [];
  }
  const [applicable, classifications] = await Promise.all([
    context.encyclopediaStore.listApplicable({
      terms: location.contextTags.map((tag) => ({
        scope: 'place' as const,
        tag,
        type: 'tag' as const,
      })),
    }),
    context.encyclopediaStore.listClassificationsForEntity(location.id),
  ]);
  const direct = await Promise.all(classifications.map((classification) =>
    context.encyclopediaStore.getEntry({ slug: classification.encyclopediaSlug })
  ));
  return [...new Map(
    [...direct, ...applicable.filter((entry) => entry.availability?.mode === 'contextual')]
      .filter((entry): entry is StoredEncyclopediaEntry =>
        entry !== null && entry.status === 'complete' && !entry.dm
      )
      .map((entry) => [entry.slug, entry])
  ).values()].slice(0, 12).map((entry) => ({
    affordance: entry.usage.affordances[0],
    cue: entry.usage.cues[0],
    kind: entry.kind,
    slug: `encyclopedia:${entry.slug}`,
    summary: entry.summary,
    title: entry.title,
  }));
};

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
  || (Array.isArray(value) && value.length === 0);

const renderWorldInput = async (
  context: GraphContext,
  thread: NarrativeThread
): Promise<string> => {
  const continuity = context.chronicleState.chronicle.localContinuity;
  const sections: Array<{ name: string; value: unknown }> = [
    {
      name: 'WORLD THREAD',
      value: {
        goal: thread.goal,
        owner: thread.owner,
        position: thread.position,
        title: thread.title,
      },
    },
    { name: 'WORLD CANON', value: await worldCanon(context, thread) },
    { name: 'WORLD TEXTURE', value: await worldTexture(context) },
    { name: 'LOCATION', value: await extractFragment('location', context) },
    { name: 'SCENE', value: await extractFragment('scene', context) },
    {
      name: 'LOCAL CONTINUITY',
      value: continuity?.locationName === context.chronicleState.locationName
        ? continuity.note
        : undefined,
    },
    { name: 'LAST REPLY', value: await extractFragment('last-reply', context) },
    { name: 'WORLD RECORD', value: worldRecord(context) },
  ];
  return sections
    .filter((section) => !isEmpty(section.value))
    .map((section) => `### ${section.name}\n${
      typeof section.value === 'string' ? section.value : renderBlock(section.value)
    }`)
    .join('\n\n');
};
