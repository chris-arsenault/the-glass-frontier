import {
  BedrockRuntimeClient,
  ConverseCommand,
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

type JsonDocument = null | boolean | number | string | JsonDocument[] | {
  [key: string]: JsonDocument;
};

const CLAUDE_SONNET_5_MODEL_ID = 'us.anthropic.claude-sonnet-5';
const NOVA_2_LITE_MODEL_ID = 'us.amazon.nova-2-lite-v1:0';

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

export const mapBedrockMessages = (
  request: LLMRequest
): Pick<ConverseCommandInput, 'messages' | 'system'> => {
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
  return { messages, system };
};

export const mapBedrockRequest = (request: LLMRequest): ConverseCommandInput => {
  const { messages, system } = mapBedrockMessages(request);
  const baseRequest: ConverseCommandInput = {
    inferenceConfig: { maxTokens: request.maxOutputTokens },
    messages,
    modelId: request.model,
    requestMetadata: { player: request.player.name },
    system,
  };

  if (request.model === CLAUDE_SONNET_5_MODEL_ID) {
    return {
      ...baseRequest,
      additionalModelRequestFields: {
        output_config: { effort: request.reasoningEffort },
        thinking: { type: 'adaptive' },
      },
    };
  }
  if (request.model === NOVA_2_LITE_MODEL_ID) {
    return {
      ...baseRequest,
      additionalModelRequestFields: {
        reasoningConfig: {
          maxReasoningEffort: request.reasoningEffort,
          type: 'enabled',
        },
      },
    };
  }
  // Nova Pro and every open-weight model on Bedrock — GPT OSS, Kimi, Qwen —
  // take no extra request fields: their reasoning, where they have any, is not
  // addressable through Converse. Only a model with a documented field of its
  // own is named above; the rest are a plain Converse call, and rejecting them
  // by name only ever meant the catalog could not grow.
  return baseRequest;
};

export const mapBedrockStructuredRequest = <T>(
  request: StructuredOutputRequest<T>
): ConverseCommandInput => {
  const jsonSchema = z.toJSONSchema(request.schema);
  const normalizedSchema = {
    ...jsonSchema,
    type: typeof jsonSchema.type === 'string' ? jsonSchema.type : 'object',
  };
  return {
    ...mapBedrockRequest(request),
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
};

export class BedrockProvider implements IProvider, IStructuredOutputProvider {
  readonly id = 'bedrock';
  readonly supportsStreaming = false;
  readonly valid = true;
  readonly #client: BedrockRuntimeClient;

  constructor() {
    const region = process.env.AWS_REGION?.trim() ?? 'us-east-1';
    this.#client = new BedrockRuntimeClient({ region });
  }

  async execute(request: LLMRequest, signal?: AbortSignal): Promise<ProviderResponse> {
    try {
      const command = new ConverseCommand(mapBedrockRequest(request));
      const response = await this.#client.send(command, { abortSignal: signal });
      return this.#mapResponse(response);
    } catch (error: unknown) {
      throw this.#normalizeError(error);
    }
  }

  async executeStructured<T>(
    request: StructuredOutputRequest<T>,
    signal?: AbortSignal
  ): Promise<StructuredOutputResponse<T>> {
    try {
      const command = new ConverseCommand(mapBedrockStructuredRequest(request));
      const response = await this.#client.send(command, { abortSignal: signal });
      return {
        data: request.schema.parse(this.#extractToolInput(response)),
        rawResponse: { ...response },
        usage: {
          inputTokens: response.usage?.inputTokens ?? 0,
          outputTokens: response.usage?.outputTokens ?? 0,
          totalTokens: response.usage?.totalTokens ?? 0,
        },
      };
    } catch (error: unknown) {
      throw this.#normalizeError(error);
    }
  }

  #mapResponse(response: ConverseCommandOutput): ProviderResponse {
    return {
      output_text: this.#extractText(response),
      rawResponse: { ...response },
      usage: {
        inputTokens: response.usage?.inputTokens ?? 0,
        outputTokens: response.usage?.outputTokens ?? 0,
        totalTokens: response.usage?.totalTokens ?? 0,
      },
    };
  }

  #extractText(response: ConverseCommandOutput): string {
    const text = response.output?.message?.content?.flatMap(
      (block) => block.text === undefined ? [] : [block.text]
    )
      .join('\n')
      .trim();
    if (text === undefined || text.length === 0) {
      throw new Error('Bedrock returned no text content.');
    }
    return text;
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
    if (error instanceof ProviderError) {
      return error;
    }
    const message = error instanceof Error ? error.message : 'unknown';
    const status = this.#extractStatus(error);
    const code = error instanceof Error ? error.name : 'bedrock_error';
    const retryable = status === 408 || status === 409 || status === 429 || status >= 500;
    return new ProviderError({
      code,
      details: { message },
      retryable,
      status,
    });
  }

  #extractStatus(error: unknown): number {
    if (typeof error !== 'object' || error === null || !('$metadata' in error)) {
      return 502;
    }
    const metadata = error.$metadata;
    if (typeof metadata !== 'object' || metadata === null || !('httpStatusCode' in metadata)) {
      return 502;
    }
    return typeof metadata.httpStatusCode === 'number' ? metadata.httpStatusCode : 502;
  }
}
