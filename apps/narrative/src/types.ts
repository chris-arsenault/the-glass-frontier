import {
  Character,
  Intent,
  LocationProfile,
  SessionRecord,
  SkillCheckPlan,
  SkillCheckResult,
  Turn,
  TranscriptEntry
} from "@glass-frontier/dto";


export interface SessionState {
  sessionId: string;
  turnSequence: number;
  session: SessionRecord;
  character: Character | null;
  location: LocationProfile | null;
  turns: Turn[];
}

export interface GraphContext {
  //inputs
  sessionId: string;
  turnSequence: number;
  session: SessionState;
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
}


export interface LangGraphLlmLike {
  generateText(input: Record<string, unknown>): Promise<{ text: string; provider?: string; raw?: unknown; usage?: unknown }>;
  generateJson(input: Record<string, unknown>): Promise<{ json: Record<string, unknown>; provider?: string; raw?: unknown; usage?: unknown }>;
}

export interface TelemetryLike {
  recordToolError(entry: { sessionId: string; operation: string; referenceId?: string | null; attempt: number; message: string }): void;
  recordToolNotRun(entry: { sessionId: string; operation: string }): void;
}
