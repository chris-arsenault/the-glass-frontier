'use strict';

import { log } from '@glass-frontier/utils';
import type { Response } from 'undici';
import { z } from 'zod';

import { Payload } from './Payload';
import type { BaseProvider } from './providers';
import { ProviderError, ProviderRegistry } from './providers';
import { AuditArchive } from './services/AuditArchive';
import { TokenUsageTracker } from './services/TokenUsageTracker';

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const DEFAULT_TIMEOUT_MS = 60_000;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const parseTimeoutMs = (raw: string | undefined): number => {
  if (!isNonEmptyString(raw)) {
    return DEFAULT_TIMEOUT_MS;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_TIMEOUT_MS;
};

const chatMessageSchema = z.object({
  content: z.any(),
  name: z.string().optional(),
  role: z.string(),
});

const chatCompletionInputSchema = z
  .object({
    fallbackProviders: z.array(z.string()).optional(),
    max_tokens: z.number().optional(),
    messages: z.array(chatMessageSchema).optional(),
    metadata: z.record(z.any()).optional(),
    model: z.string(),
    prompt: z.any().optional(),
    provider: z.string().optional(),
    requestId: z.string().optional(),
    stream: z.boolean().optional(),
    temperature: z.number().optional(),
  })
  .passthrough();

type ChatCompletionInput = z.infer<typeof chatCompletionInputSchema>;
type InvocationMetadata = Record<string, unknown> | undefined;

type SuccessContext = {
  metadata?: InvocationMetadata;
  playerId?: string;
  providerId: string;
  requestBody: Record<string, unknown>;
  requestContextId?: string;
  requestId: string;
  responseBody: unknown;
};

type ProviderAttemptContext = {
  attempt: number;
  providerId: string;
};

type ProviderInvocation = {
  metadata?: InvocationMetadata;
  payload: Payload;
  playerId?: string;
  providers: BaseProvider[];
  requestContextId?: string;
};

type ProviderEvaluation =
  | { kind: 'failure'; error: ProviderError }
  | { kind: 'retry'; error: ProviderError }
  | { kind: 'success'; body: unknown };
type ChoiceMessage = { message?: unknown };
type ChoiceContainer = { choices: ChoiceMessage[] };

class Router {
  readonly auditArchive: AuditArchive | null;
  readonly registry: ProviderRegistry;
  readonly timeoutMs: number;
  readonly usageTracker: TokenUsageTracker | null;

  constructor() {
    this.timeoutMs = parseTimeoutMs(process.env.LLM_PROXY_REQUEST_TIMEOUT_MS);
    this.registry = new ProviderRegistry();
    this.auditArchive = AuditArchive.fromEnv();
    this.usageTracker = TokenUsageTracker.fromEnv();
  }

  async executeProvider(provider: BaseProvider, payload: Payload): Promise<Response> {
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
    const providers = this.registry.providerOrder();

    if (providers.length === 0) {
      throw new ProviderError({
        code: 'llm_proxy_no_providers',
        retryable: false,
        status: 503,
      });
    }

    return this.invokeProviders({
      metadata,
      payload,
      playerId: context?.playerId,
      providers,
      requestContextId: context?.requestId,
    });
  }

  private async invokeProviders(invocation: ProviderInvocation): Promise<unknown> {
    return this.invokeProviderAtIndex(invocation, 0, undefined);
  }

  private async invokeProviderAtIndex(
    invocation: ProviderInvocation,
    index: number,
    lastError: ProviderError | undefined
  ): Promise<unknown> {
    if (index >= invocation.providers.length) {
      throw (
        lastError ??
        new ProviderError({
          code: 'llm_proxy_all_providers_failed',
          status: 502,
        })
      );
    }

    const provider = invocation.providers.at(index);
    if (provider === undefined) {
      return this.invokeProviderAtIndex(invocation, invocation.providers.length, lastError);
    }
    const attemptCtx: ProviderAttemptContext = {
      attempt: index + 1,
      providerId: provider.id,
    };

    const { evaluation, preparedPayload } = await this.executeProviderAttempt(
      provider,
      invocation,
      attemptCtx
    );

    if (evaluation.kind === 'success') {
      await this.handleSuccess({
        metadata: invocation.metadata,
        playerId: invocation.playerId,
        providerId: provider.id,
        requestBody: preparedPayload.body ?? {},
        requestContextId: invocation.requestContextId,
        requestId: invocation.payload.requestId,
        responseBody: evaluation.body,
      });
      return evaluation.body;
    }

    return this.invokeProviderAtIndex(invocation, index + 1, evaluation.error);
  }

  private async executeProviderAttempt(
    provider: BaseProvider,
    invocation: ProviderInvocation,
    attemptCtx: ProviderAttemptContext
  ): Promise<{ evaluation: ProviderEvaluation; preparedPayload: Payload }> {
    log('info', 'llm-proxy.provider.start', attemptCtx);
    const preparedPayload = provider.preparePayload(invocation.payload);
    log('debug', 'llm-proxy.payload.prepared', {
      ...attemptCtx,
      payload: preparedPayload.serialize(),
    });

    try {
      const response = await this.executeProvider(provider, preparedPayload);
      const evaluation = await this.evaluateResponse(response, attemptCtx);
      return { evaluation, preparedPayload };
    } catch (error: unknown) {
      const normalized = this.normalizeProviderError(error);
      log('error', 'llm-proxy.provider.failure', {
        ...attemptCtx,
        code: normalized.code,
        message: normalized.message,
      });
      return { evaluation: { error: normalized, kind: 'failure' }, preparedPayload };
    }
  }

  private async evaluateResponse(
    response: Response,
    attemptCtx: ProviderAttemptContext
  ): Promise<ProviderEvaluation> {
    if (this.isRetryable(response)) {
      await this.drain(response);
      log('warn', 'llm-proxy.provider.retryable_status', {
        ...attemptCtx,
        status: response.status,
      });
      return {
        error: new ProviderError({
          code: 'llm_proxy_retryable_status',
          retryable: true,
          status: response.status,
        }),
        kind: 'retry',
      };
    }

    const responseBody = await this.readBody(response);
    if (!response.ok) {
      return {
        error: new ProviderError({
          code: 'llm_proxy_upstream_failure',
          details: { body: responseBody },
          retryable: false,
          status: response.status,
        }),
        kind: 'failure',
      };
    }

    this.logPreview(responseBody, attemptCtx);
    log('info', 'llm-proxy.provider.success', {
      ...attemptCtx,
      status: response.status,
    });
    return { body: responseBody, kind: 'success' };
  }

  private logPreview(body: unknown, attemptCtx: ProviderAttemptContext): void {
    const preview = this.extractPreview(body);
    if (preview === null) {
      return;
    }

    log('debug', 'llm-proxy.provider.preview', {
      ...attemptCtx,
      preview,
    });
  }

  private extractPreview(body: unknown): string | null {
    const message = this.getFirstChoiceMessage(body);
    if (message === null) {
      return null;
    }

    return typeof message === 'string' ? message : JSON.stringify(message);
  }

  private getFirstChoiceMessage(body: unknown): unknown {
    if (!this.isChoiceContainer(body)) {
      return null;
    }

    const [firstChoice] = body.choices;
    if (!this.isMessageChoice(firstChoice)) {
      return null;
    }

    return firstChoice.message ?? null;
  }

  private isChoiceContainer(body: unknown): body is ChoiceContainer {
    return (
      body !== null &&
      typeof body === 'object' &&
      'choices' in body &&
      Array.isArray((body as ChoiceContainer).choices)
    );
  }

  private isMessageChoice(choice: unknown): choice is ChoiceMessage {
    return choice !== null && typeof choice === 'object' && 'message' in choice;
  }

  private normalizeProviderError(error: unknown): ProviderError {
    if (error instanceof ProviderError) {
      return error;
    }

    const message = error instanceof Error ? error.message : 'unknown';
    return new ProviderError({
      code: 'llm_proxy_provider_failure',
      details: { message },
      status: 502,
    });
  }

  private async readBody(response: Response): Promise<unknown> {
    if (response.status === 204 || response.status === 304) {
      return null;
    }

    const text = await response.text();
    if (text.length === 0) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  private async drain(response: Response): Promise<void> {
    if (response.body === null) {
      return;
    }

    try {
      await response.arrayBuffer();
    } catch {
      // Ignore body stream errors while draining.
    }
  }

  private isRetryable(response: Response): boolean {
    return RETRYABLE_STATUS.has(response.status);
  }

  private async handleSuccess(payload: SuccessContext): Promise<void> {
    const tasks: Array<Promise<unknown>> = [];

    const auditTask = this.queueAuditRecord(payload);
    if (auditTask !== null) {
      tasks.push(auditTask);
    }

    const usageTask = this.queueUsageRecord(payload);
    if (usageTask !== null) {
      tasks.push(usageTask);
    }

    if (tasks.length > 0) {
      await Promise.all(tasks);
    }
  }

  private queueAuditRecord(payload: SuccessContext): Promise<unknown> | null {
    const archive = this.auditArchive;
    if (archive === null) {
      return null;
    }

    const nodeId = this.extractNodeId(payload.metadata);
    return archive
      .record({
        id: payload.requestId,
        metadata: payload.metadata,
        nodeId,
        playerId: payload.playerId,
        providerId: payload.providerId,
        request: this.cloneForArchive(payload.requestBody),
        requestContextId: payload.requestContextId,
        response: payload.responseBody,
      })
      .catch((error) =>
        log('error', 'llm-proxy.audit.failure', {
          message: error instanceof Error ? error.message : 'unknown',
        })
      );
  }

  private queueUsageRecord(payload: SuccessContext): Promise<unknown> | null {
    const tracker = this.usageTracker;
    if (tracker === null) {
      return null;
    }

    const usage = this.extractUsage(payload.responseBody);
    if (usage === undefined) {
      return null;
    }

    const playerId = this.normalizePlayerId(payload.playerId);
    if (playerId === undefined) {
      log('warn', 'llm-proxy.usage.missing_player', {
        providerId: payload.providerId,
        requestId: payload.requestId,
      });
      return null;
    }

    return tracker.record(playerId, usage).catch((error) =>
      log('error', 'llm-proxy.usage.failure', {
        message: error instanceof Error ? error.message : 'unknown',
      })
    );
  }

  private extractUsage(response: unknown): unknown {
    if (response !== null && typeof response === 'object' && 'usage' in response) {
      return (response as { usage: unknown }).usage;
    }
    return undefined;
  }

  private extractNodeId(metadata?: Record<string, unknown>): string | undefined {
    if (metadata === undefined || metadata === null) {
      return undefined;
    }
    const nodeId = metadata.nodeId;
    return typeof nodeId === 'string' && nodeId.trim().length > 0 ? nodeId.trim() : undefined;
  }

  private extractInvocationParts(body: ChatCompletionInput): {
    metadata: InvocationMetadata;
    payloadBody: Record<string, unknown>;
  } {
    const { metadata, ...rest } = body;
    const hasObjectMetadata =
      metadata !== undefined && metadata !== null && typeof metadata === 'object' && !Array.isArray(metadata);
    if (hasObjectMetadata) {
      return {
        metadata: metadata as Record<string, unknown>,
        payloadBody: rest as Record<string, unknown>,
      };
    }

    return {
      metadata: undefined,
      payloadBody: body as Record<string, unknown>,
    };
  }

  private cloneForArchive(data: Record<string, unknown>): Record<string, unknown> {
    try {
      return JSON.parse(JSON.stringify(data));
    } catch {
      return { ...data };
    }
  }

  private normalizePlayerId(playerId?: string): string | undefined {
    if (!isNonEmptyString(playerId)) {
      return undefined;
    }
    return playerId.trim();
  }
}

export { Router, chatCompletionInputSchema, type ChatCompletionInput };
