export type ChangelogEntryType = 'feature' | 'improvement' | 'bugfix';

export type ChangelogEntry = {
  details: string;
  id: string;
  releasedAt: string;
  summary: string;
  type: ChangelogEntryType;
};
