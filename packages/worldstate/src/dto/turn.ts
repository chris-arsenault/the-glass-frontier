import { z } from 'zod';

export const TurnSchema = z.object({
  id: z.string().min(1),
  chronicleId: z.string().min(1),
  turnSequence: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  playerMessage: z.string().optional(),
  gmMessage: z.string().optional(),
  gmSummary: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  payload: z.unknown().optional(),
});

export type Turn = z.infer<typeof TurnSchema>;

export const TurnSummarySchema = z.object({
  turnId: z.string().min(1),
  turnSequence: z.number().int().nonnegative(),
  summary: z.string().min(1),
  createdAt: z.string().datetime(),
});

export type TurnSummary = z.infer<typeof TurnSummarySchema>;

export const TurnChunkSchema = z.object({
  chronicleId: z.string().min(1),
  chunkIndex: z.number().int().nonnegative(),
  startSequence: z.number().int().nonnegative(),
  endSequence: z.number().int().nonnegative(),
  turns: z.array(TurnSchema),
  updatedAt: z.string().datetime(),
});

export type TurnChunk = z.infer<typeof TurnChunkSchema>;

export const TurnChunkManifestEntrySchema = z.object({
  chunkIndex: z.number().int().nonnegative(),
  startSequence: z.number().int().nonnegative(),
  endSequence: z.number().int().nonnegative(),
  chunkKey: z.string().min(1),
  turnCount: z.number().int().nonnegative(),
  updatedAt: z.string().datetime(),
});

export type TurnChunkManifestEntry = z.infer<typeof TurnChunkManifestEntrySchema>;

export const TurnChunkManifestSchema = z.object({
  chronicleId: z.string().min(1),
  chunkSize: z.number().int().positive(),
  entries: z.array(TurnChunkManifestEntrySchema),
  latestSequence: z.number().int().nonnegative().default(0),
  updatedAt: z.string().datetime(),
});

export type TurnChunkManifest = z.infer<typeof TurnChunkManifestSchema>;
