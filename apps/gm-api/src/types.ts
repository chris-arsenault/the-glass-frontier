import type {
  BeatTracker,
  Character,
  Chronicle,
  Intent,
  HardStateProminence,
  LocationNeighbors,
  LocationPlace,
  LocationState,
  LocationSummary,
  LlmTrace,
  SkillCheckPlan,
  SkillCheckResult,
  TranscriptEntry,
  Turn,
} from '@glass-frontier/dto';
import type { WorldSchemaStore } from '@glass-frontier/worldstate';

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

export type LoreFocusState = {
  entityScores: Record<string, number>;
  tagScores: Record<string, number>;
  lastUpdated?: number;
};

export type LoreSnippet = {
  id: string;
  title: string;
  entityId: string;
  tags: string[];
  summary: string;
  score: number;
};

export type LoreContextSlice = {
  offered: LoreSnippet[];
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
  locationGraphStore: LocationStore;
  worldSchemaStore: WorldSchemaStore;

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
  loreContext?: LoreContextSlice;
  loreFocus?: LoreFocusState;
}

export type LocationStore = {
  createLocationWithRelationship: (input: {
    name: string;
    kind: string;
    description?: string | null;
    tags?: string[];
    anchorId: string;
    relationship: string;
  }) => Promise<LocationPlace>;
  getLocationDetails: (input: {
    id: string;
    minProminence?: HardStateProminence;
    maxProminence?: HardStateProminence;
    maxHops?: number;
  }) => Promise<{
    place: LocationPlace;
    neighbors: LocationNeighbors;
  }>;
  getLocationNeighbors: (input: {
    id: string;
    limit?: number;
    minProminence?: HardStateProminence;
    maxProminence?: HardStateProminence;
    maxHops?: number;
  }) => Promise<LocationNeighbors>;
  moveCharacterToLocation: (input: {
    characterId: string;
    placeId: string;
    note?: string | null;
  }) => Promise<LocationState>;
};

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
