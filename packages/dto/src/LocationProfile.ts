import { z } from "zod";

export const LocationProfile = z.object({
  locale: z.string().optional(),
  atmosphere: z.string().optional()
});

export type LocationProfile = z.infer<typeof LocationProfile>;
