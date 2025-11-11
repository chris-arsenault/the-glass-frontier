import { z } from 'zod';
import { LocationCertainty } from './LocationState';

export const LocationBreadcrumbEntry = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.string().min(1),
});

export const LocationSummary = z.object({
  anchorPlaceId: z.string().min(1),
  breadcrumb: z.array(LocationBreadcrumbEntry).nonempty(),
  tags: z.array(z.string()).default([]),
  status: z.array(z.string()).default([]),
  certainty: LocationCertainty,
  description: z.string().optional(),
});

export type LocationSummary = z.infer<typeof LocationSummary>;
export type LocationBreadcrumbEntry = z.infer<typeof LocationBreadcrumbEntry>;
