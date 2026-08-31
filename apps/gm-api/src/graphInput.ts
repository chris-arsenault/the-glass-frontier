import type { ModelConfigStore, PromptTemplateRuntime } from '@glass-frontier/app';
import type { TranscriptEntry, WorldReferenceSlug } from '@glass-frontier/dto';
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

import type { ChronicleTelemetry } from './telemetry';
import type { ChronicleState, GraphContext } from './types';

type GraphInput = {
  agentLoop: AgentLoopClient;
  chronicleId: string;
  chronicleState: ChronicleState;
  chronicleStore: ChronicleStore;
  directEncyclopediaEntries: StoredEncyclopediaEntry[];
  embeddings: TextEmbeddingClient;
  encyclopediaStore: EncyclopediaStore;
  llm: RetryLLMClient;
  llmPlayer: LLMPlayer;
  modelConfigStore: ModelConfigStore;
  playerMessage: TranscriptEntry;
  playerReferenceSlugs: WorldReferenceSlug[];
  targetEntityIds: string[];
  telemetry: ChronicleTelemetry;
  templateRuntime: PromptTemplateRuntime;
  turnId: string;
  turnSequence: number;
  worldSchemaStore: WorldSchemaStore;
};

export const buildGraphInput = (input: GraphInput): GraphContext => ({
  advancesTimeline: false,
  agentLoop: input.agentLoop,
  chronicleId: input.chronicleId,
  chronicleState: input.chronicleState,
  chronicleStore: input.chronicleStore,
  directEncyclopediaEntries: input.directEncyclopediaEntries,
  effectiveScene: input.chronicleState.chronicle.activeScene,
  embeddings: input.embeddings,
  encyclopediaStore: input.encyclopediaStore,
  failure: false,
  llm: input.llm,
  llmPlayer: input.llmPlayer,
  modelConfigStore: input.modelConfigStore,
  playerIntent: undefined,
  playerMessage: input.playerMessage,
  playerReferenceSlugs: input.playerReferenceSlugs,
  sceneOutcome: 'continue',
  sceneOutcomeReason: null,
  shouldCloseChronicle: false,
  targetEntityIds: input.targetEntityIds,
  telemetry: input.telemetry,
  templates: input.templateRuntime,
  turnId: input.turnId,
  turnSequence: input.turnSequence,
  worldSchemaStore: input.worldSchemaStore,
});
