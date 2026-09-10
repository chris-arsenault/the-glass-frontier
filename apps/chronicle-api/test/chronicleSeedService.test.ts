import type { Character, HardState, PromptTemplateId } from '@glass-frontier/dto';
import type { LLMRequest } from '@glass-frontier/llm-client';
import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';

import { ChronicleSeedService } from '../src/services/chronicleSeedService';

const PLAYER = { id: 'player', isAdmin: false, name: 'Vex' };
const WORLD_THREAD = {
  goal: 'Finish the inspection.', owner: 'The factor', position: 'The crew is assembling.', title: 'Inspection',
};
const CHARACTER = {
  attributes: {}, bio: 'A relay worker.', name: 'Vex', nature: {
    callings: ['Find the missing crew'], drive: 'Bring them home', flaw: 'Impatient',
    instinct: 'Check the exits', uniqueThing: 'Hears the relay',
  },
  origin: {
    allegianceId: 'guild', allegianceStance: 'member', cultureReferenceId: 'culture',
    homelandId: 'home', speciesReferenceId: 'species',
  },
  pronouns: 'they/them', skills: {},
} as unknown as Character;
const PLACE = {
  contextTags: [], description: 'A yard of relay masts.', descriptiveIdentity: {}, facts: {},
  id: 'yard', isLocation: true, kind: 'installation', name: 'Relay Yard',
  playableAs: ['chronicle_location'], slug: 'relay-yard',
} as unknown as HardState;
const SEED = {
  playerGoal: 'Find the missing crew.', tags: ['relay', 'crew'],
  teaser: 'The relay crew missed its return signal. '.repeat(6), title: 'The Missing Crew',
  worldThread: WORLD_THREAD,
};

const setup = (): { service: ChronicleSeedService; requests: LLMRequest[] } => {
  const requests: LLMRequest[] = [];
  const options = {
    encyclopediaStore: {
      findMentionedEntries: () => Promise.resolve([]), getEntryById: () => Promise.resolve(null),
      listApplicable: () => Promise.resolve([]), listClassificationsForEntity: () => Promise.resolve([]),
    },
    llmClient: {
      generate: (request: LLMRequest) => {
        requests.push(request);
        return Promise.resolve({ message: 'You stand beneath the relay as the return signal fades.' });
      },
      generateStructured: (request: LLMRequest) => {
        requests.push(request);
        return Promise.resolve({ data: { seeds: [SEED, SEED, SEED] } });
      },
    },
    modelConfigStore: { getModelForCategory: vi.fn().mockResolvedValue('kimi-k2-thinking') },
    templateManager: {
      resolveTemplate: async (_player: string, id: PromptTemplateId) => ({
        body: await readFile(new URL(`../../../packages/app/templates/${id}.hbs`, import.meta.url), 'utf8'),
        variantId: 'official',
      }),
    },
    worldStore: {
      getEntity: () => Promise.resolve(PLACE), listEntitiesByIds: () => Promise.resolve([]),
      listFocusChoices: () => Promise.resolve([PLACE]), listLoreFragmentsByEntity: () => Promise.resolve([]),
    },
  } as unknown as ConstructorParameters<typeof ChronicleSeedService>[0];
  return { requests, service: new ChronicleSeedService(options) };
};

describe('Chronicle creation requests', () => {
  it('keeps seed and opening lengths in the prompts while providing reasoning headroom', async () => {
    const { requests, service } = setup();
    const seeds = await service.generateSeeds({
      anchorId: PLACE.id, character: CHARACTER, locationId: PLACE.id,
      player: PLAYER, playerId: PLAYER.id,
    });
    const opening = await service.generateOpening({
      anchorId: PLACE.id, character: CHARACTER, chronicleId: 'new-chronicle', locationId: PLACE.id,
      player: PLAYER, playerGoal: SEED.playerGoal, playerId: PLAYER.id,
      seedText: SEED.teaser, title: SEED.title, worldThread: WORLD_THREAD,
    });
    expect(seeds).toHaveLength(3);
    expect(seeds[0]?.worldThread).toEqual(WORLD_THREAD);
    expect(opening.text).toContain('return signal');
    expect(requests.map((request) => request.maxOutputTokens)).toEqual([16_000, 16_000]);
    expect(requests[0]?.instructions).toContain('200-800 characters');
    expect(requests[0]?.instructions).toContain('calling SeedArray');
    expect(requests[1]?.instructions).toContain('80–160 words');
    const text = JSON.stringify(requests[1]?.input);
    expect(text).toContain(SEED.playerGoal);
    expect(text).toContain(WORLD_THREAD.position);
    expect(text).toContain('Relay Yard');
  });
});
