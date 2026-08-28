import type { CatalogModel } from '@glass-frontier/app';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  mapBedrockRequest,
  mapBedrockStructuredRequest,
} from '../src/providers/BedrockProvider';
import type { IProvider } from '../src/providers/IProvider';
import type { StructuredOutputRequest } from '../src/providers/IStructuredOutputProvider';
import { mapOpenAIRequest, mapOpenAIStructuredRequest } from '../src/providers/OpenAIProvider';
import { ProviderRegistry } from '../src/providers/ProviderRegistry';
import type { LLMRequest } from '../src/types';

const CLAUDE_API_MODEL_ID = 'us.anthropic.claude-sonnet-5';
const DEVELOPER_TEXT = 'Keep the answer grounded.';
const INSTRUCTIONS = 'Continue the chronicle.';
const LOW_EFFORT = 'low';
const NOVA_2_API_MODEL_ID = 'us.amazon.nova-2-lite-v1:0';
const NOVA_MODEL_ID = 'amazon-nova-2-lite';
const NOVA_PRO_API_MODEL_ID = 'us.amazon.nova-pro-v1:0';
const OPENAI_MODEL_ID = 'gpt-5.6-luna';
const SCHEMA_NAME = 'Answer';
const USER_TEXT = 'What happens next?';
const schema = z.object({ answer: z.string() });

const request = (model: string): LLMRequest => ({
  input: [
    {
      content: [{ text: DEVELOPER_TEXT, type: 'input_text' }],
      role: 'developer',
    },
    {
      content: [{ text: USER_TEXT, type: 'input_text' }],
      role: 'user',
    },
  ],
  instructions: INSTRUCTIONS,
  maxOutputTokens: 1200,
  metadata: { nodeId: 'test-node', turnSequence: 4 },
  model,
  player: { id: 'player-1', isAdmin: false, name: 'tsonu' },
  reasoningEffort: LOW_EFFORT,
});

const structuredRequest = (model: string): StructuredOutputRequest<{ answer: string }> => ({
  ...request(model),
  schema,
  schemaName: SCHEMA_NAME,
});

describe('OpenAI request contract', () => {
  it('maps the neutral request to OpenAI Responses fields', () => {
    const mapped = mapOpenAIRequest(request(OPENAI_MODEL_ID));

    expect(mapped).toMatchObject({
      instructions: INSTRUCTIONS,
      max_output_tokens: 1200,
      metadata: { nodeId: 'test-node', turnSequence: '4' },
      model: OPENAI_MODEL_ID,
      reasoning: { effort: LOW_EFFORT },
      stream: false,
    });
    expect(mapped).not.toHaveProperty('maxOutputTokens');

    const structured = mapOpenAIStructuredRequest(structuredRequest(OPENAI_MODEL_ID));
    expect(structured.text?.format).toMatchObject({ name: SCHEMA_NAME, type: 'json_schema' });
  });
});

