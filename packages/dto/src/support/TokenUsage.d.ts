import { z } from 'zod';
export declare const TokenUsageMetricSchema: z.ZodObject<{
    key: z.ZodString;
    value: z.ZodNumber;
}, z.core.$strip>;
export declare const TokenUsagePeriodSchema: z.ZodObject<{
    metrics: z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        value: z.ZodNumber;
    }, z.core.$strip>>;
    period: z.ZodString;
    totalRequests: z.ZodNumber;
    updatedAt: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export type TokenUsageMetric = z.infer<typeof TokenUsageMetricSchema>;
export type TokenUsagePeriod = z.infer<typeof TokenUsagePeriodSchema>;
