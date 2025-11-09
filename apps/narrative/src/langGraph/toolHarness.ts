import { randomUUID } from "node:crypto";
import type { SessionStore } from "../services/SessionStore.js";
import type {
  CheckRequestEnvelope,
  SessionState,
  TranscriptEntry
} from "../types.js";
import type { SessionTelemetry } from "./telemetry.js";

const DEFAULT_MAX_RETRIES = 2;

class ToolHarness {
  readonly #sessionStore: SessionStore;
  readonly #telemetry?: SessionTelemetry;
  readonly #maxRetries: number;

  constructor(options: {
    sessionStore: SessionStore;
    telemetry?: SessionTelemetry;
    maxRetries?: number;
  }) {
    const { sessionStore,  telemetry, maxRetries = DEFAULT_MAX_RETRIES } = options;
    this.#sessionStore = sessionStore;
    this.#telemetry = telemetry;
    this.#maxRetries = Math.max(0, maxRetries);
  }

  loadSession(sessionId: string): SessionState {
    return this.#sessionStore.getSessionState(sessionId);
  }

  generateAuditRef({
    sessionId,
    component,
    turnSequence
  }: {
    sessionId: string;
    component: string;
    turnSequence: number;
  }): string {
    return `${component}:${sessionId}:${turnSequence}:${randomUUID()}`;
  }

  async appendPlayerMessage(sessionId: string, entry: Omit<TranscriptEntry, "id" | "timestamp">): Promise<void> {
    const transcriptEntry: TranscriptEntry = {
      ...entry,
      id: randomUUID(),
      timestamp: new Date().toISOString()
    };
    await this.#withRetries(() => {
      this.#sessionStore.appendTranscript(sessionId, transcriptEntry);
    }, { operation: "appendPlayerMessage", sessionId });
  }

  async appendGmMessage(sessionId: string, entry: Omit<TranscriptEntry, "id" | "timestamp">): Promise<void> {
    const transcriptEntry: TranscriptEntry = {
      ...entry,
      id: randomUUID(),
      timestamp: new Date().toISOString()
    };
    await this.#withRetries(() => {
      this.#sessionStore.appendTranscript(sessionId, transcriptEntry);
      this.#sessionStore.incrementTurn(sessionId);
    }, { operation: "appendGmMessage", sessionId });
  }

  async #withRetries<T>(
    execute: () => T | Promise<T>,
    details: { sessionId: string; operation: string; referenceId?: string }
  ): Promise<T> {
    let attempt = 0;
    let lastError: unknown;

    while (attempt <= this.#maxRetries) {
      try {
        // eslint-disable-next-line no-await-in-loop
        return await execute();
      } catch (error) {
        lastError = error;
        this.#telemetry?.recordToolError({
          sessionId: details.sessionId,
          operation: details.operation,
          referenceId: details.referenceId,
          attempt,
          message: error instanceof Error ? error.message : "unknown"
        });

        if (attempt === this.#maxRetries) {
          throw error;
        }

        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1)));
        attempt += 1;
      }
    }

    throw lastError instanceof Error ? lastError : new Error("tool_harness_retries_exhausted");
  }
}

export { ToolHarness };
