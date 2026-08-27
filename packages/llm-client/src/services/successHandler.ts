import type { LLMRequest, LLMResponse } from '@glass-frontier/llm-client/types';
import { log } from '@glass-frontier/utils';
import type { LoggableMetadata } from '@glass-frontier/utils';

import type { AuditArchive } from './AuditArchive';
import type { ModelUsageTracker } from './ModelUsageTracker';
import type { TokenUsageTracker } from './TokenUsageTracker';

export class LLMSuccessHandler {
  readonly #auditArchive: AuditArchive | null;
  readonly #usageTracker: TokenUsageTracker | null;
  readonly #modelUsageTracker: ModelUsageTracker | null;

  constructor(options: {
    auditArchive: AuditArchive | null;
    tokenUsageTracker: TokenUsageTracker | null;
    modelUsageTracker?: ModelUsageTracker | null;
  }) {
    this.#auditArchive = options.auditArchive;
    this.#usageTracker = options.tokenUsageTracker;
    this.#modelUsageTracker = options.modelUsageTracker ?? null;
  }

  async handleSuccess(payload: LLMResponse): Promise<void> {
    const tasks: Array<Promise<unknown>> = [];

    const auditTask = this.#queueAuditRecord(payload);
    if (auditTask !== null) {
      tasks.push(auditTask);
    }

    const usageTask = this.#queueUsageRecord(payload);
    if (usageTask !== null) {
      tasks.push(usageTask);
    }

    const modelUsageTask = this.#queueModelUsageRecord(payload);
    if (modelUsageTask !== null) {
      tasks.push(modelUsageTask);
    }

    if (tasks.length > 0) {
      await Promise.all(tasks);
    }
  }

  #queueAuditRecord(payload: LLMResponse): Promise<unknown> | null {
    if (this.#auditArchive === null) {
      return null;
    }

    const metadata = payload.metadata;
    const nodeId = this.#extractNodeId(metadata);
    const playerId = this.#extractPlayerId(metadata);
    const requestContextId = this.#extractRequestContextId(metadata);
    const requestPayload = this.#normalizeRequest(payload.requestBody);
    const responsePayload = this.#normalizeResponse(payload);

    return this.#auditArchive
      .record({
        durationMs: payload.durationMs,
        id: payload.requestId,
        metadata,
        nodeId,
        playerId,
        providerId: payload.providerId,
        request: requestPayload,
        requestContextId,
        response: responsePayload,
      })
      .catch((error) =>
        log('error', 'llm-proxy.audit.failure', {
          message: error instanceof Error ? error.message : 'unknown',
        })
      );
  }

  #queueUsageRecord(payload: LLMResponse): Promise<unknown> | null {
    if (this.#usageTracker === null) {
      return null;
    }

    const usage = this.#extractUsage(payload);
    const playerId = this.#extractPlayerId(payload.metadata);
    if (playerId === undefined) {
      log('warn', 'llm-proxy.usage.missing_player', {
        providerId: payload.providerId,
        requestId: payload.requestId,
      });
      return null;
    }

    return this.#usageTracker.record(playerId, usage).catch((error) =>
      log('error', 'llm-proxy.usage.failure', {
        message: error instanceof Error ? error.message : 'unknown',
      })
    );
  }

  #queueModelUsageRecord(payload: LLMResponse): Promise<unknown> | null {
    if (this.#modelUsageTracker === null) {
      return null;
    }

    const playerId = this.#extractPlayerId(payload.metadata);
    if (playerId === undefined) {
      return null;
    }

    const usage = this.#extractUsage(payload);
    const inputTokens = usage.inputTokens;
    const outputTokens = usage.outputTokens;

    if (inputTokens === 0 && outputTokens === 0) {
      return null;
    }

    return this.#modelUsageTracker
      .record({
        inputTokens,
        modelId: payload.requestBody.model,
        outputTokens,
        playerId,
        providerId: payload.providerId,
      })
      .catch((error) =>
        log('error', 'llm-proxy.model_usage.failure', {
          message: error instanceof Error ? error.message : 'unknown',
        })
      );
  }

  #normalizeRequest(request: LLMRequest): Record<string, unknown> {
    const instructions = request.instructions;
    const messages = request.input.map((entry) => ({
      content: entry.content.map((segment) => segment.text),
      role: entry.role,
    }));
    return {
      instructions,
      messages,
    };
  }

  #normalizeResponse(payload: LLMResponse): Record<string, unknown> {
    const cloned = this.#cloneForArchive(payload.responseBody);
    const preview = this.#formatMessagePreview(payload.message);
    if (preview === null) {
      return cloned;
    }
    const choices = [
      {
        message: {
          content: [
            {
              text: preview,
              type: 'input_text',
            },
          ],
        },
      },
    ];
    return {
      ...cloned,
      choices,
    };
  }

  #formatMessagePreview(message: unknown): string | null {
    if (typeof message === 'string') {
      const trimmed = message.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
    if (message === null || message === undefined) {
      return null;
    }
    if (Array.isArray(message)) {
      const preview = message.map((part) => this.#formatPart(part)).join('\n').trim();
      return preview.length > 0 ? preview : null;
    }
    try {
      return JSON.stringify(message);
    } catch {
      return null;
    }
  }

  /** Agent-loop responses arrive as content parts; the archived `content`
   * field keeps the structured record, so the preview reads as text instead
   * of string-escaped JSON of the same parts. */
  #formatPart(part: unknown): string {
    const record = part as Record<string, unknown>;
    if (typeof record?.text === 'string') {
      return record.text;
    }
    if (record?.type === 'tool-call') {
      const input = typeof record.input === 'string'
        ? record.input
        : JSON.stringify(record.input);
      return `${String(record.toolName)}(${input})`;
    }
    try {
      return JSON.stringify(part);
    } catch {
      return String(part);
    }
  }

  #extractUsage(payload: LLMResponse): LLMResponse['usage'] {
    return payload.usage;
  }

  #extractNodeId(metadata: LoggableMetadata): string | undefined {
    const raw = metadata?.nodeId;
    if (typeof raw !== 'string') {
      return undefined;
    }
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  #extractPlayerId(metadata: LoggableMetadata): string | undefined {
    const raw = (metadata as Record<string, unknown>).playerId;
    if (typeof raw !== 'string') {
      return undefined;
    }
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  #extractRequestContextId(metadata: LoggableMetadata): string | undefined {
    const raw = metadata?.requestContextId;
    if (typeof raw !== 'string') {
      return undefined;
    }
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  #cloneForArchive(source: Record<string, unknown>): Record<string, unknown> {
    try {
      return JSON.parse(JSON.stringify(source));
    } catch {
      return { ...source };
    }
  }
}
