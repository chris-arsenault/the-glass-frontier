import {Attribute, Character, LocationProfile, MomentumState, RiskLevel} from "@glass-frontier/dto";
import {CheckRequestResult} from "@glass-frontier/check-request-resolver/dist/src/CheckRequestResult";

export interface TranscriptEntry {
  id: string;
  role: "player" | "gm" | "system";
  content: string;
  metadata?: Record<string, unknown>;
  playerId?: string;
  timestamp: string;
}

export interface Turn {
  gmEvent: GmEvent;
  playerEvent: PlayerEvent;
  playerMessage: TranscriptEntry;
  gmResponse: TranscriptEntry;
}

export interface GmEvent {
  turnSequence: number;                 // epoch ms
  summary: string;           // result of the prompt above
};

export interface PlayerEvent {
  turnSequence: number;
  intent: Intent;            // your existing intentSummary
  checkPlan: CheckPlan,
  checkRequest: CheckRequestResult,
};

export interface SessionState {
  sessionId: string;
  turnSequence: number;
  character?: Character;
  location?: LocationProfile;
  momentum: MomentumState;
  turns: Turn[];
}

export interface Intent {
  tone: string;
  skill: string;
  attribute: Attribute;
  requiresCheck: boolean;
  intentSummary: string;
  creativeSpark: boolean;
}

export type CheckPlan = {
  riskLevel: RiskLevel,
  advantage: string,
  rationale: string,
  complicationSeeds: string[]
}

export interface PlayerMessage {
  sessionId: string;
  playerId: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface GraphContext {
  sessionId: string;
  playerId: string;
  turnSequence: number;
  session: SessionState;
  message: { playerId: string; content: string; metadata?: Record<string, unknown> };
  sceneFrame?: Record<string, unknown>;
  intent?: Intent;
  checkRequest?: CheckRequestResult;
  checkPlan?: CheckPlan;
  narrativeEvent?: any;
  tools: ToolHarnessLike;
  llm: LangGraphLlmLike;
  telemetry?: TelemetryLike;
}

export interface ToolHarnessLike {
  appendPlayerMessage(sessionId: string, entry: Record<string, unknown>): Promise<void> | void;
  appendGmMessage(sessionId: string, entry: Record<string, unknown>): Promise<void> | void;
  loadSession(sessionId: string): SessionState;
  dispatchCheckRequest(sessionId: string, request: CheckRequestEnvelope): Promise<unknown> | unknown;
  escalateModeration(sessionId: string, alert: Record<string, unknown>): Promise<unknown> | unknown;
  generateAuditRef(options: { sessionId: string; component: string; turnSequence: number }): string;
}

export interface LangGraphLlmLike {
  generateText(input: Record<string, unknown>): Promise<{ text: string; provider?: string; raw?: unknown; usage?: unknown }>;
  generateJson(input: Record<string, unknown>): Promise<{ json: Record<string, unknown>; provider?: string; raw?: unknown; usage?: unknown }>;
}

export interface TelemetryLike {
  recordToolError(entry: { sessionId: string; operation: string; referenceId?: string | null; attempt: number; message: string }): void;
}
