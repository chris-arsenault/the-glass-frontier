import type { Chronicle, NarrativeThread } from '@glass-frontier/dto';
import { log } from '@glass-frontier/utils';

import type { GraphContext } from '../types';
import { createUpdatedCharacter } from './characterUpdater';
import { createUpdatedInventory } from './inventoryUpdater';
import { resolveLocationName } from './locationUpdater';

const applyThreadPositions = (
  threads: NarrativeThread[],
  context: GraphContext
): NarrativeThread[] => {
  const updates = new Map(
    [context.threadPositionUpdate, context.worldThreadUpdate]
      .filter((update): update is NonNullable<typeof update> => update !== undefined)
      .map((update) => [update.threadId, update.position])
  );
  if (updates.size === 0) {
    return threads;
  }
  return threads.map((thread) => {
    const position = updates.get(thread.id);
    return position === undefined
      ? thread
      : { ...thread, position, updatedAtTurn: context.turnSequence };
  });
};

const updateChronicle = (context: GraphContext, locationName: string): Chronicle => ({
  ...context.chronicleState.chronicle,
  activeScene: context.sceneWillClose ? null : context.effectiveScene,
  focusedThreadId: context.effectiveFocusedThreadId,
  localContinuity: context.localContinuityUpdate
    ?? context.chronicleState.chronicle.localContinuity,
  locationName,
  threads: applyThreadPositions(context.effectiveThreads, context),
});

/** Applies successful turn projections once, after the narration exists. */
export class ChronicleUpdater {
  update(context: GraphContext): GraphContext {
    if (context.failure) {
      return context;
    }

    log('info', 'Updating Chronicle state');
    const character = createUpdatedCharacter(context);
    const updatedCharacter = context.inventoryDelta === undefined
      || context.inventoryDelta.ops.length === 0
      ? character
      : { ...character, inventory: createUpdatedInventory({ ...context, chronicleState: {
        ...context.chronicleState,
        character,
      } }) };
    const locationName = resolveLocationName(context);
    return {
      ...context,
      chronicleState: {
        ...context.chronicleState,
        character: updatedCharacter,
        chronicle: updateChronicle(context, locationName),
        locationName,
      },
    };
  }
}
