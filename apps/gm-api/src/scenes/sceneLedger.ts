import {
  SCENE_LEDGER_INTERACTION_CAP,
  SCENE_LEDGER_PRESENCE_CAP,
  SceneLedgerPlace,
  SceneLedgerPresence,
  type SceneLedger,
} from '@glass-frontier/dto';
import { z } from 'zod';

/**
 * What the ledger classifier reports each turn. Place and present are the
 * classifier's full current understanding and replace what was stored;
 * interactions are only this turn's additions and accumulate.
 */
export const SceneLedgerUpdateSchema = z.object({
  interactions: z
    .array(z.string().min(1))
    .describe('Notable interactions from this turn, each one compact past-tense sentence.'),
  place: SceneLedgerPlace.nullable().describe(
    'The full current understanding of where the scene is set, restated every turn.'
  ),
  present: z
    .array(SceneLedgerPresence)
    .describe('Everyone and everything notable currently in the scene, restated every turn.'),
});
export type SceneLedgerUpdate = z.infer<typeof SceneLedgerUpdateSchema>;

export const mergeSceneLedger = (
  current: SceneLedger | null,
  update: SceneLedgerUpdate,
  turnSequence: number
): SceneLedger => ({
  interactions: [...(current?.interactions ?? []), ...update.interactions].slice(
    -SCENE_LEDGER_INTERACTION_CAP
  ),
  place: update.place ?? current?.place ?? null,
  present:
    update.present.length > 0
      ? update.present.slice(0, SCENE_LEDGER_PRESENCE_CAP)
      : current?.present ?? [],
  updatedAtTurn: turnSequence,
});
