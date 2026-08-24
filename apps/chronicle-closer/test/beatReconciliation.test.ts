import type { ModelConfigStore, PromptTemplateManager } from '@glass-frontier/app';
import type { RetryLLMClient } from '@glass-frontier/llm-client';
import type { ChronicleSnapshot, ChronicleStore } from '@glass-frontier/worldstate';
import { describe, expect, it, vi } from 'vitest';

import { reconcileOpenBeats } from '../src/beatReconciliation';

const CHRONICLE_ID = 'chronicle-1';
const PLAYER = { id: 'player-1', isAdmin: false, name: 'tsonu' };

const snapshotWithBeats = (beats: unknown[]): ChronicleSnapshot =>
  ({
    character: null,
    chronicle: {
      beats,
      id: CHRONICLE_ID,
      playerId: 'player-1',
    },
    chronicleId: CHRONICLE_ID,
    locationName: 'Perch',
    turns: [],
    turnSequence: 0,
  }) as unknown as ChronicleSnapshot;

describe('reconcileOpenBeats', () => {
  it('returns without any calls when no beats are open', async () => {
    const finalizeBeats = vi.fn();
    const generateStructured = vi.fn();

    const changed = await reconcileOpenBeats({
      chronicleStore: { finalizeBeats } as unknown as ChronicleStore,
      llm: { generateStructured } as unknown as RetryLLMClient,
      modelConfigStore: {} as unknown as ModelConfigStore,
      player: PLAYER,
      snapshot: snapshotWithBeats([
        { description: 'Done.', id: 'done', status: 'succeeded', title: 'Done' },
      ]),
      templateManager: {} as unknown as PromptTemplateManager,
    });

    expect(changed).toBe(false);
    expect(generateStructured).not.toHaveBeenCalled();
    expect(finalizeBeats).not.toHaveBeenCalled();
  });

  it('judges each open beat and applies the dispositions', async () => {
    const finalizeBeats = vi.fn().mockResolvedValue(true);
    const generateStructured = vi.fn().mockResolvedValue({
      data: {
        dispositions: [
          { beatId: 'find_the_cat', reason: 'Whiskers came home.', status: 'succeeded' },
        ],
      },
    });

    const changed = await reconcileOpenBeats({
      chronicleStore: { finalizeBeats } as unknown as ChronicleStore,
      llm: { generateStructured } as unknown as RetryLLMClient,
      modelConfigStore: {
        getModelForCategory: vi.fn().mockResolvedValue('gpt-5.6-luna'),
      } as unknown as ModelConfigStore,
      player: PLAYER,
      snapshot: snapshotWithBeats([
        {
          createdAt: 1,
          description: 'Find the cat.',
          id: 'find_the_cat',
          status: 'in_progress',
          title: 'Find the Cat',
          updatedAt: 1,
        },
      ]),
      templateManager: {
        resolveTemplate: vi
          .fn()
          .mockResolvedValue({ body: 'instructions', variantId: 'official' }),
      } as unknown as PromptTemplateManager,
    });

    expect(changed).toBe(true);
    expect(finalizeBeats).toHaveBeenCalledWith({
      chronicleId: CHRONICLE_ID,
      dispositions: [{ beatId: 'find_the_cat', status: 'succeeded' }],
    });
  });
});
