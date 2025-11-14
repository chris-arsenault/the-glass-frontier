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
} from '@glass-frontier/dto';
import type { InventoryStoreDelta } from '@glass-frontier/persistence';

import type { PromptTemplateRuntime } from './langGraph/prompts/templateRuntime';

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
  chronicle: ChronicleState;
  playerMessage: TranscriptEntry;
  pendingEquip: PendingEquip[];

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
  chronicleShouldClose?: boolean;
  updatedCharacter?: Character | null;
  locationPlan?: LocationPlan | null;
  locationSummary?: LocationSummary | null;
  inventoryDelta?: InventoryDelta | null;
  inventoryStoreDelta?: InventoryStoreDelta | null;
  inventoryPreview?: Inventory | null;
  inventoryRegistry?: ImbuedRegistry | null;
}

export type LangGraphLlmLike = {
  generateText: (
    input: Record<string, unknown>
  ) => Promise<{
    text: string;
    provider?: string;
    raw?: unknown;
    usage?: unknown;
    requestId: string;
  }>;
  generateJson: (
    input: Record<string, unknown>
  ) => Promise<{
    json: Record<string, unknown>;
    provider?: string;
    raw?: unknown;
    usage?: unknown;
    requestId: string;
  }>;
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
