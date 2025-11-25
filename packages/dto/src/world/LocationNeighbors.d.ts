import { z } from 'zod';
export declare const LocationNeighbor: z.ZodObject<{
    direction: z.ZodEnum<{
        out: "out";
        in: "in";
    }>;
    hops: z.ZodDefault<z.ZodUnion<readonly [z.ZodLiteral<1>, z.ZodLiteral<2>]>>;
    neighbor: z.ZodObject<{
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
    relationship: z.ZodString;
    via: z.ZodOptional<z.ZodObject<{
        direction: z.ZodEnum<{
            out: "out";
            in: "in";
        }>;
        id: z.ZodString;
        relationship: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const LocationNeighbors: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodArray<z.ZodObject<{
    direction: z.ZodEnum<{
        out: "out";
        in: "in";
    }>;
    hops: z.ZodDefault<z.ZodUnion<readonly [z.ZodLiteral<1>, z.ZodLiteral<2>]>>;
    neighbor: z.ZodObject<{
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
    relationship: z.ZodString;
    via: z.ZodOptional<z.ZodObject<{
        direction: z.ZodEnum<{
            out: "out";
            in: "in";
        }>;
        id: z.ZodString;
        relationship: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>>>>;
export type LocationNeighbor = z.infer<typeof LocationNeighbor>;
export type LocationNeighbors = z.infer<typeof LocationNeighbors>;
