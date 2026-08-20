import {
  BedrockRuntimeClient,
  ConverseCommand,
  InvokeModelCommand,
  type ConverseCommandInput,
  type ConverseCommandOutput,
} from '@aws-sdk/client-bedrock-runtime';
import * as z from 'zod';

import { ProviderError } from '../ProviderError';
import type { LLMRequest } from '../types';
import type { IProvider, ProviderResponse } from './IProvider';
import type {
  IStructuredOutputProvider,
  StructuredOutputRequest,
  StructuredOutputResponse,
} from './IStructuredOutputProvider';

type NovaResponse = {
  output: { message: { content: Array<{ text: string }> } };
  usage: { inputTokens: number; outputTokens: number };
};

type JsonDocument = null | boolean | number | string | JsonDocument[] | {
  [key: string]: JsonDocument;
};

const toJsonDocument = (value: unknown): JsonDocument => {
  if (
    value === null
    || typeof value === 'boolean'
    || typeof value === 'number'
    || typeof value === 'string'
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(toJsonDocument);
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, toJsonDocument(entry)])
    );
  }
  throw new Error('Structured-output schema contains a non-JSON value.');
};

const isNovaResponse = (value: unknown): value is NovaResponse => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const response = value as Record<string, unknown>;
  return typeof response.output === 'object' && response.output !== null
    && typeof response.usage === 'object' && response.usage !== null;
};

export class BedrockProvider implements IProvider, IStructuredOutputProvider {
  readonly id = 'bedrock';
  readonly supportsStreaming = false;
  readonly supportsNativeStructuredOutput = false;
  readonly valid = true;
  readonly #client: BedrockRuntimeClient;

  constructor() {
    const region = process.env.AWS_REGION?.trim() ?? 'us-east-1';
    this.#client = new BedrockRuntimeClient({ region });
  }

  async execute(request: LLMRequest, signal?: AbortSignal): Promise<ProviderResponse> {
    try {
      const command = new InvokeModelCommand({
        accept: 'application/json',
        body: JSON.stringify(this.#mapNovaRequest(request)),
        contentType: 'application/json',
        modelId: request.model,
      });
      const response = await this.#client.send(command, { abortSignal: signal });
      if (response.body === undefined) {
        throw new Error('Empty response body from Bedrock.');
      }
      const parsed: unknown = JSON.parse(new TextDecoder().decode(response.body));
      if (!isNovaResponse(parsed)) {
        throw new Error('Bedrock response does not match the Nova response contract.');
      }
      return this.#mapResponse(parsed, request.model);
    } catch (error: unknown) {
      throw this.#normalizeError(error);
    }
  }

  async executeStructured<T>(
    request: StructuredOutputRequest<T>,
    signal?: AbortSignal
  ): Promise<StructuredOutputResponse<T>> {
    try {
      const command = new ConverseCommand(
        this.#mapStructuredRequest(request, z.toJSONSchema(request.schema))
      );
      const response = await this.#client.send(command, { abortSignal: signal });
      return {
        data: request.schema.parse(this.#extractToolInput(response)),
        rawResponse: { ...response },
        usage: {
          input_tokens: response.usage?.inputTokens ?? 0,
          output_tokens: response.usage?.outputTokens ?? 0,
        },
      };
    } catch (error: unknown) {
      throw this.#normalizeError(error);
    }
  }

  #mapNovaRequest(request: LLMRequest): Record<string, unknown> {
    if (!request.model.startsWith('us.amazon.nova')) {
      throw new Error(`Unsupported Bedrock model: ${request.model}`);
    }
    const system = [{ text: request.instructions }];
    const messages: Array<{ role: 'user'; content: Array<{ text: string }> }> = [];
    for (const entry of request.input) {
      const text = entry.content.map((content) => content.text).join('\n');
      if (entry.role === 'developer') {
        system.push({ text });
      } else {
        messages.push({ content: [{ text }], role: 'user' });
      }
    }
    return {
      inferenceConfig: { max_new_tokens: request.max_output_tokens },
      messages,
      schemaVersion: 'messages-v1',
      system,
    };
  }

  #mapResponse(response: NovaResponse, modelId: string): ProviderResponse {
    if (!modelId.startsWith('us.amazon.nova')) {
      throw new Error(`Unsupported Bedrock model response format: ${modelId}`);
    }
    return {
      output_text: response.output.message.content.at(0)?.text ?? '',
      rawResponse: { ...response },
      usage: {
        input_tokens: response.usage.inputTokens,
        output_tokens: response.usage.outputTokens,
      },
    };
  }

  #mapStructuredRequest<T>(
    request: StructuredOutputRequest<T>,
    jsonSchema: Record<string, unknown>
  ): ConverseCommandInput {
    const normalizedSchema = {
      ...jsonSchema,
      type: typeof jsonSchema.type === 'string' ? jsonSchema.type : 'object',
    };
    const system: NonNullable<ConverseCommandInput['system']> = [
      { text: request.instructions },
    ];
    const messages: NonNullable<ConverseCommandInput['messages']> = [];
    for (const entry of request.input) {
      const text = entry.content.map((content) => content.text).join('\n');
      if (entry.role === 'developer') {
        system.push({ text });
      } else {
        messages.push({ content: [{ text }], role: 'user' });
      }
    }
    return {
      inferenceConfig: { maxTokens: request.max_output_tokens },
      messages,
      modelId: request.model,
      system,
      toolConfig: {
        toolChoice: { tool: { name: request.schemaName } },
        tools: [{
          toolSpec: {
            description: `Extract structured data matching the ${request.schemaName} schema`,
            inputSchema: { json: toJsonDocument(normalizedSchema) },
            name: request.schemaName,
          },
        }],
      },
    };
  }

  #extractToolInput(response: ConverseCommandOutput): unknown {
    const content = response.output?.message?.content;
    if (content === undefined) {
      throw new Error('No content in Bedrock response.');
    }
    const toolUse = content.find((block) => block.toolUse !== undefined)?.toolUse;
    if (toolUse === undefined) {
      throw new Error('No toolUse block in Bedrock response.');
    }
    return toolUse.input;
  }

  #normalizeError(error: unknown): ProviderError {
    const message = error instanceof Error ? error.message : 'unknown';
    const retryable = error instanceof Error && (
      error.message.includes('ThrottlingException')
      || error.message.includes('ServiceUnavailable')
    );
    return new ProviderError({
      code: 'bedrock_error',
      details: { message },
      retryable,
      status: 502,
    });
  }
}
