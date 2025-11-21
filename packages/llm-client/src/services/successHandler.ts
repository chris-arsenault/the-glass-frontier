import { log } from '@glass-frontier/utils';
import type { LoggableMetadata } from '@glass-frontier/utils';
import type { LLMRequest, LLMResponse } from '@glass-frontier/llm-client/types';

import { AuditArchive } from './AuditArchive';
import { TokenUsageTracker } from './TokenUsageTracker';

export class LLMSuccessHandler {
  #auditArchive: AuditArchive | null;
  #usageTracker: TokenUsageTracker | null;

  constructor(options: { auditArchive: AuditArchive | null; tokenUsageTracker: TokenUsageTracker | null }) {
    this.#auditArchive = options.auditArchive;
    this.#usageTracker = options.tokenUsageTracker;
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
    if (usage === undefined) {
      return null;
    }

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
              type: 'text',
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
    try {
      return JSON.stringify(message);
    } catch {
      return null;
    }
  }

  #extractUsage(payload: LLMResponse): Record<string, unknown> | undefined {
    if (payload.usage && Object.keys(payload.usage).length > 0) {
      return payload.usage;
    }
    const bodyUsage = (payload.responseBody as { usage?: Record<string, unknown> }).usage;
    if (bodyUsage && Object.keys(bodyUsage).length > 0) {
      return bodyUsage;
    }
    return undefined;
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
