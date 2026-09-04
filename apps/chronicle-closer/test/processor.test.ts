import type { ModelConfigStore, PromptTemplateManager } from '@glass-frontier/app';
import type { Character, Chronicle, ChronicleClosureEvent } from '@glass-frontier/dto';
import type { RetryLLMClient } from '@glass-frontier/llm-client';
import type { ChronicleStore, WorldSchemaStore } from '@glass-frontier/worldstate';
import { describe, expect, it, vi } from 'vitest';

import { ChronicleClosureProcessor } from '../src/processor';
import {
  buildCharacterImpactPrompt,
  buildChronicleStoryPrompt,
  NO_LASTING_CHARACTER_CHANGE,
} from '../src/summaryHelpers';

const character: Character = {
  archetype: 'Musician',
  attributes: {
    attunement: 'standard',
    finesse: 'standard',
    focus: 'standard',
    ingenuity: 'standard',
    presence: 'standard',
    resolve: 'standard',
    vitality: 'standard',
  },
  bio: 'A travelling musician.',
  id: 'character-1',
  inventory: [],
  momentum: { ceiling: 3, current: 0, floor: -2 },
  name: 'Tsonu',
  nature: {
    callings: ['performer', 'wanderer'],
    drive: 'To be heard',
    flaw: 'Restless',
    instinct: 'Play through it',
    uniqueThing: 'Carries a glass flute',
  },
  origin: {
    allegianceId: '00000000-0000-0000-0000-000000000001',
    allegianceStance: 'member',
    cultureReferenceId: '00000000-0000-0000-0000-000000000002',
    homelandId: '00000000-0000-0000-0000-000000000003',
    speciesReferenceId: '00000000-0000-0000-0000-000000000004',
  },
  playerId: 'player-1',
  pronouns: 'they/them',
  skills: {},
  tags: [],
};

const chronicle: Chronicle = {
  activeScene: null,
  characterId: character.id,
  entityFocus: { entityScores: {}, tagScores: {} },
  entityRoster: {
    entries: [],
    locationName: 'Brake',
    sceneId: null,
    updatedAtTurn: 0,
  },
  focusedThreadId: null,
  id: 'chronicle-1',
  localContinuity: null,
  locationName: 'Brake',
  openingReferenceSlugs: [],
  openingText: 'You wait on Brake as the quartet tunes.',
  playerId: character.playerId,
  status: 'closed',
  summaries: [],
  threads: [],
  title: 'Quarantine Quartet',
  toneChips: [],
  toneNotes: '',
};

const event: ChronicleClosureEvent = {
  characterId: character.id,
  chronicleId: chronicle.id,
  locationName: chronicle.locationName,
  playerId: chronicle.playerId,
  playerIsAdmin: false,
  playerName: 'tsonu',
  requestedAt: 1,
  summaryKinds: ['character_bio'],
  turnSequence: 0,
};

describe('ChronicleClosureProcessor', () => {
  it('treats the final location and recorded timeline as fixed closure facts', () => {
    const context = {
      character,
      chronicle,
      inventoryHighlights: [],
      locationName: chronicle.locationName,
      skillHighlights: [],
      threadLines: [],
      transcript: 'Player: I remain on Brake and end the performance.',
    };

    expect(buildChronicleStoryPrompt(context)).toContain(
      'This is the final scene location, not a destination.'
    );
    expect(buildChronicleStoryPrompt(context)).toContain(
      'Preserve the player\'s explicit decisions and chronology.'
    );
    expect(buildCharacterImpactPrompt(context)).toContain(
      `return exactly ${NO_LASTING_CHARACTER_CHANGE}`
    );
    expect(buildCharacterImpactPrompt(context)).toContain(
      'Existing character sheet — everything here was already true before this chronicle:'
    );
    expect(buildCharacterImpactPrompt(context)).toContain('attunement: standard');
  });

  it('records no lasting change without appending fabricated character history', async () => {
    const commitClosureSummary = vi.fn().mockResolvedValue(true);
    const generate = vi.fn().mockResolvedValue({
      message: NO_LASTING_CHARACTER_CHANGE,
      providerId: 'openai',
      requestId: 'request-1',
    });
    const processor = new ChronicleClosureProcessor({
      chronicleStore: {
        commitClosureSummary,
        getChronicleState: vi.fn().mockResolvedValue({
          character,
          chronicle,
          chronicleId: chronicle.id,
          locationName: chronicle.locationName,
          turns: [],
          turnSequence: 0,
        }),
      } as unknown as ChronicleStore,
      llmClient: { generate } as unknown as RetryLLMClient,
      modelConfigStore: {
        getModelForCategory: vi.fn().mockResolvedValue('gpt-5.6-luna'),
      } as unknown as ModelConfigStore,
      templateManager: {} as unknown as PromptTemplateManager,
      worldStore: {
        findBatch: vi.fn().mockResolvedValue({ batchId: 'batch-1' }),
      } as unknown as WorldSchemaStore,
    });

    await processor.process(event);

    expect(commitClosureSummary).toHaveBeenCalledOnce();
    const recordedInput = commitClosureSummary.mock.calls[0]?.[0] as
      Parameters<ChronicleStore['commitClosureSummary']>[0];
    expect(recordedInput.character).toBeUndefined();
    expect(recordedInput.entry.summary).toBe('No lasting character change was recorded.');
  });
});
