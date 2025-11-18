import type {
  Character,
  Chronicle,
  Intent,
  LocationSummary,
  LocationPlan,
  SkillCheckPlan,
  SkillCheckResult,
  Turn,
  TranscriptEntry,
  PendingEquip,
  InventoryDelta,
  Inventory,
  ImbuedRegistry,
  LlmTrace,
  BeatDelta,
} from '@glass-frontier/dto';
import type { InventoryStoreDelta } from '@glass-frontier/persistence';

import type { PromptTemplateRuntime } from './langGraph/prompts/templateRuntime';
import {LLMRequest, LLMResponse, RetryLLMClient} from "@glass-frontier/llm-client";
import {LLMResponseFormat} from "@glass-frontier/llm-client/retryController";

export type ChronicleState = {
  chronicleId: string;
  turnSequence: number;
  chronicle: Chronicle;
  character: Character | null;
  location: LocationSummary | null;
  turns: Turn[];
}

export type GraphContext = {
  //inputs
  chronicleId: string;
  turnSequence: number;
  chronicleState: ChronicleState;
  playerMessage: TranscriptEntry;

  //operations
  llm: RetryLLMClient;
  telemetry: TelemetryLike;
  templates: PromptTemplateRuntime;
  failure: boolean;
  systemMessage?: TranscriptEntry;
  shouldUpdate: boolean;

  //stage results
  playerIntent?: Intent;
  beatDelta?: BeatDelta;
  gmResponse?: TranscriptEntry
  skillCheckPlan?: SkillCheckPlan;
  skillCheckResult?: SkillCheckResult;
  gmSummary?: string,
  shouldCloseChronicle?: boolean;
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
