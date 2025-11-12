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

const progressTableName = resolveRequiredEnv(process.env.PROGRESS_TABLE_NAME, 'PROGRESS_TABLE_NAME');

export const websocketConfig = {
  connectionTtlSeconds: parsePositiveInt(process.env.CONNECTION_TTL_SECONDS, 86400),
  subscriptionTtlSeconds: parsePositiveInt(process.env.SUBSCRIPTION_TTL_SECONDS, 900),
  tableName: progressTableName,
};

export const cognitoConfig = (() => {
  const userPoolIdRaw = process.env.COGNITO_USER_POOL_ID;
  if (!isNonEmptyString(userPoolIdRaw)) {
    return null;
  }
  const userPoolId = userPoolIdRaw.trim();

  const awsRegion = process.env.AWS_REGION;
  const awsDefaultRegion = process.env.AWS_DEFAULT_REGION;
  const preferredRegion = isNonEmptyString(awsRegion) ? awsRegion.trim() : null;
  const fallbackRegion = isNonEmptyString(awsDefaultRegion) ? awsDefaultRegion.trim() : null;
  const region = preferredRegion ?? fallbackRegion ?? 'us-east-1';

  const appClientIdRaw = process.env.COGNITO_APP_CLIENT_ID;
  const appClientId = isNonEmptyString(appClientIdRaw) ? appClientIdRaw.trim() : '';

  return {
    appClientId,
    region,
    userPoolId,
  };
})();
