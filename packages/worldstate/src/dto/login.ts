import { z } from 'zod';

import { MetadataSchema } from './shared';

export const LoginSchema = z.object({
  id: z.string().min(1),
  loginName: z.string().min(1),
  email: z.string().email().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().optional(),
  metadata: MetadataSchema.optional(),
});

export type Login = z.infer<typeof LoginSchema>;
