import { createLocationStore } from '@glass-frontier/worldstate';
import type { LocationStore } from '@glass-frontier/worldstate';

const worldstateDatabaseUrl = process.env.GLASS_FRONTIER_DATABASE_URL;
if (typeof worldstateDatabaseUrl !== 'string' || worldstateDatabaseUrl.trim().length === 0) {
  throw new Error('GLASS_FRONTIER_DATABASE_URL must be configured for the location API.');
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
