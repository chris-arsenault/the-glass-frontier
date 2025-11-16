import { z } from 'zod';

export const MetadataSchema = z.record(z.string(), z.unknown()).default({});
export type Metadata = z.infer<typeof MetadataSchema>;

export const TagArraySchema = z.array(z.string().min(1)).default([]);