describe('Bedrock request contract', () => {
  it('maps Claude to Converse with adaptive thinking and forced tool output', () => {
    const mapped = mapBedrockRequest(request(CLAUDE_API_MODEL_ID));

    expect(mapped).toMatchObject({
      additionalModelRequestFields: {
        output_config: { effort: LOW_EFFORT },
        thinking: { type: 'adaptive' },
      },
      inferenceConfig: { maxTokens: 1200 },
      messages: [{ content: [{ text: USER_TEXT }], role: 'user' }],
      modelId: CLAUDE_API_MODEL_ID,
      requestMetadata: { player: 'tsonu' },
      system: [
        { text: INSTRUCTIONS },
        { text: DEVELOPER_TEXT },
      ],
    });

    const structured = mapBedrockStructuredRequest(structuredRequest(CLAUDE_API_MODEL_ID));
    expect(structured.toolConfig).toMatchObject({
      toolChoice: { tool: { name: SCHEMA_NAME } },
      tools: [{ toolSpec: { name: SCHEMA_NAME } }],
    });
  });

  it('maps Nova 2 to Converse with explicit reasoning and forced tool output', () => {
    const mapped = mapBedrockRequest(request(NOVA_2_API_MODEL_ID));

    expect(mapped).toMatchObject({
      additionalModelRequestFields: {
        reasoningConfig: { maxReasoningEffort: LOW_EFFORT, type: 'enabled' },
      },
      inferenceConfig: { maxTokens: 1200 },
      messages: [{ content: [{ text: USER_TEXT }], role: 'user' }],
      modelId: NOVA_2_API_MODEL_ID,
      requestMetadata: { player: 'tsonu' },
      system: [
        { text: INSTRUCTIONS },
        { text: DEVELOPER_TEXT },
      ],
    });

    const structured = mapBedrockStructuredRequest(structuredRequest(NOVA_2_API_MODEL_ID));
    expect(structured.toolConfig).toMatchObject({
      toolChoice: { tool: { name: SCHEMA_NAME } },
      tools: [{ toolSpec: { name: SCHEMA_NAME } }],
    });
  });

  it('maps Nova Pro to standard Converse without unsupported reasoning fields', () => {
    const mapped = mapBedrockRequest(request(NOVA_PRO_API_MODEL_ID));

    expect(mapped).toMatchObject({
      inferenceConfig: { maxTokens: 1200 },
      messages: [{ content: [{ text: USER_TEXT }], role: 'user' }],
      modelId: NOVA_PRO_API_MODEL_ID,
      requestMetadata: { player: 'tsonu' },
      system: [
        { text: INSTRUCTIONS },
        { text: DEVELOPER_TEXT },
      ],
    });
    expect(mapped).not.toHaveProperty('additionalModelRequestFields');

    const structured = mapBedrockStructuredRequest(structuredRequest(NOVA_PRO_API_MODEL_ID));
    expect(structured.toolConfig).toMatchObject({
      toolChoice: { tool: { name: SCHEMA_NAME } },
      tools: [{ toolSpec: { name: SCHEMA_NAME } }],
    });
  });
});

describe('model resolution', () => {
  const provider: IProvider = {
    execute: () => Promise.reject(new Error('not invoked')),
    id: 'bedrock',
    supportsStreaming: false,
    valid: true,
  };
  const model: CatalogModel = {
    apiModelId: NOVA_2_API_MODEL_ID,
    contextWindow: 1_000_000,
    costPer1kInput: 0.0003,
    costPer1kOutput: 0.0025,
    displayName: 'Amazon Nova 2 Lite',
    maxOutputTokens: 65_536,
    modelId: NOVA_MODEL_ID,
    providerId: 'bedrock',
    reasoningEfforts: [LOW_EFFORT, 'medium'],
  };

  const registry = (): ProviderRegistry => {
    const value = new ProviderRegistry();
    value.register(provider);
    value.registerModel(model);
    return value;
  };

  it('resolves only the canonical logical model ID', () => {
    const resolved = registry().resolve(request(NOVA_MODEL_ID));

    expect(resolved.request.model).toBe(NOVA_2_API_MODEL_ID);
    expect(() => registry().resolve(request(NOVA_2_API_MODEL_ID)))
      .toThrow('is not registered');
  });

  it('rejects an effort the model does not have, and a nonsensical limit', () => {
    expect(() => registry().resolve({
      ...request(NOVA_MODEL_ID),
      reasoningEffort: 'high',
    })).toThrow('does not support high reasoning effort');
    expect(() => registry().resolve({
      ...request(NOVA_MODEL_ID),
      maxOutputTokens: 0,
    })).toThrow('must be a positive integer');
  });

  it('clamps an over-large output request to what the model allows', () => {
    // Asking for more headroom than a model has is a request for "as much as
    // you will give me". Rejecting it forced every caller down to the smallest
    // model in the catalog, and those caps then starved the reasoning models
    // mid-thought.
    const resolved = registry().resolve({
      ...request(NOVA_MODEL_ID),
      maxOutputTokens: 65_537,
    });

    expect(resolved.request.maxOutputTokens).toBe(65_536);
    expect(resolved.model.maxOutputTokens).toBe(65_536);
  });

  it('leaves a request inside the model\'s ceiling untouched', () => {
    const resolved = registry().resolve({
      ...request(NOVA_MODEL_ID),
      maxOutputTokens: 4_000,
    });

    expect(resolved.request.maxOutputTokens).toBe(4_000);
  });
});
