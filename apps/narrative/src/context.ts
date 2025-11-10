// context.ts
import {InMemorySessionStore, SessionStore} from "./services/SessionStore";
import {NarrativeEngine} from "./narrativeEngine";

const sessionStore = new InMemorySessionStore()
const engine = new NarrativeEngine({sessionStore: sessionStore});

export type Context = {
  sessionStore: SessionStore;
  engine: NarrativeEngine;
};

export async function createContext(): Promise<Context> {
  return { sessionStore, engine };
}

// export type Context = Awaited<ReturnType<typeof createContext>>;
