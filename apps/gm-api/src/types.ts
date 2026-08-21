import type { ModelConfigStore, PromptTemplateRuntime } from '@glass-frontier/app';
import type {
  BeatTracker,
  Character,
  Chronicle,
  Intent,
  LlmTrace,
  SkillCheckPlan,
  SkillCheckResult,
  TranscriptEntry,
  Turn,
} from '@glass-frontier/dto';
import type { RetryLLMClient } from '@glass-frontier/llm-client';
import type { WorldSchemaStore, ChronicleStore } from '@glass-frontier/worldstate';

import type { InventoryDelta } from './gmGraph/nodes/classifiers/InventoryDeltaNode';
import type { LocationDeltaDecision } from './gmGraph/nodes/classifiers/LocationDeltaNode';

export type ChronicleState = {
  chronicleId: string;
  turnSequence: number;
  chronicle: Chronicle;
  character: Character;
  /** Where the scene is. Canon retrieval resolves matching names against the graph. */
  locationName: string;
  turns: Turn[];
}

export type EntityFocusState = {
  entityScores: Record<string, number>;
  tagScores: Record<string, number>;
};

export type EntitySnippet = {
  id: string;
  slug: string;
  name: string;
  kind: string;
  subkind?: string;
  description?: string;
  status?: string;
  tags: string[];
  loreFragments: Array<{
    slug: string;
    title: string;
    summary: string;
    tags: string[];
  }>;
  score: number;
};

export type EntityContextSlice = {
  offered: EntitySnippet[];
  focusEntities: string[];
  focusTags: string[];
};

export type GraphContext = {
  //inputs
  chronicleId: string;
  turnId: string;
  turnSequence: number;
  chronicleState: ChronicleState;
  playerMessage: TranscriptEntry;
  chronicleStore: ChronicleStore;
  worldSchemaStore: WorldSchemaStore;

  //operations
  llm: RetryLLMClient;
  modelConfigStore: ModelConfigStore;
  telemetry: TelemetryLike;
  templates: PromptTemplateRuntime;
  failure: boolean;

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
  executedNodes?: string[];
  entityContext?: EntityContextSlice;
  entityUsage?: Array<{
    entityId: string;
    entitySlug: string;
    tags: string[];
    usage: 'unused' | 'mentioned' | 'central';
    emergentTags: string[] | null;
  }>;
}

export type TelemetryLike = {
  recordToolError: (entry: {
    chronicleId: string;
    operation: string;
    referenceId?: string;
    attempt: number;
    message: string;
  }) => void;
  recordToolNotRun: (entry: { chronicleId: string; operation: string }) => void;
}
