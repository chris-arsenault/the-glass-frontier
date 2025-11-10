import { z } from "zod";
import { Metadata } from "./Metadata";

export const LocationProfile = z.object({
  id: z.string().min(1),
  locale: z.string().min(1),
  atmosphere: z.string().optional(),
  description: z.string().optional(),
  metadata: Metadata.optional()
});

export type LocationProfile = z.infer<typeof LocationProfile>;
