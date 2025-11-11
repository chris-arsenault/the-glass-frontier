const requireEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable ${key}`);
  }
  return value;
};

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const websocketConfig = {
  tableName: requireEnv("PROGRESS_TABLE_NAME"),
  connectionTtlSeconds: parsePositiveInt(process.env.CONNECTION_TTL_SECONDS, 86400),
  subscriptionTtlSeconds: parsePositiveInt(process.env.SUBSCRIPTION_TTL_SECONDS, 900)
};

export const cognitoConfig = {
  userPoolId: requireEnv("COGNITO_USER_POOL_ID"),
  appClientId: process.env.COGNITO_APP_CLIENT_ID ?? "",
  region: process.env.AWS_REGION || "us-east-1"
};

export { requireEnv };
