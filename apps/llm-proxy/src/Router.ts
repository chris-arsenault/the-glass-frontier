'use strict';

import { log } from '@glass-frontier/utils/';
import { ProviderRegistry, ProviderError, BaseProvider } from './providers';
import { Payload } from './Payload.js';
import { Response } from 'undici';
import { z } from 'zod';
import { AuditArchive } from './services/AuditArchive';
import { TokenUsageTracker } from './services/TokenUsageTracker';

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

const chatMessageSchema = z.object({
  role: z.string(),
  content: z.any(),
  name: z.string().optional(),
});

const chatCompletionInputSchema = z
  .object({
    model: z.string(),
    messages: z.array(chatMessageSchema).optional(),
    prompt: z.any().optional(),
    temperature: z.number().optional(),
    max_tokens: z.number().optional(),
    stream: z.boolean().optional(),
    requestId: z.string().optional(),
    provider: z.string().optional(),
    fallbackProviders: z.array(z.string()).optional(),
    metadata: z.record(z.any()).optional(),
  })
  .passthrough();

type ChatCompletionInput = z.infer<typeof chatCompletionInputSchema>;

type InvocationMetadata = Record<string, unknown> | undefined;

type SuccessContext = {
  requestBody: Record<string, unknown>;
  responseBody: unknown;
  providerId: string;
  playerId?: string;
  requestId: string;
  requestContextId?: string;
  metadata?: InvocationMetadata;
};

class Router {
  registry: ProviderRegistry;
  timeoutMs: number;
  auditArchive: AuditArchive | null;
  usageTracker: TokenUsageTracker | null;

  constructor() {
    this.timeoutMs = Number.parseInt(process.env.LLM_PROXY_REQUEST_TIMEOUT_MS || '60000', 10);
    this.registry = new ProviderRegistry();
    this.auditArchive = AuditArchive.fromEnv();
    this.usageTracker = TokenUsageTracker.fromEnv();
  }

