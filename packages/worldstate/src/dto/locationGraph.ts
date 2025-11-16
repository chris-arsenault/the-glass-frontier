import { z } from 'zod';

import { LocationEdgeKindSchema } from './locationCommon';
import { MetadataSchema, TagArraySchema } from './shared';

export const LocationPlaceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.string().min(1),
  description: z.string().optional(),
  metadata: MetadataSchema.optional(),
  tags: TagArraySchema,
});

export type LocationPlace = z.infer<typeof LocationPlaceSchema>;

export const LocationEdgeSchema = z.object({
  id: z.string().min(1).optional(),
  src: z.string().min(1),
  dst: z.string().min(1),
  kind: LocationEdgeKindSchema,
  metadata: MetadataSchema.optional(),
});

export type LocationEdge = z.infer<typeof LocationEdgeSchema>;

export const LocationGraphSnapshotSchema = z.object({
  locationId: z.string().min(1),
  places: z.array(LocationPlaceSchema),
  edges: z.array(LocationEdgeSchema),
});

export type LocationGraphSnapshot = z.infer<typeof LocationGraphSnapshotSchema>;

export const LocationGraphChunkSchema = z.object({
  locationId: z.string().min(1),
  chunkIndex: z.number().int().nonnegative(),
  nodeStart: z.number().int().nonnegative(),
  nodeCount: z.number().int().nonnegative(),
  edgeCount: z.number().int().nonnegative(),
  places: z.array(LocationPlaceSchema),
  edges: z.array(LocationEdgeSchema),
  updatedAt: z.string().datetime(),
});

export type LocationGraphChunk = z.infer<typeof LocationGraphChunkSchema>;

export const LocationGraphManifestEntrySchema = z.object({
  chunkIndex: z.number().int().nonnegative(),
  nodeStart: z.number().int().nonnegative(),
  nodeCount: z.number().int().nonnegative(),
  edgeCount: z.number().int().nonnegative(),
  chunkKey: z.string().min(1),
  updatedAt: z.string().datetime(),
});

export type LocationGraphManifestEntry = z.infer<typeof LocationGraphManifestEntrySchema>;

export const LocationGraphManifestSchema = z.object({
  locationId: z.string().min(1),
  chunkSize: z.number().int().positive(),
  entries: z.array(LocationGraphManifestEntrySchema),
  updatedAt: z.string().datetime(),
});

export type LocationGraphManifest = z.infer<typeof LocationGraphManifestSchema>;
