import { z } from "zod"

export const Metadata = z.object({
  timestamp: z.number().int().nonnegative().default(() => Date.now()),
  tags: z.array(z.string()).default([]),
});

export type Metadata = z.infer<typeof Metadata>;