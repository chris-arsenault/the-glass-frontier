import { z } from 'zod';

import { LocationEdgeKindSchema } from './locationCommon';
import { LocationGraphSnapshotSchema } from './locationGraph';
import { MetadataSchema, TagArraySchema } from './shared';

export const LocationBreadcrumbEntrySchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  name: z.string().min(1),
});

export type LocationBreadcrumbEntry = z.infer<typeof LocationBreadcrumbEntrySchema>;

export const LocationSummarySchema = z.object({
  id: z.string().min(1),
  loginId: z.string().min(1),
  chronicleId: z.string().min(1),
  name: z.string().min(1),
  anchorPlaceId: z.string().min(1),
  breadcrumb: z.array(LocationBreadcrumbEntrySchema).nonempty(),
  description: z.string().optional(),
  status: z.array(z.string().min(1)).default([]),
  tags: TagArraySchema,
  nodeCount: z.number().int().nonnegative().default(0),
  edgeCount: z.number().int().nonnegative().default(0),
  graphChunkCount: z.number().int().nonnegative().default(0),
});

export type LocationSummary = z.infer<typeof LocationSummarySchema>;

export const LocationDraftSchema = LocationSummarySchema.extend({
  id: z.string().uuid().optional(),
  metadata: MetadataSchema.optional(),
  graph: LocationGraphSnapshotSchema.optional(),
});

export type LocationDraft = z.infer<typeof LocationDraftSchema>;

export const LocationPlacePatchSchema = z.object({
  locationId: z.string().min(1),
  placeId: z.string().min(1),
  name: z.string().min(1).optional(),
  kind: z.string().min(1).optional(),
  description: z.string().optional(),
  tags: TagArraySchema.optional(),
});

export type LocationPlacePatch = z.infer<typeof LocationPlacePatchSchema>;

export const LocationPatchSchema = z.object({
  id: z.string().min(1),
  description: z.string().optional(),
  name: z.string().optional(),
  tags: TagArraySchema.optional(),
});

export type LocationPatch = z.infer<typeof LocationPatchSchema>;

export const LocationSchema = LocationSummarySchema.extend({
  metadata: MetadataSchema.optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Location = z.infer<typeof LocationSchema>;

export const LocationStateSchema = z.object({
  characterId: z.string().min(1),
  locationId: z.string().min(1),
  placeId: z.string().min(1),
  certainty: z.number().min(0).max(1).default(1),
  updatedAt: z.string().datetime(),
  metadata: MetadataSchema.optional(),
});

export type LocationState = z.infer<typeof LocationStateSchema>;

export const LocationNeighborSummarySchema = z.object({
  locationId: z.string().min(1),
  placeId: z.string().min(1),
  relationKind: LocationEdgeKindSchema,
  depth: z.number().int().nonnegative().default(0),
  name: z.string().min(1),
  tags: TagArraySchema,
  breadcrumb: z.array(LocationBreadcrumbEntrySchema).nonempty(),
});

export type LocationNeighborSummary = z.infer<typeof LocationNeighborSummarySchema>;
