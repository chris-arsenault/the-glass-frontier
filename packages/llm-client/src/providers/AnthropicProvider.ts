import Anthropic from '@anthropic-ai/sdk';
import * as z from 'zod';

import { ProviderError } from '../ProviderError';
import type { LLMRequest } from '../types';
import type { IProvider, ProviderResponse } from './IProvider';
import type {
  IStructuredOutputProvider,
  StructuredOutputRequest,
  StructuredOutputResponse,
} from './IStructuredOutputProvider';

const sanitizeEnv = (value?: string): string => value?.trim() ?? '';

type AnthropicMessages = {
  messages: Anthropic.Messages.MessageParam[];
  system: Anthropic.Messages.TextBlockParam[];
};

export class AnthropicProvider implements IProvider, IStructuredOutputProvider {
  readonly id = 'anthropic';
  readonly supportsStreaming = true;
  readonly supportsNativeStructuredOutput = false;
  readonly valid: boolean;
  readonly #client: Anthropic | null = null;

  constructor() {
    const apiKey = sanitizeEnv(process.env.ANTHROPIC_API_KEY);
    if (apiKey.length === 0) {
      this.valid = false;
      return;
    }
    this.#client = new Anthropic({ apiKey });
    this.valid = true;
  }

  async execute(request: LLMRequest, signal?: AbortSignal): Promise<ProviderResponse> {
    const client = this.#requireClient();
    try {
      const response = await client.messages.create(this.#mapRequest(request), { signal });
      const text = response.content.find((content) => content.type === 'text');
      return {
        output_text: text?.text ?? '',
        rawResponse: response as unknown as Record<string, unknown>,
        usage: {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
        },
      };
    } catch (error: unknown) {
      throw this.#normalizeError(error);
    }
  }

  async executeStructured<T>(
    request: StructuredOutputRequest<T>,
    signal?: AbortSignal
  ): Promise<StructuredOutputResponse<T>> {
    const client = this.#requireClient();
    try {
      const response = await client.messages.create(
        this.#mapStructuredRequest(request, z.toJSONSchema(request.schema)),
        { signal }
      );
      const toolUse = response.content.find(
        (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use'
      );
      if (toolUse === undefined) {
        throw new Error('No tool_use block in Anthropic response.');
      }
      return {
        data: request.schema.parse(toolUse.input),
        rawResponse: response as unknown as Record<string, unknown>,
        usage: {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
        },
      };
    } catch (error: unknown) {
      throw this.#normalizeError(error);
    }
  }

  #requireClient(): Anthropic {
    if (this.#client === null) {
      throw new ProviderError({
        code: 'anthropic_not_configured',
        details: { message: 'Anthropic API key not configured' },
        retryable: false,
        status: 500,
      });
    }
    return this.#client;
  }

  #mapRequest(request: LLMRequest): Anthropic.Messages.MessageCreateParamsNonStreaming {
    const { messages, system } = this.#mapMessages(request);
    return {
      max_tokens: request.max_output_tokens,
      messages,
      model: request.model,
      system,
    };
  }

  #mapStructuredRequest<T>(
    request: StructuredOutputRequest<T>,
    jsonSchema: Record<string, unknown>
  ): Anthropic.Messages.MessageCreateParamsNonStreaming {
    const { messages, system } = this.#mapMessages(request);
    const inputSchema = { ...jsonSchema, type: jsonSchema.type ?? 'object' };
    const tool: Anthropic.Messages.Tool = {
      description: `Extract structured data matching the ${request.schemaName} schema`,
      input_schema: inputSchema as Anthropic.Messages.Tool.InputSchema,
      name: request.schemaName,
    };
    return {
      max_tokens: request.max_output_tokens,
      messages,
      model: request.model,
      system,
      tool_choice: { name: request.schemaName, type: 'tool' },
      tools: [tool],
    };
  }

  #mapMessages(request: LLMRequest): AnthropicMessages {
    const system: Anthropic.Messages.TextBlockParam[] = [
      { text: request.instructions, type: 'text' },
    ];
    const messages: Anthropic.Messages.MessageParam[] = [];
    for (const entry of request.input) {
      const text = entry.content.map((content) => content.text).join('\n');
      if (entry.role === 'developer') {
        system.push({ cache_control: { type: 'ephemeral' }, text, type: 'text' });
      } else {
        messages.push({ content: [{ text, type: 'text' }], role: 'user' });
      }
    }
    return { messages, system };
  }

  #normalizeError(error: unknown): ProviderError {
    if (error instanceof Anthropic.APIError) {
      const status = typeof error.status === 'number' ? error.status : 500;
      return new ProviderError({
        code: this.#resolveApiErrorCode(error),
        details: { message: error.message },
        retryable: status >= 500,
        status,
      });
    }
    const message = error instanceof Error ? error.message : 'unknown';
    return new ProviderError({
      code: 'anthropic_sdk_failure',
      details: { message },
      retryable: true,
      status: 502,
    });
  }

  #resolveApiErrorCode(error: { error?: unknown }): string {
    const details = error.error;
    if (
      details !== null && typeof details === 'object'
      && 'type' in details && typeof details.type === 'string'
    ) {
      return details.type;
    }
    return 'anthropic_error';
  }
}
