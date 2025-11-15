import { fromEnv } from '@aws-sdk/credential-providers';
type AwsService = 's3' | 'dynamodb' | 'sqs';
export declare const resolveAwsEndpoint: (service: AwsService) => string | undefined;
export declare const resolveAwsRegion: () => string;
export declare const shouldForcePathStyle: () => boolean;
export declare const resolveAwsCredentials: () => ReturnType<typeof fromEnv> | undefined;
export {};
