import { fromEnv } from '@aws-sdk/credential-providers';

const isNonEmptyString = (value: unknown): value is string => {
  return typeof value === 'string' && value.trim().length > 0;
};

type AwsService = 'dynamodb' | 'sqs';

export type LambdaDatabaseEnvironment = {
  database: string;
  host: string;
  password: string;
  port: number;
  user: string;
};

const requireEnvironment = (value: string | undefined, name: string): string => {
  if (!isNonEmptyString(value)) {
    throw new Error(`${name} is required in the Lambda database environment.`);
  }
  return value;
};

const toTrimmedOrNull = (value?: string): string | null => {
  if (!isNonEmptyString(value)) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const resolveAwsEndpoint = (service: AwsService): string | undefined => {
  const serviceSpecific =
    service === 'dynamodb'
      ? toTrimmedOrNull(process.env.AWS_DYNAMODB_ENDPOINT)
      : toTrimmedOrNull(process.env.AWS_SQS_ENDPOINT);
  if (serviceSpecific !== null) {
    return serviceSpecific;
  }
  const fallbackEndpoints = [
    process.env.AWS_ENDPOINT_URL,
    process.env.AWS_LOCAL_ENDPOINT,
    process.env.AWS_LOCALSTACK_ENDPOINT,
  ];
  for (const fallback of fallbackEndpoints) {
    const candidate = toTrimmedOrNull(fallback);
    if (candidate !== null) {
      return candidate;
    }
  }
  return undefined;
};

export const resolveAwsRegion = (): string => {
  return (
    toTrimmedOrNull(process.env.AWS_REGION) ??
    toTrimmedOrNull(process.env.AWS_DEFAULT_REGION) ??
    'us-east-1'
  );
};

export const resolveAwsCredentials = (): ReturnType<typeof fromEnv> | undefined =>
  hasExplicitAwsCredentials() ? fromEnv() : undefined;

const hasExplicitAwsCredentials = (): boolean => {
  const accessKey = process.env.AWS_ACCESS_KEY_ID ?? '';
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY ?? '';
  return accessKey.trim().length > 0 && secretKey.trim().length > 0;
};

export const isLambdaRuntime = (): boolean =>
  isNonEmptyString(process.env.AWS_LAMBDA_FUNCTION_NAME);

export const resolveLambdaDatabaseEnvironment = (): LambdaDatabaseEnvironment => ({
  database: requireEnvironment(process.env.PGDATABASE, 'PGDATABASE'),
  host: requireEnvironment(process.env.PGHOST, 'PGHOST'),
  password: requireEnvironment(process.env.PGPASSWORD, 'PGPASSWORD'),
  port: parseInt(process.env.PGPORT ?? '5432', 10),
  user: requireEnvironment(process.env.PGUSER, 'PGUSER'),
});
