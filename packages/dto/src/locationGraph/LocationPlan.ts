import { z } from 'zod';

import { LocationEdgeKind } from './Edge';
import { LocationCertainty } from './LocationState';

export const LocationPlanPlace = z.object({
  description: z.string().optional(),
  kind: z.string().min(1),
  name: z.string().min(1),
  tags: z.array(z.string()).default([]),
  temp_id: z.string().min(1),
});

export const LocationPlanEdge = z.object({
  dst: z.string().min(1),
  kind: LocationEdgeKind,
  src: z.string().min(1),
});

export const LocationPlanOp = z.discriminatedUnion('op', [
  z.object({ op: z.literal('NO_CHANGE') }),
  z.object({ op: z.literal('CREATE_PLACE'), place: LocationPlanPlace }),
  z.object({ edge: LocationPlanEdge, op: z.literal('CREATE_EDGE') }),
  z.object({ dst_place_id: z.string().min(1), op: z.literal('MOVE') }),
  z.object({ dst_place_id: z.string().min(1), op: z.literal('ENTER') }),
  z.object({ op: z.literal('EXIT'), src_place_id: z.string().min(1) }),
  z.object({ op: z.literal('SET_STATUS'), status: z.array(z.string()) }),
  z.object({
    certainty: LocationCertainty,
    note: z.string().optional(),
    op: z.literal('SET_CERTAINTY'),
  }),
]);

export const LocationPlan = z.object({
  characterId: z.string().min(1),
  notes: z.string().optional(),
  ops: z.array(LocationPlanOp),
});

export type LocationPlan = z.infer<typeof LocationPlan>;
export type LocationPlanOp = z.infer<typeof LocationPlanOp>;
export type LocationPlanPlace = z.infer<typeof LocationPlanPlace>;
export type LocationPlanEdge = z.infer<typeof LocationPlanEdge>;
