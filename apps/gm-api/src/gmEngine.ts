import type { TranscriptEntry } from '@glass-frontier/worldstate';

import type { WorldstateSession, WorldstateSessionSummary } from './worldstateSession';

export type ProcessPlayerTurnOptions = {
  authorizationHeader?: string;
  chronicleId: string;
  playerMessage: TranscriptEntry;
  session: WorldstateSession;
};

export type ProcessPlayerTurnResult = {
  chronicleId: string;
  message: string;
  session: WorldstateSessionSummary;
};

export class GmEngine {
  async processPlayerTurn(options: ProcessPlayerTurnOptions): Promise<ProcessPlayerTurnResult> {
    await Promise.resolve();
    return {
      chronicleId: options.chronicleId,
      message: 'GM engine stub: turn processing not yet implemented',
      session: options.session.describe(),
    };
  }
}
