import { z } from 'zod';

import { Metadata } from '../Metadata';

export const TranscriptEntry = z.object({
  content: z.string().min(1),
  id: z.string().min(1), // use .uuid() if you enforce UUIDs
  metadata: Metadata,
  role: z.enum(['player', 'gm', 'system']),
});
export type TranscriptEntry = z.infer<typeof TranscriptEntry>;
