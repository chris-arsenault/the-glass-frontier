import { z } from 'zod';
export declare const Intent: z.ZodObject<{
    creativeSpark: z.ZodBoolean;
    handlerHints: z.ZodArray<z.ZodString>;
    beatDirective: z.ZodObject<{
        kind: z.ZodDefault<z.ZodEnum<{
            independent: "independent";
            existing: "existing";
            new: "new";
        }>>;
        summary: z.ZodString;
        targetBeatId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    }, z.core.$strip>;
    intentSummary: z.ZodString;
    intentType: z.ZodEnum<{
        action: "action";
        inquiry: "inquiry";
        clarification: "clarification";
        possibility: "possibility";
        planning: "planning";
        reflection: "reflection";
        wrap: "wrap";
    }>;
    metadata: z.ZodObject<{
        tags: z.ZodDefault<z.ZodArray<z.ZodString>>;
        timestamp: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>;
    routerRationale: z.ZodString;
    tone: z.ZodString;
}, z.core.$strip>;
export type Intent = z.infer<typeof Intent>;
