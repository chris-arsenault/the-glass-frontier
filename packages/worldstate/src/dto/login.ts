import { z } from 'zod';

export const LoginMetadataSchema = z.record(z.string(), z.unknown());

export const LoginSchema = z.object({
  id: z.string().min(1),
  loginName: z.string().min(1),
  email: z.string().email().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().optional(),
  metadata: LoginMetadataSchema.optional(),
});

export type Login = z.infer<typeof LoginSchema>;
