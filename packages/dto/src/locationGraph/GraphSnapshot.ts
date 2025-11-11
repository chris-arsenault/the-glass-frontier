import { z } from "zod";
import { LocationPlace } from "./Place";
import { LocationEdge } from "./Edge";

export const LocationGraphSnapshot = z.object({
  chronicleId: z.string().min(1),
  places: z.array(LocationPlace),
  edges: z.array(LocationEdge)
});

export type LocationGraphSnapshot = z.infer<typeof LocationGraphSnapshot>;
