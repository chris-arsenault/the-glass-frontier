import type {
  Character,
  Chronicle,
  ChronicleBeat,
  LocationSummary,
  TranscriptEntry,
  Turn,
} from '@glass-frontier/worldstate';

import type { WorldstateSession } from '../worldstateSession';
import {GraphContext} from "../../types";

export type GraphTelemetry = {
  recordToolError?: (entry: {
    chronicleId: string;
    operation: string;
    message: string;
    attempt: number;
  }) => void;
  recordToolNotRun?: (entry: { chronicleId: string; operation: string }) => void;
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