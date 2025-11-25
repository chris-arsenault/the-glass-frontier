import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';
import * as z from 'zod';
import { IProvider, ProviderResponse } from './IProvider';
import {
  IStructuredOutputProvider,
  StructuredOutputRequest,
  StructuredOutputResponse,
} from './IStructuredOutputProvider';
import { LLMRequest } from '../types';
import { ProviderError } from '../ProviderError';

export class BedrockProvider implements IProvider, IStructuredOutputProvider {
  readonly id = 'bedrock';
  readonly supportsStreaming = false;
  readonly supportsNativeStructuredOutput = false;
  readonly valid: boolean;
  readonly #client: BedrockRuntimeClient;

  constructor() {
    // Check for AWS credentials
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
    const region = process.env.AWS_REGION?.trim() || 'us-east-1';

    if (!accessKeyId || !secretAccessKey) {
      console.warn('[BedrockProvider] AWS credentials not configured - provider will be invalid');
      this.valid = false;
      this.#client = new BedrockRuntimeClient({ region });
      return;
    }

    this.valid = true;
    this.#client = new BedrockRuntimeClient({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  async execute(request: LLMRequest, signal?: AbortSignal): Promise<ProviderResponse> {
    try {
      const body = this.#mapRequest(request);

      const command = new InvokeModelCommand({
        modelId: request.model,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(body),
      });

      const response = await this.#client.send(command);

      if (!response.body) {
        console.error('[BedrockProvider] Empty response body from Bedrock');
        throw new Error('Empty response body from Bedrock');
      }

      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      return this.#mapResponse(responseBody, request.model);
    } catch (error: unknown) {
      console.error('[BedrockProvider] Request failed');
      throw this.#normalizeError(error);
    }
  }

  #mapRequest(request: LLMRequest): unknown {
    if (request.model.startsWith('us.amazon.nova')) {
      return this.#mapNovaRequest(request);
    }

    throw new Error(`Unsupported Bedrock model: ${request.model}`);
  }

  #mapNovaRequest(request: LLMRequest) {
    const systemMessages = [
      {
        text: request.instructions,
      },
    ];

    const messages: Array<{ role: string; content: Array<{ text: string }> }> = [];

    for (const msg of request.input) {
      if (msg.role === 'developer') {
        systemMessages.push({
          text: msg.content.map((c) => c.text).join('\n'),
        });
      } else {
        messages.push({
          role: 'user',
          content: [{ text: msg.content.map((c) => c.text).join('\n') }],
        });
      }
    }

    return {
      schemaVersion: 'messages-v1',
      system: systemMessages,
      messages,
      inferenceConfig: {
        max_new_tokens: request.max_output_tokens,
      },
    };
  }

  #mapResponse(response: any, modelId: string): ProviderResponse {
    if (modelId.startsWith('us.amazon.nova')) {
      return {
        output_text: response.output.message.content[0].text,
        usage: {
          input_tokens: response.usage.inputTokens,
          output_tokens: response.usage.outputTokens,
        },
        rawResponse: response,
      };
    }

    throw new Error(`Unsupported Bedrock model response format: ${modelId}`);
  }

  async executeStructured<T>(
    request: StructuredOutputRequest,
    signal?: AbortSignal
  ): Promise<StructuredOutputResponse<T>> {
    try {
      // Convert Zod schema to JSON Schema using Zod v4's static function
      const jsonSchema = z.toJSONSchema(request.schema);

      const toolConfig = this.#mapStructuredRequestTool(request, jsonSchema as Record<string, unknown>);

      const command = new ConverseCommand(toolConfig);
      const response = await this.#client.send(command);

      // Extract tool use from response
      if (!response.output?.message?.content) {
        throw new Error('No content in Bedrock response');
      }

      const toolUseBlock = response.output.message.content.find(
        (block: any) => block.toolUse
      );

      if (!toolUseBlock?.toolUse) {
        console.error('[BedrockProvider] No toolUse block found. Content blocks:',
          response.output.message.content.map((b: any) => Object.keys(b)));
        throw new Error('No toolUse block in response');
      }

      // Validate against schema
      const parsed = request.schema.parse(toolUseBlock.toolUse.input);

      return {
        data: parsed as T,
        rawResponse: response as unknown as Record<string, unknown>,
        usage: {
          input_tokens: response.usage?.inputTokens || 0,
          output_tokens: response.usage?.outputTokens || 0,
        },
      };
    } catch (error: unknown) {
      console.error('[BedrockProvider] Structured request failed');
      throw this.#normalizeError(error);
    }
  }

  #mapStructuredRequestTool(
    request: StructuredOutputRequest,
    jsonSchema: Record<string, unknown>
  ): any {
    const systemMessages = [{ text: request.instructions }];

    const messages: any[] = [];

    for (const msg of request.input) {
      if (msg.role === 'developer') {
        systemMessages.push({
          text: msg.content.map((c) => c.text).join('\n'),
        });
      } else {
        messages.push({
          role: 'user',
          content: [{ text: msg.content.map((c) => c.text).join('\n') }],
        });
      }
    }

    // Define tool with schema - Nova supports tool calling via Converse API
    // Ensure the schema has a type field
    const inputSchema = {
      ...jsonSchema,
      type: jsonSchema.type || 'object',
    };

    const toolSpec = {
      name: request.schemaName,
      description: `Extract structured data matching the ${request.schemaName} schema`,
      inputSchema: {
        json: inputSchema,
      },
    };

    return {
      modelId: request.model,
      system: systemMessages,
      messages,
      inferenceConfig: {
        maxTokens: request.max_output_tokens,
      },
      toolConfig: {
        tools: [{ toolSpec }],
        toolChoice: {
          tool: {
            name: request.schemaName,
          },
        },
      },
    };
  }

  #normalizeError(error: unknown): ProviderError {
    console.error('[BedrockProvider] Error details:', {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : undefined,
      stack: error instanceof Error ? error.stack : undefined,
      errorType: typeof error,
      errorConstructor: error?.constructor?.name,
      fullError: JSON.stringify(error, null, 2),
    });

    const message = error instanceof Error ? error.message : 'unknown';
    const isRetryable =
      error instanceof Error &&
      (error.message.includes('ThrottlingException') ||
        error.message.includes('ServiceUnavailable'));

    return new ProviderError({
      code: 'bedrock_error',
      details: { message },
      retryable: isRetryable,
      status: 502,
    });
  }
}
