// context.ts
import { InMemoryWorldDataStore, type WorldDataStore } from "./services/WorldDataStore";
import { S3WorldDataStore } from "./services/S3WorldDataStore";
import { NarrativeEngine } from "./narrativeEngine";

function createWorldDataStore(): WorldDataStore {
  const bucket = process.env.NARRATIVE_S3_BUCKET;
  if (!bucket) {
    return new InMemoryWorldDataStore();
  }
  return new S3WorldDataStore({
    bucket,
    prefix: process.env.NARRATIVE_S3_PREFIX
  });
}

const worldDataStore = createWorldDataStore();
const engine = new NarrativeEngine({ worldDataStore });

export type Context = {
  worldDataStore: WorldDataStore;
  engine: NarrativeEngine;
  authorizationHeader?: string;
};

export async function createContext(options?: { authorizationHeader?: string }): Promise<Context> {
  return { worldDataStore, engine, authorizationHeader: options?.authorizationHeader };
}

// export type Context = Awaited<ReturnType<typeof createContext>>;
