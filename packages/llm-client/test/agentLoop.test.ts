import type { CatalogModel } from '@glass-frontier/app';
import { tool } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it, type Mock, vi } from 'vitest';
import { z } from 'zod';

import { AgentLoopClient, type AgentLoopRequest } from '../src/agentLoop';
import { ProviderError } from '../src/ProviderError';
import { LlmBudgetManager } from '../src/services/LlmBudgetManager';
import type { LLMSuccessHandler } from '../src/services/successHandler';

const model: CatalogModel = {
  apiModelId: 'us.anthropic.claude-sonnet-5',
  contextWindow: 1_000_000,
  costPer1kInput: 0.003,
  costPer1kOutput: 0.015,
  displayName: 'Claude Sonnet 5',
  maxOutputTokens: 128_000,
  modelId: 'claude-sonnet-5',
  providerId: 'bedrock',
  reasoningEfforts: ['low'],
};

const usage = {
  inputTokens: { cacheRead: undefined, cacheWrite: undefined, noCache: undefined, total: 100 },
  outputTokens: { reasoning: undefined, text: undefined, total: 20 },
};

type MockContent =
  | { input: string; toolCallId: string; toolName: string; type: 'tool-call' }
  | { text: string; type: 'text' };

type MockGenerateResponse = {
  content: MockContent[];
  finishReason: { raw: undefined; unified: 'stop' | 'tool-calls' };
  usage: typeof usage;
  warnings: [];
};

const toolCallResponse = (
  toolName: string,
  input: Record<string, unknown>
): MockGenerateResponse => ({
  content: [
    {
      input: JSON.stringify(input),
      toolCallId: `call-${toolName}`,
      toolName,
      type: 'tool-call' as const,
    },
  ],
  finishReason: { raw: undefined, unified: 'tool-calls' as const },
  usage,
  warnings: [],
});

const tools = {
  read_identity: tool({
    description: 'Read identity fields for an entity.',
    execute: ({ entityId }: { entityId: string }) => ({ entityId, text: 'prose' }),
    inputSchema: z.object({ entityId: z.string() }),
  }),
  submit_turn: tool({
    description: 'Submit the final narration.',
    execute: (input: { prose: string }) => input,
    inputSchema: z.object({ prose: z.string() }),
  }),
};

const reservation = {
  id: 'reservation-1',
  period: '2026-08-01',
  playerId: 'player-1',
  reservedUsd: 1,
};

type BudgetStoreMock = { release: Mock; reserve: Mock; settle: Mock };

const budgetStore = (): BudgetStoreMock => ({
  release: vi.fn().mockResolvedValue(undefined),
  reserve: vi.fn().mockResolvedValue({ reservation, status: 'reserved' }),
  settle: vi.fn().mockResolvedValue(undefined),
});

const successHandler = (): { handler: LLMSuccessHandler; handleSuccess: Mock } => {
  const handleSuccess = vi.fn().mockResolvedValue(undefined);
  return { handler: { handleSuccess } as unknown as LLMSuccessHandler, handleSuccess };
};

const loopRequest = (
  overrides?: Partial<AgentLoopRequest>
): AgentLoopRequest => ({
  finishToolName: 'submit_turn',
  instructions: 'You are a game master.',
  maxOutputTokens: 2000,
  maxSteps: 4,
  messages: [{ content: 'I lean on Korvath.', role: 'user' }],
  metadata: { nodeId: 'gm-response-node', playerId: 'player-1' },
  model,
  player: { id: 'player-1', isAdmin: false, name: 'tsonu' },
  reasoningEffort: 'low',
  tools,
  ...overrides,
});

