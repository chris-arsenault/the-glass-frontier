const isNonEmptyString = (value: unknown): value is string => {
  return typeof value === 'string' && value.trim().length > 0;
};

type AwsService = 's3' | 'dynamodb' | 'sqs';

const SERVICE_ENV_LOOKUP: Record<AwsService, string> = {
  dynamodb: 'AWS_DYNAMODB_ENDPOINT',
  s3: 'AWS_S3_ENDPOINT',
  sqs: 'AWS_SQS_ENDPOINT',
};

const FALLBACK_ENDPOINT_ENV_VARS = [
  'AWS_ENDPOINT_URL',
  'AWS_LOCAL_ENDPOINT',
  'AWS_LOCALSTACK_ENDPOINT',
];

const toTrimmedOrNull = (value?: string): string | null => {
  if (!isNonEmptyString(value)) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeBoolean = (value?: string): boolean => {
  if (!isNonEmptyString(value)) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
};

export const resolveAwsEndpoint = (service: AwsService): string | undefined => {
  const serviceSpecific = toTrimmedOrNull(process.env[SERVICE_ENV_LOOKUP[service]]);
  if (serviceSpecific !== null) {
    return serviceSpecific;
  }
  for (const fallback of FALLBACK_ENDPOINT_ENV_VARS) {
    const candidate = toTrimmedOrNull(process.env[fallback]);
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

export const shouldForcePathStyle = (): boolean => {
  if (normalizeBoolean(process.env.AWS_S3_FORCE_PATH_STYLE)) {
    return true;
  }
  return resolveAwsEndpoint('s3') !== undefined;
};
