import { z } from 'zod';
export const TokenUsageMetricSchema = z.object({
    key: z.string(),
    value: z.number(),
});
export const TokenUsagePeriodSchema = z.object({
    metrics: z.array(TokenUsageMetricSchema),
    period: z.string(),
    totalRequests: z.number().nonnegative(),
    updatedAt: z.string().nullable(),
});
