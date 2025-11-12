import { z } from 'zod';

import { Metadata } from './Metadata';

export const Login = z.object({
  email: z.string().email().optional(),
  id: z.string().min(1),
  loginName: z.string().min(1),
  metadata: Metadata.optional(),
});

export type Login = z.infer<typeof Login>;
