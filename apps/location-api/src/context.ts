import { createLocationGraphStore } from '@glass-frontier/persistence';
import type { LocationGraphStore } from '@glass-frontier/persistence';

const locationGraphStore = createLocationGraphStore({
  bucket: process.env.NARRATIVE_S3_BUCKET,
  indexTable: process.env.LOCATION_GRAPH_DDB_TABLE,
  prefix: process.env.NARRATIVE_S3_PREFIX ?? undefined,
});

export type Context = {
  locationGraphStore: LocationGraphStore;
  authorizationHeader?: string;
};

export function createContext(options?: { authorizationHeader?: string }): Context {
  return {
    authorizationHeader: options?.authorizationHeader,
    locationGraphStore,
  };
}
