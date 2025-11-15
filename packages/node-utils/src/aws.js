import { fromEnv } from '@aws-sdk/credential-providers';
const isNonEmptyString = (value) => {
    return typeof value === 'string' && value.trim().length > 0;
};
const SERVICE_ENV_LOOKUP = {
    dynamodb: 'AWS_DYNAMODB_ENDPOINT',
    s3: 'AWS_S3_ENDPOINT',
    sqs: 'AWS_SQS_ENDPOINT',
};
const FALLBACK_ENDPOINT_ENV_VARS = [
    'AWS_ENDPOINT_URL',
    'AWS_LOCAL_ENDPOINT',
    'AWS_LOCALSTACK_ENDPOINT',
];
const toTrimmedOrNull = (value) => {
    if (!isNonEmptyString(value)) {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
};
const normalizeBoolean = (value) => {
    if (!isNonEmptyString(value)) {
        return false;
    }
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes';
};
export const resolveAwsEndpoint = (service) => {
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
export const resolveAwsRegion = () => {
    return (toTrimmedOrNull(process.env.AWS_REGION) ??
        toTrimmedOrNull(process.env.AWS_DEFAULT_REGION) ??
        'us-east-1');
};
export const shouldForcePathStyle = () => {
    if (normalizeBoolean(process.env.AWS_S3_FORCE_PATH_STYLE)) {
        return true;
    }
    return resolveAwsEndpoint('s3') !== undefined;
};
export const resolveAwsCredentials = () => hasExplicitAwsCredentials() ? fromEnv() : undefined;
const hasExplicitAwsCredentials = () => {
    const accessKey = process.env.AWS_ACCESS_KEY_ID ?? '';
    const secretKey = process.env.AWS_SECRET_ACCESS_KEY ?? '';
    return accessKey.trim().length > 0 && secretKey.trim().length > 0;
};
