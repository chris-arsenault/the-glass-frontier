import { z } from 'zod';

export const BUG_REPORT_STATUSES = ['open', 'triaged', 'closed'] as const;

export type BugReportStatus = (typeof BUG_REPORT_STATUSES)[number];

export const BugReportSchema = z.object({
  characterId: z.string().uuid().nullable(),
  chronicleId: z.string().uuid().nullable(),
  createdAt: z.string(),
  details: z.string().min(10).max(4000),
  id: z.string().uuid(),
  loginId: z.string().min(1),
  metadata: z.record(z.string(), z.any()).optional(),
  playerId: z.string().min(1).nullable(),
  status: z.enum(BUG_REPORT_STATUSES),
  summary: z.string().min(4).max(240),
  updatedAt: z.string(),
});

export type BugReport = z.infer<typeof BugReportSchema>;

export const BugReportSubmissionSchema = z.object({
  characterId: z.string().uuid().nullable().optional(),
  chronicleId: z.string().uuid().nullable().optional(),
  details: z.string().min(10).max(4000),
  playerId: z.string().min(1).nullable().optional(),
  summary: z.string().min(4).max(240),
});

export type BugReportSubmission = z.infer<typeof BugReportSubmissionSchema>;
