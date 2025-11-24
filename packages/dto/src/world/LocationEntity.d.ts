import { z } from 'zod';
/**
 * LocationEntity represents a location in the world.
 * This consolidates the previous LocationEntity and LocationEntity types.
 */
export declare const LocationEntity: z.ZodObject<{
    id: z.ZodString;
    slug: z.ZodString;
    name: z.ZodString;
    kind: z.ZodLiteral<"location">;
    subkind: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    prominence: z.ZodDefault<z.ZodEnum<{
        forgotten: "forgotten";
        marginal: "marginal";
        recognized: "recognized";
        renowned: "renowned";
        mythic: "mythic";
    }>>;
    status: z.ZodOptional<z.ZodString>;
    tags: z.ZodDefault<z.ZodArray<z.ZodString>>;
    createdAt: z.ZodNumber;
    updatedAt: z.ZodNumber;
}, z.core.$strip>;
export type LocationEntity = z.infer<typeof LocationEntity>;