const client = (options: {
  responses: Array<() => MockGenerateResponse | Promise<never>>;
  store?: BudgetStoreMock;
  handler?: LLMSuccessHandler | null;
}): { client: AgentLoopClient; mockModel: MockLanguageModelV4 } => {
  let call = 0;
  const mockModel = new MockLanguageModelV4({
    doGenerate: async () => {
      const respond = options.responses.at(call);
      call += 1;
      if (respond === undefined) {
        throw new Error('Mock model ran out of scripted responses.');
      }
      return respond();
    },
  });
  return {
    client: new AgentLoopClient({
      budgetManager: options.store === undefined ? null : new LlmBudgetManager({
        store: options.store,
      }),
      modelFactory: () => mockModel,
      successHandler: options.handler ?? null,
    }),
    mockModel,
  };
};

describe('agent loop', () => {
  it('runs retrieval rounds until the finish tool and reports each step', async () => {
    const store = budgetStore();
    const { handler, handleSuccess } = successHandler();
    const steps: Array<{ stepNumber: number; toolNames: string[] }> = [];
    const loop = client({
      handler,
      responses: [
        () => toolCallResponse('read_identity', { entityId: 'korvath' }),
        () => toolCallResponse('submit_turn', { prose: 'Korvath stiffens.' }),
      ],
      store,
    });
    const result = await loop.client.run(
      loopRequest({
        onStep: (step) => steps.push({ stepNumber: step.stepNumber, toolNames: step.toolNames }),
      })
    );
    expect(result.finishToolInput).toEqual({ prose: 'Korvath stiffens.' });
    expect(result.stepCount).toBe(2);
    expect(result.usage.inputTokens).toBe(200);
    expect(store.reserve).toHaveBeenCalledTimes(2);
    expect(store.settle).toHaveBeenCalledTimes(2);
    expect(store.release).not.toHaveBeenCalled();
    expect(handleSuccess).toHaveBeenCalledTimes(2);
    expect(steps).toEqual([
      { stepNumber: 0, toolNames: ['read_identity'] },
      { stepNumber: 1, toolNames: ['submit_turn'] },
    ]);
  });

  it('surfaces schema-invalid tool calls in the step report', async () => {
    const steps: Array<{ toolErrors: Array<{ toolName: string }> }> = [];
    const loop = client({
      responses: [
        () => toolCallResponse('read_identity', { wrong: 'shape' }),
        () => toolCallResponse('submit_turn', { prose: 'Recovered.' }),
      ],
      store: budgetStore(),
    });
    await loop.client.run(loopRequest({
      onStep: (step) => steps.push({ toolErrors: step.toolErrors }),
    }));
    expect(steps[0]?.toolErrors[0]?.toolName).toBe('read_identity');
    expect(steps[1]?.toolErrors).toEqual([]);
  });

  it('forces the finish tool on the final permitted step', async () => {
    const loop = client({
      responses: [
        () => toolCallResponse('read_identity', { entityId: 'korvath' }),
        () => toolCallResponse('read_identity', { entityId: 'veska' }),
        () => toolCallResponse('submit_turn', { prose: 'Done.' }),
      ],
      store: budgetStore(),
    });
    const result = await loop.client.run(loopRequest({ maxSteps: 3 }));
    expect(result.stepCount).toBe(3);
    const finalCall = loop.mockModel.doGenerateCalls.at(-1);
    expect(finalCall?.toolChoice).toEqual({ toolName: 'submit_turn', type: 'tool' });
  });

  it('keeps one adaptive thinking configuration across every step', async () => {
    const loop = client({
      responses: [
        () => toolCallResponse('read_identity', { entityId: 'korvath' }),
        () => toolCallResponse('read_identity', { entityId: 'veska' }),
        () => toolCallResponse('submit_turn', { prose: 'Done.' }),
      ],
      store: budgetStore(),
    });
    await loop.client.run(loopRequest({ maxSteps: 3 }));
    const adaptive = {
      bedrock: { reasoningConfig: { maxReasoningEffort: 'low', type: 'adaptive' } },
    };
    for (const call of loop.mockModel.doGenerateCalls) {
      expect(call.providerOptions).toEqual(adaptive);
    }
    expect(loop.mockModel.doGenerateCalls[1]?.toolChoice).toEqual({ type: 'auto' });
  });

  it('forces retrieval on the first step and frees the steps between', async () => {
    const loop = client({
      responses: [
        () => toolCallResponse('read_identity', { entityId: 'korvath' }),
        () => toolCallResponse('submit_turn', { prose: 'Done.' }),
      ],
      store: budgetStore(),
    });
    await loop.client.run(loopRequest());
    const first = loop.mockModel.doGenerateCalls[0];
    expect(first?.toolChoice).toEqual({ type: 'required' });
    expect(first?.tools?.map((entry) => entry.name)).toEqual(['read_identity']);
    const second = loop.mockModel.doGenerateCalls[1];
    expect(second?.toolChoice).toEqual({ type: 'auto' });
    expect(second?.tools?.map((entry) => entry.name))
      .toEqual(['read_identity', 'submit_turn']);
  });

  it('runs non-Anthropic models greedy and Anthropic models on their reasoning defaults', async () => {
    const nova: CatalogModel = { ...model, apiModelId: 'us.amazon.nova-pro-v1:0' };
    const novaLoop = client({
      responses: [
        () => toolCallResponse('read_identity', { entityId: 'korvath' }),
        () => toolCallResponse('submit_turn', { prose: 'Done.' }),
      ],
      store: budgetStore(),
    });
    await novaLoop.client.run(loopRequest({ model: nova }));
    expect(novaLoop.mockModel.doGenerateCalls[0]?.temperature).toBe(0);

    const anthropicLoop = client({
      responses: [
        () => toolCallResponse('read_identity', { entityId: 'korvath' }),
        () => toolCallResponse('submit_turn', { prose: 'Done.' }),
      ],
      store: budgetStore(),
    });
    await anthropicLoop.client.run(loopRequest());
    expect(anthropicLoop.mockModel.doGenerateCalls[0]?.temperature).toBeUndefined();
  });

  it('releases the reservation when a model call fails mid-loop', async () => {
    const store = budgetStore();
    const failure = new Error('bedrock unavailable');
    const loop = client({
      responses: [
        () => toolCallResponse('read_identity', { entityId: 'korvath' }),
        () => Promise.reject(failure),
      ],
      store,
    });
    await expect(loop.client.run(loopRequest())).rejects.toThrow('bedrock unavailable');
    expect(store.settle).toHaveBeenCalledTimes(1);
    expect(store.release).toHaveBeenCalledTimes(1);
  });

  it('propagates budget exhaustion between rounds', async () => {
    const store = budgetStore();
    store.reserve
      .mockResolvedValueOnce({ reservation, status: 'reserved' })
      .mockResolvedValueOnce({ reservedUsd: 9, spentUsd: 1, status: 'rejected' });
    const loop = client({
      responses: [() => toolCallResponse('read_identity', { entityId: 'korvath' })],
      store,
    });
    await expect(loop.client.run(loopRequest())).rejects.toMatchObject({
      code: 'monthly_llm_budget_exceeded',
    });
    expect(store.settle).toHaveBeenCalledTimes(1);
  });

  it('fails loudly when the loop ends without the finish tool', async () => {
    const loop = client({
      responses: [
        () => ({
          content: [{ text: 'I decline to use tools.', type: 'text' as const }],
          finishReason: { raw: undefined, unified: 'stop' as const },
          usage,
          warnings: [],
        }),
      ],
      store: budgetStore(),
    });
    await expect(loop.client.run(loopRequest())).rejects.toMatchObject({
      code: 'agent_loop_incomplete',
    });
  });

  it('rejects non-Bedrock models', async () => {
    const loop = client({ responses: [], store: budgetStore() });
    await expect(
      loop.client.run(loopRequest({ model: { ...model, providerId: 'openai' } }))
    ).rejects.toBeInstanceOf(ProviderError);
  });
});
