import {
  Character,
  Chronicle,
  Intent,
  LocationSummary,
  LocationPlan,
  SkillCheckPlan,
  SkillCheckResult,
  Turn,
  TranscriptEntry
} from "@glass-frontier/dto";

export interface ChronicleState {
  chronicleId: string;
  turnSequence: number;
  chronicle: Chronicle;
  character: Character | null;
  location: LocationSummary | null;
  turns: Turn[];
}

export interface GraphContext {
  //inputs
  chronicleId: string;
  turnSequence: number;
  chronicle: ChronicleState;
  playerMessage: TranscriptEntry;

  //operations
  llm: LangGraphLlmLike;
  telemetry: TelemetryLike;
  failure: boolean;
  systemMessage?: TranscriptEntry;

  //stage results
  sceneFrame?: Record<string, unknown>;
  playerIntent?: Intent;
  skillCheckResult?: SkillCheckResult;
  skillCheckPlan?: SkillCheckPlan;
  gmMessage?: TranscriptEntry;
  gmSummary?: string;
  updatedCharacter?: Character | null;
  locationPlan?: LocationPlan | null;
  locationSummary?: LocationSummary | null;
}


export interface LangGraphLlmLike {
  generateText(input: Record<string, unknown>): Promise<{ text: string; provider?: string; raw?: unknown; usage?: unknown }>;
  generateJson(input: Record<string, unknown>): Promise<{ json: Record<string, unknown>; provider?: string; raw?: unknown; usage?: unknown }>;
}

export interface TelemetryLike {
  recordToolError(entry: { chronicleId: string; operation: string; referenceId?: string | null; attempt: number; message: string }): void;
  recordToolNotRun(entry: { chronicleId: string; operation: string }): void;
}
