import type { CatalogModel } from '@glass-frontier/app';
import type { LlmBudgetReservation, LlmBudgetStore } from '@glass-frontier/ops';
import { randomUUID } from 'node:crypto';

import { ProviderError } from '../ProviderError';
import type { LLMRequest, TokenUsage } from '../types';

export const DEFAULT_MONTHLY_LLM_BUDGET_USD = 10;
export const ADMIN_MONTHLY_LLM_BUDGET_USD = 50;

const INPUT_TOKEN_OVERHEAD = 256;
const RESERVATION_TTL_MS = 10 * 60 * 1000;
const USD_PRECISION = 1_000_000;

type BudgetStore = Pick<LlmBudgetStore, 'release' | 'reserve' | 'settle'>;

export const isLlmBudgetExceededError = (error: unknown): boolean =>
  error instanceof ProviderError && error.code === 'monthly_llm_budget_exceeded';

const roundUpUsd = (value: number): number =>
  Math.ceil(value * USD_PRECISION) / USD_PRECISION;

export const calculateActualCostUsd = (
  model: CatalogModel,
  usage: TokenUsage
): number => roundUpUsd(
  (usage.inputTokens * model.costPer1kInput + usage.outputTokens * model.costPer1kOutput) / 1000
);

export const calculateReservedCostUsd = (
  model: CatalogModel,
  request: LLMRequest,
  additionalInput = ''
): number => {
  const prompt = [
    request.instructions,
    ...request.input.flatMap((entry) => entry.content.map((content) => content.text)),
    ...(additionalInput.length === 0 ? [] : [additionalInput]),
  ].join('\n');
  const inputTokenUpperBound = new TextEncoder().encode(prompt).length + INPUT_TOKEN_OVERHEAD;
  return roundUpUsd(
    (
      inputTokenUpperBound * model.costPer1kInput
      + request.maxOutputTokens * model.costPer1kOutput
    ) / 1000
  );
};

export class LlmBudgetManager {
  readonly #store: BudgetStore;
  readonly #now: () => Date;
  readonly #reservationId: () => string;

  constructor(options: {
    now?: () => Date;
    reservationId?: () => string;
    store: BudgetStore;
  }) {
    this.#store = options.store;
    this.#now = options.now ?? (() => new Date());
    this.#reservationId = options.reservationId ?? randomUUID;
  }

  async reserve(
    request: LLMRequest,
    model: CatalogModel,
    additionalInput = ''
  ): Promise<LlmBudgetReservation> {
    const now = this.#now();
    const limitUsd = request.player.isAdmin
      ? ADMIN_MONTHLY_LLM_BUDGET_USD
      : DEFAULT_MONTHLY_LLM_BUDGET_USD;
    const requestedUsd = calculateReservedCostUsd(model, request, additionalInput);
    const result = await this.#store.reserve({
      expiresAt: new Date(now.getTime() + RESERVATION_TTL_MS),
      limitUsd,
      period: this.#period(now),
      playerId: request.player.id,
      requestedUsd,
      reservationId: this.#reservationId(),
    });
    if (result.status === 'reserved') {
      return result.reservation;
    }
    throw new ProviderError({
      code: 'monthly_llm_budget_exceeded',
      details: {
        limitUsd,
        playerId: request.player.id,
        requestedUsd,
        reservedUsd: result.reservedUsd,
        spentUsd: result.spentUsd,
      },
      message: `Monthly LLM budget exhausted for ${request.player.name} ($${limitUsd.toFixed(2)}).`,
      retryable: false,
      status: 429,
    });
  }

  async settle(
    reservation: LlmBudgetReservation,
    model: CatalogModel,
    usage: TokenUsage
  ): Promise<void> {
    await this.#store.settle(reservation, calculateActualCostUsd(model, usage));
  }

  async release(reservation: LlmBudgetReservation): Promise<void> {
    await this.#store.release(reservation);
  }

  #period(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}-01`;
  }
}
