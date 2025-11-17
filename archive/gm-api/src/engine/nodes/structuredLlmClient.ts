import type { ZodSchema } from 'zod';

export type StructuredLlmClient = {
  generateStructured: <T>(input: {
    model: string;
    templateId: string;
    variables: Record<string, unknown>;
    schema: ZodSchema<T>;
    metadata?: Record<string, unknown>;
  }) => Promise<T>;
};

export class NoopStructuredLlmClient implements StructuredLlmClient {
  generateStructured<T>(): Promise<T> {
    return Promise.reject(new Error('Structured LLM client not configured'));
  }
}
