// context.ts
import { InMemorySessionStore, SessionStore } from "./services/SessionStore";
import { S3SessionStore } from "./services/S3SessionStore";
import { NarrativeEngine } from "./narrativeEngine";

function createSessionStore(): SessionStore {
  const bucket = process.env.NARRATIVE_S3_BUCKET;
  if (!bucket) {
    return new InMemorySessionStore();
  }
  return new S3SessionStore({
    bucket,
    prefix: process.env.NARRATIVE_S3_PREFIX
  });
}

const sessionStore = createSessionStore();
const engine = new NarrativeEngine({ sessionStore });

export type Context = {
  sessionStore: SessionStore;
  engine: NarrativeEngine;
};

export async function createContext(): Promise<Context> {
  return { sessionStore, engine };
}

// export type Context = Awaited<ReturnType<typeof createContext>>;
