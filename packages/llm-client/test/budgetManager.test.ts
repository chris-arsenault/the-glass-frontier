import type { CatalogModel } from '@glass-frontier/app';
import { describe, expect, it, vi } from 'vitest';

import { ProviderError } from '../src/ProviderError';
import {
  ADMIN_MONTHLY_LLM_BUDGET_USD,
  calculateActualCostUsd,
  calculateReservedCostUsd,
  DEFAULT_MONTHLY_LLM_BUDGET_USD,
  LlmBudgetManager,
} from '../src/services/LlmBudgetManager';
import type { LLMRequest } from '../src/types';

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

const request = (isAdmin: boolean): LLMRequest => ({
  input: [{ content: [{ text: 'hello', type: 'input_text' }], role: 'user' }],
  instructions: 'System',
  maxOutputTokens: 100,
  metadata: { operation: 'test' },
  model: model.modelId,
  player: { id: 'player-1', isAdmin, name: 'tsonu' },
  reasoningEffort: 'low',
});

const reservation = {
  id: 'reservation-1',
  period: '2026-08-01',
  playerId: 'player-1',
  reservedUsd: calculateReservedCostUsd(model, request(false)),
};

describe('LLM monthly budgets', () => {
  it('reserves against the default and admin limits', async () => {
    const reserve = vi.fn().mockResolvedValue({ reservation, status: 'reserved' });
    const manager = new LlmBudgetManager({
      now: () => new Date('2026-08-22T00:00:00Z'),
      reservationId: () => reservation.id,
      store: { release: vi.fn(), reserve, settle: vi.fn() },
    });

    await manager.reserve(request(false), model);
    await manager.reserve(request(true), model);

    expect(reserve.mock.calls[0]?.[0]).toMatchObject({
      limitUsd: DEFAULT_MONTHLY_LLM_BUDGET_USD,
      period: '2026-08-01',
      playerId: 'player-1',
    });
    expect(reserve.mock.calls[1]?.[0]).toMatchObject({
      limitUsd: ADMIN_MONTHLY_LLM_BUDGET_USD,
    });
  });

  it('rejects an invocation without asking the provider to retry', async () => {
    const manager = new LlmBudgetManager({
      store: {
        release: vi.fn(),
        reserve: vi.fn().mockResolvedValue({
          reservedUsd: 0.25,
          spentUsd: 9.75,
          status: 'exceeded',
        }),
        settle: vi.fn(),
      },
    });

    const error = await manager.reserve(request(false), model).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ProviderError);
    expect(error).toMatchObject({
      code: 'monthly_llm_budget_exceeded',
      retryable: false,
      status: 429,
    });
    expect((error as Error).message).toContain('tsonu ($10.00)');
  });

  it('reserves conservatively and settles the exact metered cost', async () => {
    const settle = vi.fn();
    const manager = new LlmBudgetManager({
      store: { release: vi.fn(), reserve: vi.fn(), settle },
    });

    expect(calculateReservedCostUsd(model, request(false))).toBe(0.002304);
    expect(calculateReservedCostUsd(model, request(false), 'x'.repeat(1000))).toBe(0.005307);
    expect(calculateActualCostUsd(model, {
      inputTokens: 100,
      outputTokens: 20,
      totalTokens: 120,
    })).toBe(0.0006);

    await manager.settle(reservation, model, {
      inputTokens: 100,
      outputTokens: 20,
      totalTokens: 120,
    });
    expect(settle).toHaveBeenCalledWith(reservation, 0.0006);
  });
});
