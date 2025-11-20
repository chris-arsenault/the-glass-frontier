import type {
  BeatTracker,
  Character,
  Chronicle,
  Intent,
  LocationSummary,
  LlmTrace,
  SkillCheckPlan,
  SkillCheckResult,
  TranscriptEntry,
  Turn,
} from '@glass-frontier/dto';
import type { LocationGraphStore} from '@glass-frontier/persistence';

import type { PromptTemplateRuntime } from './prompts/templateRuntime';
import { RetryLLMClient} from "@glass-frontier/llm-client";
import {LocationDeltaDecision} from "./gmGraph/nodes/classifiers/LocationDeltaNode";
import {InventoryDelta} from "./gmGraph/nodes/classifiers/InventoryDeltaNode";

export type ChronicleState = {
  chronicleId: string;
  turnSequence: number;
  chronicle: Chronicle;
  character: Character;
  location: LocationSummary;
  turns: Turn[];
}

export type GraphContext = {
  //inputs
  chronicleId: string;
  turnSequence: number;
  chronicleState: ChronicleState;
  playerMessage: TranscriptEntry;
  locationGraphStore: LocationGraphStore;

  //operations
  llm: RetryLLMClient;
  telemetry: TelemetryLike;
  templates: PromptTemplateRuntime;
  failure: boolean;
  systemMessage?: TranscriptEntry;
  shouldUpdate: boolean;

  //stage results
  playerIntent?: Intent;
  gmResponse?: TranscriptEntry
  skillCheckPlan?: SkillCheckPlan;
  skillCheckResult?: SkillCheckResult;
  gmSummary?: string,
  gmTrace?: LlmTrace | null;
  shouldCloseChronicle: boolean;
  advancesTimeline: boolean;

  locationDelta?: LocationDeltaDecision;
  inventoryDelta?: InventoryDelta;
  beatTracker?: BeatTracker;
}

export type TelemetryLike = {
  recordToolError: (entry: {
    chronicleId: string;
    operation: string;
    referenceId?: string | null;
    attempt: number;
    message: string;
  }) => void;
  recordToolNotRun: (entry: { chronicleId: string; operation: string }) => void;
}
