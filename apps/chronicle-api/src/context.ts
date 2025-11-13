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
import { ChronicleSeedService } from './services/chronicleSeedService';

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
if (typeof templateBucket !== 'string' || templateBucket.trim().length === 0) {
  throw new Error('PROMPT_TEMPLATE_BUCKET must be configured for the narrative service');
}
const templateManager = new PromptTemplateManager({
  bucket: templateBucket.trim(),
  worldStateStore,
});
const seedService = new ChronicleSeedService({
  locationGraphStore,
  templateManager,
});
const engine = new NarrativeEngine({
  imbuedRegistryStore,
  locationGraphStore,
  templateManager,
  worldStateStore,
});

export type Context = {
  worldStateStore: WorldStateStore;
  locationGraphStore: LocationGraphStore;
  imbuedRegistryStore: ImbuedRegistryStore;
  engine: NarrativeEngine;
  templateManager: PromptTemplateManager;
  seedService: ChronicleSeedService;
  authorizationHeader?: string;
};

export function createContext(options?: { authorizationHeader?: string }): Context {
  return {
    authorizationHeader: options?.authorizationHeader,
    engine,
    imbuedRegistryStore,
    locationGraphStore,
    seedService,
    templateManager,
    worldStateStore,
  };
}

// export type Context = Awaited<ReturnType<typeof createContext>>;
