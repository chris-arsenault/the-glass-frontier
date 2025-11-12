import { z } from 'zod';

export const Metadata = z.object({
  tags: z.array(z.string()).default([]),
  timestamp: z
    .number()
    .int()
    .nonnegative()
    .default(() => Date.now()),
});

export type Metadata = z.infer<typeof Metadata>;
