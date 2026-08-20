import { fromEnv } from '@aws-sdk/credential-providers';
import { Signer } from '@aws-sdk/rds-signer';

const isNonEmptyString = (value: unknown): value is string => {
  return typeof value === 'string' && value.trim().length > 0;
};

type AwsService = 'dynamodb' | 'sqs';

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

/**
 * Check if we should use IAM authentication (Lambda environment)
 */
export const useRdsIamAuth = (): boolean => {
  return process.env.RDS_IAM_AUTH === 'true';
};

/**
 * Generate an IAM authentication token for RDS Proxy
 */
export const generateRdsIamToken = async (): Promise<string> => {
  const host = process.env.PGHOST;
  const port = parseInt(process.env.PGPORT ?? '5432', 10);
  const user = process.env.PGUSER;
  const region = resolveAwsRegion();

  if (host === undefined || host.trim().length === 0 || user === undefined || user.trim().length === 0) {
    throw new Error('PGHOST and PGUSER environment variables are required for IAM auth');
  }

  const signer = new Signer({
    hostname: host,
    port,
    region,
    username: user,
  });

  return signer.getAuthToken();
};
