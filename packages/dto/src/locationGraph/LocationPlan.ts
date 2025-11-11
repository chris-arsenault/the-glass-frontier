import { z } from "zod";
import { LocationCertainty } from "./LocationState";
import { LocationEdgeKind } from "./Edge";

export const LocationPlanPlace = z.object({
  temp_id: z.string().min(1),
  name: z.string().min(1),
  kind: z.string().min(1),
  tags: z.array(z.string()).default([]),
  description: z.string().optional()
});

export const LocationPlanEdge = z.object({
  src: z.string().min(1),
  dst: z.string().min(1),
  kind: LocationEdgeKind
});

export const LocationPlanOp = z.discriminatedUnion("op", [
  z.object({ op: z.literal("NO_CHANGE") }),
  z.object({ op: z.literal("CREATE_PLACE"), place: LocationPlanPlace }),
  z.object({ op: z.literal("CREATE_EDGE"), edge: LocationPlanEdge }),
  z.object({ op: z.literal("MOVE"), dst_place_id: z.string().min(1) }),
  z.object({ op: z.literal("ENTER"), dst_place_id: z.string().min(1) }),
  z.object({ op: z.literal("EXIT"), src_place_id: z.string().min(1) }),
  z.object({ op: z.literal("SET_STATUS"), status: z.array(z.string()) }),
  z.object({
    op: z.literal("SET_CERTAINTY"),
    certainty: LocationCertainty,
    note: z.string().optional()
  })
]);

export const LocationPlan = z.object({
  character_id: z.string().min(1),
  ops: z.array(LocationPlanOp),
  notes: z.string().optional()
});

export type LocationPlan = z.infer<typeof LocationPlan>;
export type LocationPlanOp = z.infer<typeof LocationPlanOp>;