  async executeProvider(provider: BaseProvider, payload: Payload) {
    if (this.timeoutMs > 0 && Number.isFinite(this.timeoutMs)) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        return await provider.execute(payload, controller.signal);
      } finally {
        clearTimeout(timer);
      }
    }

    return provider.execute(payload);
  }

  async proxy(
    body: ChatCompletionInput,
    context?: { playerId?: string; requestId?: string }
  ): Promise<unknown> {
    const { metadata, payloadBody } = this.extractInvocationParts(body);
    const payload = new Payload(payloadBody);
    const sequence = this.registry.providerOrder();

    if (sequence.length === 0) {
      throw new ProviderError({
        code: 'llm_proxy_no_providers',
        status: 503,
        retryable: false,
      });
    }

    let lastError: ProviderError | undefined;

    for (let index = 0; index < sequence.length; index += 1) {
      const provider = sequence[index];
      const attempt = index + 1;
      const attemptCtx = {
        providerId: provider.id,
        attempt,
      };

      try {
        log('info', 'llm-proxy.provider.start', attemptCtx);
        const preparedPayload = provider.preparePayload(payload);
        log('info', payload.json());
        const llmResponse = await this.executeProvider(provider, preparedPayload);

        if (this.isRetryable(llmResponse)) {
          lastError = new ProviderError({
            code: 'llm_proxy_retryable_status',
            status: llmResponse.status,
            retryable: true,
          });
          await this.drain(llmResponse);
          log('warn', 'llm-proxy.provider.retryable_status', {
            ...attemptCtx,
            status: llmResponse.status,
          });
          continue;
        }

        if (!llmResponse.ok) {
          const errorBody = await this.readBody(llmResponse);
          lastError = new ProviderError({
            code: 'llm_proxy_upstream_failure',
            status: llmResponse.status,
            retryable: false,
            details: { body: errorBody },
          });
          log('error', 'llm-proxy.provider.failure_status', {
            ...attemptCtx,
            status: llmResponse.status,
          });
          continue;
        }

        const responseBody = await this.readBody(llmResponse);
        if (
          responseBody &&
          typeof responseBody === 'object' &&
          'choices' in responseBody &&
          Array.isArray((responseBody as Record<string, unknown>).choices)
        ) {
          const [firstChoice] = (responseBody as { choices: Array<{ message?: unknown }> }).choices;
          if (firstChoice?.message !== undefined) {
            const preview =
              typeof firstChoice.message === 'string'
                ? firstChoice.message
                : JSON.stringify(firstChoice.message);
            log('debug', 'llm-proxy.provider.preview', {
              preview,
            });
          }
        }
        log('info', 'llm-proxy.provider.success', {
          ...attemptCtx,
          status: llmResponse.status,
        });
        await this.handleSuccess({
          requestBody: preparedPayload.body ?? {},
          responseBody,
          providerId: provider.id,
          playerId: context?.playerId,
          requestId: payload.requestId,
          requestContextId: context?.requestId,
          metadata,
        });
        return responseBody;
      } catch (error: any) {
        log('error', 'llm-proxy.provider.failure', {
          ...attemptCtx,
          code: 'llm_proxy_provider_failure',
          message: error.message,
        });
        lastError = error;
      }
    }

    throw (
      lastError ||
      new ProviderError({
        code: 'llm_proxy_all_providers_failed',
        status: 502,
      })
    );
  }

  private async readBody(response: Response): Promise<unknown> {
    if (response.status === 204 || response.status === 304) {
      return null;
    }

    const text = await response.text();

    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch (_error) {
      return text;
    }
  }

  private async drain(response: Response) {
    if (!response.body) {
      return;
    }

    try {
      await response.arrayBuffer();
    } catch (_error) {
      // Ignore body stream errors while draining.
    }
  }

  private isRetryable(response: Response) {
    return RETRYABLE_STATUS.has(response.status);
  }

  private async handleSuccess(payload: SuccessContext): Promise<void> {
    const tasks: Array<Promise<unknown>> = [];
    log("info", `Recording LLM Audit s3: ${!!this.auditArchive}, dynamo: ${!!this.usageTracker} `)

    if (this.auditArchive) {
      const nodeId = this.extractNodeId(payload.metadata);
      tasks.push(
        this.auditArchive
          .record({
            id: payload.requestId,
            playerId: payload.playerId,
            providerId: payload.providerId,
            request: this.cloneForArchive(payload.requestBody),
            response: payload.responseBody,
            requestContextId: payload.requestContextId,
            nodeId,
            metadata: payload.metadata,
          })
          .catch((error) =>
            log('error', 'llm-proxy.audit.failure', {
              message: error instanceof Error ? error.message : 'unknown',
            })
          )
      );
    }

    if (this.usageTracker) {
      const usage = this.extractUsage(payload.responseBody);
      if (usage && payload.playerId) {
        tasks.push(
          this.usageTracker.record(payload.playerId, usage).catch((error) =>
            log('error', 'llm-proxy.usage.failure', {
              message: error instanceof Error ? error.message : 'unknown',
            })
          )
        );
      } else if (usage && !payload.playerId) {
        log('warn', 'llm-proxy.usage.missing_player', {
          requestId: payload.requestId,
          providerId: payload.providerId,
        });
      }
    }

    if (tasks.length > 0) {
      await Promise.all(tasks);
    }
  }

  private extractUsage(response: unknown): unknown {
    if (response && typeof response === 'object' && 'usage' in response) {
      return (response as { usage: unknown }).usage;
    }
    return undefined;
  }

  private extractNodeId(metadata?: Record<string, unknown>): string | undefined {
    if (!metadata) {
      return undefined;
    }
    const nodeId = metadata.nodeId;
    return typeof nodeId === 'string' && nodeId.trim() ? nodeId.trim() : undefined;
  }

  private extractInvocationParts(body: ChatCompletionInput): {
    metadata: InvocationMetadata;
    payloadBody: Record<string, unknown>;
  } {
    const metadata =
      body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
        ? (body.metadata as Record<string, unknown>)
        : undefined;

    if (!metadata) {
      return { metadata: undefined, payloadBody: body as Record<string, unknown> };
    }

    const payloadBody = { ...body } as Record<string, unknown>;
    delete payloadBody.metadata;
    return { metadata, payloadBody };
  }

  private cloneForArchive(data: Record<string, unknown>): Record<string, unknown> {
    try {
      return JSON.parse(JSON.stringify(data));
    } catch {
      return { ...data };
    }
  }
}

export { Router, chatCompletionInputSchema, type ChatCompletionInput };
