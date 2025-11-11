// context.ts
import {
  createWorldStateStore,
  createLocationGraphStore,
  type WorldStateStore,
  type LocationGraphStore
} from "@glass-frontier/persistence";
import { NarrativeEngine } from "./narrativeEngine";

const worldStateStore = createWorldStateStore({
  bucket: process.env.NARRATIVE_S3_BUCKET,
  prefix: process.env.NARRATIVE_S3_PREFIX ?? undefined
});
const locationGraphStore = createLocationGraphStore({
  bucket: process.env.NARRATIVE_S3_BUCKET,
  prefix: process.env.NARRATIVE_S3_PREFIX ?? undefined
});
const engine = new NarrativeEngine({ worldStateStore, locationGraphStore });

export type Context = {
  worldStateStore: WorldStateStore;
  locationGraphStore: LocationGraphStore;
  engine: NarrativeEngine;
  authorizationHeader?: string;
};

export async function createContext(options?: { authorizationHeader?: string }): Promise<Context> {
  return {
    worldStateStore,
    locationGraphStore,
    engine,
    authorizationHeader: options?.authorizationHeader
  };
}

// export type Context = Awaited<ReturnType<typeof createContext>>;
