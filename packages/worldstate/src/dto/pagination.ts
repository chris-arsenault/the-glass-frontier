import { z } from 'zod';

export const PageOptionsSchema = z.object({
  limit: z.number().int().positive().max(500).optional(),
  cursor: z.string().min(1).optional(),
});

export type PageOptions = z.infer<typeof PageOptionsSchema>;

export type Connection<T> = {
  items: T[];
  nextCursor?: string;
};
