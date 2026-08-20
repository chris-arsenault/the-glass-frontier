import { z } from 'zod';

import { HardStateKind, HardStateStatus, HardStateSubkind } from './HardState';

export const WorldKind = z.object({
  category: z.string().optional(),
  defaultStatus: HardStateStatus.optional(),
  displayName: z.string().optional(),
  id: HardStateKind,
  statuses: z.array(HardStateStatus).default([]),
  subkinds: z.array(HardStateSubkind).default([]),
});
export type WorldKind = z.infer<typeof WorldKind>;

export const WorldRelationshipType = z.object({
  description: z.string().optional(),
  id: z.string().min(1),
});
export type WorldRelationshipType = z.infer<typeof WorldRelationshipType>;

export const WorldRelationshipRule = z.object({
  dstKind: HardStateKind,
  relationshipId: z.string().min(1),
  srcKind: HardStateKind,
});
export type WorldRelationshipRule = z.infer<typeof WorldRelationshipRule>;

export const WorldSchema = z.object({
  kinds: z.array(WorldKind),
  relationshipRules: z.array(WorldRelationshipRule),
  relationshipTypes: z.array(WorldRelationshipType),
});
export type WorldSchema = z.infer<typeof WorldSchema>;
