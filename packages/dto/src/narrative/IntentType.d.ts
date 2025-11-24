import { z } from 'zod';
export declare const IntentType: z.ZodEnum<{
    action: "action";
    inquiry: "inquiry";
    clarification: "clarification";
    possibility: "possibility";
    planning: "planning";
    reflection: "reflection";
    wrap: "wrap";
}>;
export type IntentType = z.infer<typeof IntentType>;
