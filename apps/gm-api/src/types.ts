import type { ModelConfigStore, PromptTemplateRuntime } from '@glass-frontier/app';
import type {
  BeatTracker,
  Character,
  Chronicle,
  ChronicleScene,
  DescriptiveIdentity,
  EntityReference,
  EncyclopediaMention,
  EncyclopediaUsageRecord,
  EntityRosterEntry,
  Front,
  GmNote,
  HardStateKind,
  HardStateStatus,
  HardStateSubkind,
  Intent,
  LiveRelationship,
  LlmTrace,
  LocationDeltaDecision,
  SceneOutcome,
  SkillCheckPlan,
  SkillCheckResult,
  TranscriptEntry,
  Turn,
  TurnBrief,
  WorldReferenceSlug,
} from '@glass-frontier/dto';
import type {
  AgentLoopClient,
  LLMPlayer,
  RetryLLMClient,
  TextEmbeddingClient,
} from '@glass-frontier/llm-client';
import type {
  ChronicleStore,
  EncyclopediaStore,
  StoredEncyclopediaEntry,
  WorldSchemaStore,
} from '@glass-frontier/worldstate';

import type { InventoryDelta } from './gmGraph/nodes/classifiers/InventoryDeltaNode';
import type { SceneLedgerUpdate } from './scenes/sceneLedger';

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
  /**
   * The canon's composed prose under stable keys — `setting`, `activity`,
   * `hazards`. The summary a scene needs; absent on entities the source has not
   * resolved one for.
   */
  descriptiveIdentity?: DescriptiveIdentity;
  /** The entry's fact card — the small answers a reader expects up front. */
  facts: Record<string, string | number>;
  /** How to run this entity. Its consequence reaches the table; its wording does not. */
  gmNotes: GmNote[];
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
  playerReferenceSlugs: WorldReferenceSlug[];
  directEncyclopediaEntries: StoredEncyclopediaEntry[];
  targetEntityIds: string[];
  chronicleStore: ChronicleStore;
  encyclopediaStore: EncyclopediaStore;
  worldSchemaStore: WorldSchemaStore;

  //operations
  llm: RetryLLMClient;
  agentLoop: AgentLoopClient;
  embeddings: TextEmbeddingClient;
  llmPlayer: LLMPlayer;
  modelConfigStore: ModelConfigStore;
  telemetry: TelemetryLike;
  templates: PromptTemplateRuntime;
  failure: boolean;
  /** Why the turn failed, when it did: drives the player-facing notice. */
  failureReason?: 'content_filter' | 'generation_error';
  /** This turn's scene working-memory report, merged into the chronicle. */
  sceneLedgerUpdate?: SceneLedgerUpdate;

  //stage results
  playerIntent?: Intent;
  gmResponse?: TranscriptEntry
  skillCheckPlan?: SkillCheckPlan;
  skillCheckResult?: SkillCheckResult;
  gmSummary?: string,
  gmTrace?: LlmTrace | null;
  /** USD cost of the canonical narration call, for the evaluation cost display. */
  proseCostUsd?: number;
  /** What the scout found for this turn: material, who is present, scene read. */
  turnBrief?: TurnBrief;
  /** What the world did this turn, decided before the check was planned. */
  worldContent?: string;
  /** The world's agendas as this turn left them. */
  worldFronts?: Front[];
  effectiveScene: ChronicleScene | null;
  /** How far the turn judge says this turn moved the scene, 0 to 3. */
  sceneClockSegments?: number;
  sceneOutcome: SceneOutcome;
  sceneOutcomeReason: string | null;
  shouldCloseChronicle: boolean;
  advancesTimeline: boolean;

  locationDelta?: LocationDeltaDecision;
  inventoryDelta?: InventoryDelta;
  beatTracker?: BeatTracker;
  executedNodes?: string[];
  entityContext?: EntityContextSlice;
  encyclopediaContext?: StoredEncyclopediaEntry[];
  /** Live canon edges among `entityContext.offered`, for the RELATIONSHIPS block. */
  entityRelationships?: LiveRelationship[];
  entityReferences?: EntityReference[];
  referenceMentions?: EncyclopediaMention[];
  referenceUsage?: EncyclopediaUsageRecord[];
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
