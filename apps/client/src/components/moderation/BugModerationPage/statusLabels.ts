import type { BugReportStatus } from '@glass-frontier/dto';

export const BUG_STATUS_LABELS: Record<BugReportStatus, string> = {
  backloged: 'Backlogged',
  closed: 'Closed',
  open: 'Open',
  'will not fix': 'Will Not Fix',
};

export const formatBugStatus = (status: BugReportStatus): string => {
  return BUG_STATUS_LABELS[status] ?? status;
};
