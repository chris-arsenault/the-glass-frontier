const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  if (!isNonEmptyString(value)) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const resolveRequiredEnv = (value: string | undefined, key: string): string => {
  if (!isNonEmptyString(value)) {
    throw new Error(`Missing required environment variable ${key}`);
  }

  return value.trim();
};

export type ProgressConfig = {
  eventTtlSeconds: number;
  tableName: string;
};

export const resolveProgressConfig = (): ProgressConfig => ({
  eventTtlSeconds: parsePositiveInt(process.env.PROGRESS_EVENT_TTL_SECONDS, 900),
  tableName: resolveRequiredEnv(process.env.PROGRESS_TABLE_NAME, 'PROGRESS_TABLE_NAME'),
});
