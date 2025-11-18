import { randomUUID } from 'node:crypto';

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
  await ctx.worldStateStore.upsertCharacter(character);
  await ctx.worldStateStore.deleteChronicle(chronicle.id);
  await ctx.worldStateStore.upsertChronicle(chronicle);

  await seedPlaywrightLocationGraph(ctx.locationGraphStore, {
    characterId: character.id,
    locationId,
  });

  return { locationId };
};
