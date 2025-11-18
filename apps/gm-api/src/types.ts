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
import {LLMRequest, LLMResponse} from "@glass-frontier/llm-client";
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
  llm: LangGraphLlmLike;
  telemetry: TelemetryLike;
  templates: PromptTemplateRuntime;
  failure: boolean;
  systemMessage?: TranscriptEntry;

  //stage results
  sceneFrame?: Record<string, unknown>;
  playerIntent?: Intent;
  skillCheckResult?: SkillCheckResult;
  skillCheckPlan?: SkillCheckPlan;
  gmMessage?: TranscriptEntry;
  gmSummary?: string;
  gmTrace?: LlmTrace | null;
  handlerId?: string;
  chronicleShouldClose?: boolean;
  updatedCharacter?: Character | null;
  locationPlan?: LocationPlan | null;
  locationSummary?: LocationSummary | null;
  inventoryDelta?: InventoryDelta | null;
  inventoryStoreDelta?: InventoryStoreDelta | null;
  inventoryPreview?: Inventory | null;
  inventoryRegistry?: ImbuedRegistry | null;
  beatDelta?: BeatDelta | null;
  advancesTimeline?: boolean;
  executedNodes?: string[];
  worldDeltaTags?: string[];
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
