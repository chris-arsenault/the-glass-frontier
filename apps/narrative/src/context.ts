// context.ts
import { createWorldStateStore, type WorldStateStore } from "@glass-frontier/persistence";
import { NarrativeEngine } from "./narrativeEngine";

const worldStateStore = createWorldStateStore({
  bucket: process.env.NARRATIVE_S3_BUCKET,
  prefix: process.env.NARRATIVE_S3_PREFIX ?? undefined
});
const engine = new NarrativeEngine({ worldStateStore });

export type Context = {
  worldStateStore: WorldStateStore;
  engine: NarrativeEngine;
  authorizationHeader?: string;
};

export async function createContext(options?: { authorizationHeader?: string }): Promise<Context> {
  return { worldStateStore, engine, authorizationHeader: options?.authorizationHeader };
}

// export type Context = Awaited<ReturnType<typeof createContext>>;
