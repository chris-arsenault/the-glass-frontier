import { z } from 'zod';

import { LocationCertainty } from './LocationState';

export const LocationBreadcrumbEntry = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  name: z.string().min(1),
});

export const LocationSummary = z.object({
  anchorPlaceId: z.string().min(1),
  breadcrumb: z.array(LocationBreadcrumbEntry).nonempty(),
  certainty: LocationCertainty,
  description: z.string().optional(),
  slug: z.string().min(1).optional(),
  status: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
});

export type LocationSummary = z.infer<typeof LocationSummary>;
export type LocationBreadcrumbEntry = z.infer<typeof LocationBreadcrumbEntry>;
