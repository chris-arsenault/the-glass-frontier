// context.ts
import {
  createWorldStateStore,
  createLocationGraphStore,
  createImbuedRegistryStore,
  type WorldStateStore,
  type LocationGraphStore,
  type ImbuedRegistryStore,
  PromptTemplateManager,
} from '@glass-frontier/persistence';
import { NarrativeEngine } from './narrativeEngine';

const worldStateStore = createWorldStateStore({
  bucket: process.env.NARRATIVE_S3_BUCKET,
  prefix: process.env.NARRATIVE_S3_PREFIX ?? undefined,
});
const locationGraphStore = createLocationGraphStore({
  bucket: process.env.NARRATIVE_S3_BUCKET,
  prefix: process.env.NARRATIVE_S3_PREFIX ?? undefined,
});
const imbuedRegistryStore: ImbuedRegistryStore = createImbuedRegistryStore({
  bucket: process.env.NARRATIVE_S3_BUCKET,
  prefix: process.env.NARRATIVE_S3_PREFIX ?? undefined,
});
const templateBucket = process.env.PROMPT_TEMPLATE_BUCKET;
if (!templateBucket) {
  throw new Error('PROMPT_TEMPLATE_BUCKET must be configured for the narrative service');
}
const templateManager = new PromptTemplateManager({
  bucket: templateBucket,
  worldStateStore,
});
const engine = new NarrativeEngine({
  worldStateStore,
  locationGraphStore,
  imbuedRegistryStore,
  templateManager,
});

export type Context = {
  worldStateStore: WorldStateStore;
  locationGraphStore: LocationGraphStore;
  imbuedRegistryStore: ImbuedRegistryStore;
  engine: NarrativeEngine;
  templateManager: PromptTemplateManager;
  authorizationHeader?: string;
};

export async function createContext(options?: { authorizationHeader?: string }): Promise<Context> {
  return {
    worldStateStore,
    locationGraphStore,
    imbuedRegistryStore,
    engine,
    templateManager,
    authorizationHeader: options?.authorizationHeader,
  };
}

// export type Context = Awaited<ReturnType<typeof createContext>>;
