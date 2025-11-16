import type {
  Character,
  Chronicle,
  ChronicleBeat,
  LocationSummary,
  TranscriptEntry,
  Turn,
} from '@glass-frontier/worldstate';

import type { WorldstateSession } from '../worldstateSession';

export type GraphTelemetry = {
  recordToolError?: (entry: {
    chronicleId: string;
    operation: string;
    message: string;
    attempt: number;
  }) => void;
  recordToolNotRun?: (entry: { chronicleId: string; operation: string }) => void;
};

export type GraphContext = {
  chronicleId: string;
  turnSequence: number;
  session: WorldstateSession;
  chronicle: Chronicle;
  character: Character | null;
  playerMessage: TranscriptEntry;
  beats: ChronicleBeat[];
  locationSummary: LocationSummary | null;
  turnDraft: Partial<Turn>;
  effects: Record<string, unknown>;
  failure: boolean;
  telemetry?: GraphTelemetry;
};

export type GraphNodeResult =
  | GraphContext
  | {
      context: GraphContext;
      next?: string | string[] | null;
    };

export type GraphNode = {
  readonly id: string;
  execute: (context: GraphContext) => Promise<GraphNodeResult> | GraphNodeResult;
};
