import { z } from "zod";

export const LocationEdgeKind = z.enum(["CONTAINS", "ADJACENT_TO", "DOCKED_TO", "LINKS_TO"]);

export const LocationEdge = z.object({
  chronicleId: z.string().min(1),
  src: z.string().min(1),
  dst: z.string().min(1),
  kind: LocationEdgeKind,
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.number().int().nonnegative().default(() => Date.now())
});

export type LocationEdgeKind = z.infer<typeof LocationEdgeKind>;
export type LocationEdge = z.infer<typeof LocationEdge>;
