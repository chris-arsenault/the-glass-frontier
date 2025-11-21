import { createLocationStore } from '@glass-frontier/worldstate';
import type { LocationStore } from '@glass-frontier/worldstate';

const worldstateDatabaseUrl = process.env.WORLDSTATE_DATABASE_URL ?? process.env.DATABASE_URL;
if (typeof worldstateDatabaseUrl !== 'string' || worldstateDatabaseUrl.trim().length === 0) {
  throw new Error('WORLDSTATE_DATABASE_URL must be configured for the location API.');
}

const locationGraphStore = createLocationStore({
  connectionString: worldstateDatabaseUrl,
});

export type Context = {
  locationGraphStore: LocationStore;
  authorizationHeader?: string;
};

export function createContext(options?: { authorizationHeader?: string }): Context {
  return {
    authorizationHeader: options?.authorizationHeader,
    locationGraphStore,
  };
}
