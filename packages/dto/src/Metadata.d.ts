import { z } from 'zod';
export declare const Metadata: z.ZodObject<{
    tags: z.ZodDefault<z.ZodArray<z.ZodString>>;
    timestamp: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export type Metadata = z.infer<typeof Metadata>;
