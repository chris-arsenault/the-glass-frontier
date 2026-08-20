import type { ZodSchema } from 'zod';

import type { LLMRequest } from '../types';

export type StructuredOutputRequest<T = unknown> = LLMRequest & {
  schema: ZodSchema<T>;
  schemaName: string;
};

export type StructuredOutputResponse<T = unknown> = {
  data: T;
  rawResponse: Record<string, unknown>;
  usage: Record<string, unknown>;
};

/**
 * Interface for providers that support structured output via tool calling or native methods
 */
export type IStructuredOutputProvider = {
  /**
   * Execute a request with structured output validation
   */
  executeStructured: <T>(
    request: StructuredOutputRequest<T>,
    signal?: AbortSignal
  ) => Promise<StructuredOutputResponse<T>>;

  /**
   * Check if this provider supports native structured output (like OpenAI)
   * vs tool-based structured output (like Anthropic/Bedrock)
   */
  readonly supportsNativeStructuredOutput: boolean;
};
