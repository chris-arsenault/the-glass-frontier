import { randomUUID } from 'node:crypto';

import type { Player } from '@glass-frontier/dto';

import type { Context } from '../context';
import {
  buildPlaywrightCharacterRecord,
  buildPlaywrightChronicleRecord,
  buildPlaywrightLoginRecord,
  seedPlaywrightLocationGraph,
} from './fixtures';

export const resetPlaywrightFixtures = async (ctx: Context): Promise<{ locationId: string }> => {
  const login = buildPlaywrightLoginRecord();
  const character = buildPlaywrightCharacterRecord();
  const locationId = randomUUID();
  const chronicle = buildPlaywrightChronicleRecord({ locationId });

  await ctx.worldStateStore.upsertLogin(login);
  await ctx.worldStateStore.createCharacter(character);
  await ctx.worldStateStore.deleteChronicle(chronicle.id);
  await ctx.worldStateStore.createChronicle(chronicle);

  await seedPlaywrightLocationGraph(ctx.worldStateStore, {
    loginId: login.id,
    chronicleId: chronicle.id,
    locationId,
  });

  const defaultPlayerRecord: Player = {
    loginId: login.id,
    preferences: {
      feedbackVisibility: 'all',
    },
    templateOverrides: {},
  };
  await ctx.playerStore.upsertPlayer(defaultPlayerRecord);

  return { locationId };
};
