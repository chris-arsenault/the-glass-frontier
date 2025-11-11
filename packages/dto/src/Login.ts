import { z } from 'zod';
import { Metadata } from './Metadata';

export const Login = z.object({
  id: z.string().min(1),
  loginName: z.string().min(1),
  email: z.string().email().optional(),
  metadata: Metadata.optional(),
});

export type Login = z.infer<typeof Login>;
