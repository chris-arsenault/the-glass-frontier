import { z } from 'zod';

import { HardStateKind, HardStateStatus, HardStateSubkind } from './HardState';

export const WorldKind = z.object({
  id: HardStateKind,
  category: z.string().optional(),
  displayName: z.string().optional(),
  defaultStatus: HardStateStatus.optional(),
  subkinds: z.array(HardStateSubkind).default([]),
  statuses: z.array(HardStateStatus).default([]),
});
export type WorldKind = z.infer<typeof WorldKind>;

export const WorldRelationshipType = z.object({
  id: z.string().min(1),
  description: z.string().optional(),
});
export type WorldRelationshipType = z.infer<typeof WorldRelationshipType>;

export const WorldRelationshipRule = z.object({
  relationshipId: z.string().min(1),
  srcKind: HardStateKind,
  dstKind: HardStateKind,
});
export type WorldRelationshipRule = z.infer<typeof WorldRelationshipRule>;

export const WorldSchema = z.object({
  kinds: z.array(WorldKind),
  relationshipTypes: z.array(WorldRelationshipType),
  relationshipRules: z.array(WorldRelationshipRule),
});
export type WorldSchema = z.infer<typeof WorldSchema>;
