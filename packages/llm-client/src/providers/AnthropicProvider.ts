import Anthropic from '@anthropic-ai/sdk';
import * as z from 'zod';
import { IProvider, ProviderResponse } from './IProvider';
import {
  IStructuredOutputProvider,
  StructuredOutputRequest,
  StructuredOutputResponse,
} from './IStructuredOutputProvider';
import { LLMRequest } from '../types';
import { ProviderError } from '../ProviderError';

const sanitizeEnv = (value?: string): string =>
  typeof value === 'string' ? value.trim() : '';

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
    if (!this.#client) {
      console.error('[AnthropicProvider] Client not initialized - API key missing');
      throw new ProviderError({
        code: 'anthropic_not_configured',
        details: { message: 'Anthropic API key not configured' },
        retryable: false,
        status: 500,
      });
    }

    try {
      const params = this.#mapRequest(request);
      const response = await this.#client.messages.create(params);
      return this.#mapResponse(response);
    } catch (error: unknown) {
      console.error('[AnthropicProvider] Request failed');
      throw this.#normalizeError(error);
    }
  }

  #mapRequest(request: LLMRequest): Anthropic.Messages.MessageCreateParams {
    const systemMessages: Array<Anthropic.Messages.TextBlockParam> = [
      {
        type: 'text',
        text: request.instructions,
      },
    ];

    const messages: Anthropic.Messages.MessageParam[] = [];

    for (const msg of request.input) {
      if (msg.role === 'developer') {
        systemMessages.push({
          type: 'text',
          text: msg.content.map((c) => c.text).join('\n'),
          cache_control: { type: 'ephemeral' },
        });
      } else {
        messages.push({
          role: 'user',
          content: msg.content.map((c) => ({
            type: 'text',
            text: c.text,
          })),
        });
      }
    }

    return {
      model: request.model,
      system: systemMessages,
      messages,
      max_tokens: request.max_output_tokens,
    };
  }

  #mapResponse(response: Anthropic.Messages.Message): ProviderResponse {
    const textContent = response.content.find((c) => c.type === 'text');
    const outputText = textContent && textContent.type === 'text' ? textContent.text : '';

    return {
      output_text: outputText,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
      rawResponse: response as unknown as Record<string, unknown>,
    };
  }

  async executeStructured<T>(
    request: StructuredOutputRequest,
    signal?: AbortSignal
  ): Promise<StructuredOutputResponse<T>> {
    if (!this.#client) {
      console.error('[AnthropicProvider] Client not initialized - API key missing');
      throw new ProviderError({
        code: 'anthropic_not_configured',
        details: { message: 'Anthropic API key not configured' },
        retryable: false,
        status: 500,
      });
    }

    try {
      // Convert Zod schema to JSON Schema using Zod v4's static function
      const jsonSchema = z.toJSONSchema(request.schema);
      const resolvedSchema = jsonSchema;

      const params = this.#mapStructuredRequest(request, resolvedSchema as Record<string, unknown>);
      const response = await this.#client.messages.create(params);

      // Extract tool use from response
      const toolUse = response.content.find(
        (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use'
      );

      if (!toolUse) {
        throw new Error('No tool_use block in response');
      }

      // Validate against schema
      const parsed = request.schema.parse(toolUse.input);

      return {
        data: parsed as T,
        rawResponse: response as unknown as Record<string, unknown>,
        usage: {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
        },
      };
    } catch (error: unknown) {
      console.error('[AnthropicProvider] Structured request failed');
      throw this.#normalizeError(error);
    }
  }

  #mapStructuredRequest(
    request: StructuredOutputRequest,
    jsonSchema: Record<string, unknown>
  ): Anthropic.Messages.MessageCreateParams {
    const systemMessages: Array<Anthropic.Messages.TextBlockParam> = [
      {
        type: 'text',
        text: request.instructions,
      },
    ];

    const messages: Anthropic.Messages.MessageParam[] = [];

    for (const msg of request.input) {
      if (msg.role === 'developer') {
        systemMessages.push({
          type: 'text',
          text: msg.content.map((c) => c.text).join('\n'),
          cache_control: { type: 'ephemeral' },
        });
      } else {
        messages.push({
          role: 'user',
          content: msg.content.map((c) => ({
            type: 'text',
            text: c.text,
          })),
        });
      }
    }

    // Define tool with schema - using token-efficient approach
    // Ensure the schema has a type field (required by Anthropic)
    const inputSchema = {
      ...jsonSchema,
      type: jsonSchema.type || 'object',
    };

    const tool: Anthropic.Messages.Tool = {
      name: request.schemaName,
      description: `Extract structured data matching the ${request.schemaName} schema`,
      input_schema: inputSchema as Anthropic.Messages.Tool.InputSchema,
    };

    return {
      model: request.model,
      system: systemMessages,
      messages,
      max_tokens: request.max_output_tokens,
      tools: [tool],
      tool_choice: { type: 'tool', name: request.schemaName },
    };
  }

  #normalizeError(error: unknown): ProviderError {
    if (error instanceof Anthropic.APIError) {
      console.error('[AnthropicProvider] APIError details:', {
        type: error.type,
        message: error.message,
        status: error.status,
        headers: error.headers,
        error: JSON.stringify(error, null, 2),
      });
      return new ProviderError({
        code: error.type ?? 'anthropic_error',
        details: { message: error.message },
        retryable: (error.status ?? 500) >= 500,
        status: error.status ?? 500,
      });
    }

    console.error('[AnthropicProvider] Non-APIError:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      fullError: JSON.stringify(error, null, 2),
    });
    const message = error instanceof Error ? error.message : 'unknown';
    return new ProviderError({
      code: 'anthropic_sdk_failure',
      details: { message },
      retryable: true,
      status: 502,
    });
  }
}
