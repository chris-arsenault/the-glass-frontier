import { z } from 'zod';
export declare const BUG_REPORT_STATUSES: readonly ["open", "closed", "backloged", "will not fix"];
declare const BugReportStatusSchema: z.ZodPipe<z.ZodUnion<[z.ZodEnum<{
    open: "open";
    closed: "closed";
    backloged: "backloged";
    "will not fix": "will not fix";
}>, z.ZodLiteral<"triaged">]>, z.ZodTransform<"open" | "closed" | "backloged" | "will not fix", "open" | "closed" | "backloged" | "will not fix" | "triaged">>;
export type BugReportStatus = z.infer<typeof BugReportStatusSchema>;
export declare const BugReportSchema: z.ZodObject<{
    adminNotes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    backlogItem: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    characterId: z.ZodNullable<z.ZodString>;
    chronicleId: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
    details: z.ZodString;
    id: z.ZodString;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    playerId: z.ZodString;
    status: z.ZodPipe<z.ZodUnion<[z.ZodEnum<{
        open: "open";
        closed: "closed";
        backloged: "backloged";
        "will not fix": "will not fix";
    }>, z.ZodLiteral<"triaged">]>, z.ZodTransform<"open" | "closed" | "backloged" | "will not fix", "open" | "closed" | "backloged" | "will not fix" | "triaged">>;
    summary: z.ZodString;
    updatedAt: z.ZodString;
}, z.core.$strip>;
export type BugReport = z.infer<typeof BugReportSchema>;
export declare const BugReportSubmissionSchema: z.ZodObject<{
    characterId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    chronicleId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    details: z.ZodString;
    playerId: z.ZodString;
    summary: z.ZodString;
}, z.core.$strip>;
export type BugReportSubmission = z.infer<typeof BugReportSubmissionSchema>;
export {};
