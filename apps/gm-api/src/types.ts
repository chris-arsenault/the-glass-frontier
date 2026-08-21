import type { ModelConfigStore } from '@glass-frontier/app';
import type {
  BeatTracker,
  Character,
  Chronicle,
  Intent,
  LlmTrace,
  LocationEntity,
  SessionLocationChain,
  SkillCheckPlan,
  SkillCheckResult,
  TranscriptEntry,
  Turn,
} from '@glass-frontier/dto';
import type { RetryLLMClient } from '@glass-frontier/llm-client';
import type { WorldSchemaStore, LocationHelpers, ChronicleStore } from '@glass-frontier/worldstate';

import type { InventoryDelta } from './gmGraph/nodes/classifiers/InventoryDeltaNode';
import type { LocationDeltaDecision } from './gmGraph/nodes/classifiers/LocationDeltaNode';
import type { PromptTemplateRuntime } from './prompts/templateRuntime';

export type ChronicleState = {
  chronicleId: string;
  turnSequence: number;
  chronicle: Chronicle;
  character: Character;
  location: LocationEntity;
  /** Places invented during this chronicle. Session state, never canon. */
  discoveredLocations: SessionLocationChain;
  turns: Turn[];
}

export type EntityFocusState = {
  entityScores: Record<string, number>;
  tagScores: Record<string, number>;
  lastUpdated?: number;
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
  locationHelpers: LocationHelpers;
  chronicleStore: ChronicleStore;
  worldSchemaStore: WorldSchemaStore;

  //operations
  llm: RetryLLMClient;
  modelConfigStore: ModelConfigStore;
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
  executedNodes?: string[];
  handlerId?: string;
  entityContext?: EntityContextSlice;
  entityUsage?: Array<{
    entityId: string;
    entitySlug: string;
    tags: string[];
    usage: 'unused' | 'mentioned' | 'central';
    emergentTags: string[] | null;
  }>;
  worldDeltaTags?: string[];
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
