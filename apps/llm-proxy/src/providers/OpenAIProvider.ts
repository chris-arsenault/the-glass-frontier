'use strict';

import OpenAI, { APIError } from 'openai';
import type {
  ChatCompletionCreateParams,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import { Response } from 'undici';

import { ProviderError } from './ProviderError';
import { Payload } from '../Payload';
import { BaseProvider } from './BaseProvider';

type ModelAdapter = (request: Record<string, any>, body: Record<string, any>) => void;

const MODEL_ADAPTERS: Record<string, ModelAdapter> = {
  'gpt-5-nano': (req, body) => {
    const tokens =
      typeof body.max_completion_tokens === 'number'
        ? body.max_completion_tokens
        : typeof body.max_tokens === 'number'
          ? body.max_tokens
          : undefined;
    if (tokens !== undefined) {
      req.max_completion_tokens = tokens;
    }
    delete req.max_tokens;
    delete req.temperature;
  },
  'gpt-4.1-mini': (req, body) => {
    const tokens =
      typeof body.max_completion_tokens === 'number'
        ? body.max_completion_tokens
        : typeof body.max_tokens === 'number'
          ? body.max_tokens
          : undefined;
    if (tokens !== undefined) {
      req.max_completion_tokens = tokens;
      delete req.max_tokens;
    }
  },
};

const DEFAULT_ADAPTER: ModelAdapter = (req, body) => {
  if (typeof body.max_tokens === 'number') {
    req.max_tokens = body.max_tokens;
  } else if (typeof body.max_completion_tokens === 'number') {
    req.max_tokens = body.max_completion_tokens;
  }
};

class OpenAIProvider extends BaseProvider {
  #client: OpenAI;

  constructor() {
    super();
    this.id = 'openai';
    this.aliases = ['oai', 'gpt', 'gpt-4o', 'gpt4', 'openai-chat'];
    this.supportsStreaming = true;

    this.target = process.env.OPENAI_API_BASE || 'https://api.openai.com/v1/chat/completions';
    this.apiKey = process.env.OPENAI_API_KEY || '';

    if (!this.apiKey) {
      this.valid = false;
    }

    this.headers = {
      'content-type': 'application/json',
      authorization: `Bearer ${this.apiKey}`,
      'accept-encoding': 'identity',
    };

    this.#client = new OpenAI({
      apiKey: this.apiKey || undefined,
      baseURL: process.env.OPENAI_CLIENT_BASE || process.env.OPENAI_API_BASE,
    });
  }

  preparePayload(payload: Payload): Payload {
    const sanitized = payload.sanitizePayload();
    const body = sanitized.body;

    if (!body.messages && body.prompt) {
      body.messages = [{ role: 'user', content: body.prompt }];
      delete body.prompt;
    }

    return sanitized;
  }

  async execute(payload: Payload, signal?: AbortSignal): Promise<Response> {
    const body = payload.body ?? {};
    const messages =
      body.messages ?? (body.prompt ? [{ role: 'user', content: body.prompt }] : undefined);

    if (!messages || messages.length === 0) {
      throw new ProviderError({
        code: 'openai_missing_messages',
        status: 400,
        retryable: false,
        message: 'OpenAI chat completions require at least one message.',
      });
    }

    try {
      const completion = await this.#client.chat.completions.create(
        this.#buildRequest(body, messages),
        {
          signal,
        }
      );

      return new Response(JSON.stringify(completion), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    } catch (error: any) {
      if (error instanceof APIError && error.status) {
        throw new ProviderError({
          code: error.error?.type ?? 'openai_error',
          status: error.status,
          retryable: error.status >= 500,
          details: error.error ?? {},
          message: error.error?.message ?? error.message,
        });
      }

      throw new ProviderError({
        code: 'openai_sdk_failure',
        status: 502,
        retryable: true,
        details: { message: error instanceof Error ? error.message : 'unknown' },
      });
    }
  }

  #buildRequest(
    body: Record<string, any>,
    messages: Array<{ role: string; content: string }>
  ): ChatCompletionCreateParams {
    const request: Record<string, any> = {
      model: body.model,
      messages: messages as ChatCompletionMessageParam[],
      stream: false,
    };

    if (typeof body.temperature === 'number') {
      request.temperature = body.temperature;
    }

    const adapter = MODEL_ADAPTERS[String(body.model)] ?? DEFAULT_ADAPTER;
    adapter(request, body);

    return request as ChatCompletionCreateParams;
  }
}

export { OpenAIProvider };
