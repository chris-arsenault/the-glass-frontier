import { z } from 'zod';

import {
  HardStateKind,
  HardStateStatus,
  HardStateSubkind,
} from '../world/HardState';

export const EntityAvailability = z.enum([
  'anchor',
  'location',
  'scene',
  'recent',
  'connected',
]);
export type EntityAvailability = z.infer<typeof EntityAvailability>;

/** Public entity data shared by the chronicle UI and persisted turn history. */
export const EntityRosterEntry = z.object({
  availability: z.array(EntityAvailability).min(1),
  description: z.string().optional(),
  id: z.string().min(1),
  kind: HardStateKind,
  name: z.string().min(1),
  slug: z.string().min(1),
  status: HardStateStatus.optional(),
  subkind: HardStateSubkind.optional(),
});
export type EntityRosterEntry = z.infer<typeof EntityRosterEntry>;

/** The stable set of established entities available in the current scene. */
export const EntityRosterState = z.object({
  entries: z.array(EntityRosterEntry).max(8).default([]),
  locationName: z.string().min(1).nullable().default(null),
  sceneId: z.string().min(1).nullable().default(null),
  updatedAtTurn: z.number().int().nonnegative().default(0),
});
export type EntityRosterState = z.infer<typeof EntityRosterState>;

export const EntityReferenceSpan = z.object({
  end: z.number().int().positive(),
  start: z.number().int().nonnegative(),
  text: z.string().min(1),
}).refine((span) => span.end > span.start, {
  message: 'Entity reference end must follow its start',
});
export type EntityReferenceSpan = z.infer<typeof EntityReferenceSpan>;

/** A resolved mention in player or GM transcript text. */
export const EntityReference = z.object({
  confidence: z.number().min(0).max(1),
  entityId: z.string().min(1),
  entitySlug: z.string().min(1),
  method: z.enum(['explicit', 'exact', 'semantic']),
  span: EntityReferenceSpan.nullable(),
  speaker: z.enum(['player', 'gm']),
  transcriptEntryId: z.string().min(1),
});
export type EntityReference = z.infer<typeof EntityReference>;

export const EntityUsageEntry = z.object({
  emergentTags: z.array(z.string()).nullable(),
  entityId: z.string().min(1),
  entitySlug: z.string().min(1),
  tags: z.array(z.string()),
  usage: z.enum(['unused', 'mentioned', 'central']),
});
export type EntityUsageEntry = z.infer<typeof EntityUsageEntry>;
