import type { ZodSchema } from 'zod';

import type { LLMRequest, TokenUsage } from '../types';

export type StructuredOutputRequest<T = unknown> = LLMRequest & {
  schema: ZodSchema<T>;
  schemaName: string;
};

export type StructuredOutputResponse<T = unknown> = {
  data: T;
  rawResponse: Record<string, unknown>;
  usage: TokenUsage;
};

export type IStructuredOutputProvider = {
  executeStructured: <T>(
    request: StructuredOutputRequest<T>,
    signal?: AbortSignal
  ) => Promise<StructuredOutputResponse<T>>;
};
