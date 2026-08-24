import type { ModelConfigStore, PromptTemplateRuntime } from '@glass-frontier/app';
import type {
  BeatTracker,
  Character,
  Chronicle,
  ChronicleScene,
  EntityReference,
  EntityRosterEntry,
  HardStateKind,
  HardStateStatus,
  HardStateSubkind,
  Intent,
  LlmTrace,
  SceneOutcome,
  SkillCheckPlan,
  SkillCheckResult,
  TranscriptEntry,
  Turn,
} from '@glass-frontier/dto';
import type {
  LLMPlayer,
  RetryLLMClient,
  TextEmbeddingClient,
} from '@glass-frontier/llm-client';
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
  kind: HardStateKind;
  subkind?: HardStateSubkind;
  description?: string;
  status?: HardStateStatus;
  /** The entry's fact card — the small answers a reader expects up front. */
  facts: Record<string, string | number>;
  /** Private guidance for narration only. */
  gmNotes: string[];
  tags: string[];
  loreFragments: Array<{
    slug: string;
    title: string;
    summary: string;
    tags: string[];
  }>;
  score: number;
  /** A veiled shell nothing has filled in yet: a hook the GM may invent on. */
  unwritten: boolean;
};

export type EntityContextSlice = {
  candidates: EntitySnippet[];
  offered: EntitySnippet[];
  roster: EntityRosterEntry[];
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
  targetEntityIds: string[];
  chronicleStore: ChronicleStore;
  worldSchemaStore: WorldSchemaStore;

  //operations
  llm: RetryLLMClient;
  embeddings: TextEmbeddingClient;
  llmPlayer: LLMPlayer;
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
  effectiveScene: ChronicleScene | null;
  sceneOutcome: SceneOutcome;
  sceneOutcomeReason: string | null;
  shouldCloseChronicle: boolean;
  advancesTimeline: boolean;

  locationDelta?: LocationDeltaDecision;
  inventoryDelta?: InventoryDelta;
  beatTracker?: BeatTracker;
  executedNodes?: string[];
  entityContext?: EntityContextSlice;
  entityReferences?: EntityReference[];
  /** Public roster snapshot used for this turn, before any narrated transition refreshes it. */
  turnEntityRoster?: EntityRosterEntry[];
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
