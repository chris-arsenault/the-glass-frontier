import { z } from "zod";

export const LocationCertainty = z.enum(["exact", "bounded", "unknown"]);

export const LocationState = z.object({
  characterId: z.string().min(1),
  chronicleId: z.string().min(1),
  anchorPlaceId: z.string().min(1),
  certainty: LocationCertainty.default("exact"),
  status: z.array(z.string()).default([]),
  note: z.string().optional(),
  updatedAt: z.number().int().nonnegative().default(() => Date.now())
});

export type LocationCertainty = z.infer<typeof LocationCertainty>;
export type LocationState = z.infer<typeof LocationState>;
