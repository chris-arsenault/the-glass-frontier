import { CreateBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  ResourceInUseException,
} from '@aws-sdk/client-dynamodb';
import { CreateQueueCommand, SQSClient } from '@aws-sdk/client-sqs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
};

const region = resolveAwsRegion();
const s3Endpoint = resolveAwsEndpoint('AWS_S3_ENDPOINT');
const dynamoEndpoint = resolveAwsEndpoint('AWS_DYNAMODB_ENDPOINT');
const sqsEndpoint = resolveAwsEndpoint('AWS_SQS_ENDPOINT');

const narrativeBucket = process.env.NARRATIVE_S3_BUCKET ?? 'gf-e2e-narrative';
const promptBucket = process.env.PROMPT_TEMPLATE_BUCKET ?? 'gf-e2e-prompts';
const auditBucket = process.env.LLM_PROXY_ARCHIVE_BUCKET ?? 'gf-e2e-audit';
const worldIndexTable = process.env.NARRATIVE_DDB_TABLE ?? 'gf-e2e-world-index';
const locationIndexTable = process.env.LOCATION_GRAPH_DDB_TABLE ?? 'gf-e2e-location-graph';
const usageTable = process.env.LLM_PROXY_USAGE_TABLE ?? 'gf-e2e-llm-usage';
const turnProgressQueue = queueUrlFromEnv('TURN_PROGRESS_QUEUE_URL', 'gf-e2e-turn-progress');
const closureQueue = queueUrlFromEnv('CHRONICLE_CLOSURE_QUEUE_URL', 'gf-e2e-chronicle-closure');

function queueUrlFromEnv(envVar: string, fallbackName: string): { name: string } {
  const explicit = process.env[envVar];
  if (typeof explicit === 'string' && explicit.trim().length > 0) {
    const parts = explicit.trim().split('/');
    return { name: parts.at(-1) ?? fallbackName };
  }
  return { name: fallbackName };
}

const log = (...args: unknown[]) => {
  console.log('[seed-localstack]', ...args);
};

async function main(): Promise<void> {
  const s3 = new S3Client({
    credentials,
    endpoint: s3Endpoint,
    forcePathStyle: shouldForcePathStyle(),
    region,
  });
  const dynamo = new DynamoDBClient({
    credentials,
    endpoint: dynamoEndpoint,
    region,
  });
  const sqs = new SQSClient({
    credentials,
    endpoint: sqsEndpoint,
    region,
  });

  await ensureBucket(s3, narrativeBucket);
  await ensureBucket(s3, promptBucket);
  await ensureBucket(s3, auditBucket);
  await uploadPromptTemplates(s3, promptBucket);

  await ensureWorldIndexTable(dynamo, worldIndexTable);
  await ensureLocationIndexTable(dynamo, locationIndexTable);
  await ensureUsageTable(dynamo, usageTable);

  await ensureQueue(sqs, turnProgressQueue.name);
  await ensureQueue(sqs, closureQueue.name);
}

async function ensureBucket(client: S3Client, bucket: string): Promise<void> {
  log('Ensuring bucket', bucket);
  await withRetry(`bucket:${bucket}`, async () => {
    try {
      await client.send(
        new CreateBucketCommand({
          Bucket: bucket,
        })
      );
      log('Created bucket', bucket);
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === 'BucketAlreadyOwnedByYou' || error.name === 'BucketAlreadyExists')
      ) {
        log('Bucket already exists', bucket);
        return;
      }
      throw error;
    }
  });
}

async function uploadPromptTemplates(client: S3Client, bucket: string): Promise<void> {
  const templatesDir = path.resolve(
    process.cwd(),
    'apps',
    'chronicle-api',
    'src',
    'langGraph',
    'prompts',
    'templates'
  );
  const files = await readdir(templatesDir);
  await Promise.all(
    files
      .filter((file) => file.endsWith('.hbs'))
      .map(async (file) => {
        const body = await readFile(path.join(templatesDir, file));
        const key = `official/${file}`;
        await client.send(
          new PutObjectCommand({
            Body: body,
            Bucket: bucket,
            ContentType: 'text/plain; charset=utf-8',
            Key: key,
          })
        );
        log('Uploaded prompt template', key);
      })
  );
}

async function ensureWorldIndexTable(client: DynamoDBClient, tableName: string): Promise<void> {
  await ensureTable(client, {
    AttributeDefinitions: [
      { AttributeName: 'pk', AttributeType: 'S' },
      { AttributeName: 'sk', AttributeType: 'S' },
    ],
    BillingMode: 'PAY_PER_REQUEST',
    KeySchema: [
      { AttributeName: 'pk', KeyType: 'HASH' },
      { AttributeName: 'sk', KeyType: 'RANGE' },
    ],
    TableName: tableName,
  });
}

async function ensureLocationIndexTable(client: DynamoDBClient, tableName: string): Promise<void> {
  await ensureTable(client, {
    AttributeDefinitions: [
      { AttributeName: 'pk', AttributeType: 'S' },
      { AttributeName: 'sk', AttributeType: 'S' },
    ],
    BillingMode: 'PAY_PER_REQUEST',
    KeySchema: [
      { AttributeName: 'pk', KeyType: 'HASH' },
      { AttributeName: 'sk', KeyType: 'RANGE' },
    ],
    TableName: tableName,
  });
}

async function ensureUsageTable(client: DynamoDBClient, tableName: string): Promise<void> {
  await ensureTable(client, {
    AttributeDefinitions: [
      { AttributeName: 'player_id', AttributeType: 'S' },
      { AttributeName: 'usage_period', AttributeType: 'S' },
    ],
    BillingMode: 'PAY_PER_REQUEST',
    KeySchema: [
      { AttributeName: 'player_id', KeyType: 'HASH' },
      { AttributeName: 'usage_period', KeyType: 'RANGE' },
    ],
    TableName: tableName,
  });
}

async function ensureTable(client: DynamoDBClient, config: CreateTableCommand['input']) {
  await withRetry(`table:${config.TableName ?? 'unknown'}`, async () => {
    try {
      await client.send(
        new DescribeTableCommand({
          TableName: config.TableName,
        })
      );
      log('Table already exists', config.TableName);
      return;
    } catch (error) {
      const notFound =
        error instanceof Error &&
        (error.name === 'ResourceNotFoundException' ||
          error.name === 'ValidationException' ||
          error.message?.includes('Requested resource not found'));
      if (!notFound) {
        throw error;
      }
    }

    try {
      await client.send(new CreateTableCommand(config));
      log('Created table', config.TableName);
    } catch (error) {
      if (error instanceof ResourceInUseException) {
        log('Table already exists after race', config.TableName);
        return;
      }
      throw error;
    }
  });
}

async function ensureQueue(client: SQSClient, name: string): Promise<void> {
  log('Ensuring SQS queue', name);
  await withRetry(`queue:${name}`, async () => {
    await client.send(
      new CreateQueueCommand({
        QueueName: name,
      })
    );
  });
}

async function withRetry<T>(
  label: string,
  runner: () => Promise<T>,
  attempts = 5,
  delayMs = 1000
): Promise<T> {
  let lastError: unknown;
  for (let index = 0; index < attempts; index += 1) {
    try {
      return await runner();
    } catch (error) {
      lastError = error;
      log(`Retrying ${label} after error`, error instanceof Error ? error.message : error);
      if (index < attempts - 1) {
        await delay(delayMs);
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

main().catch((error) => {
  console.error('[seed-localstack] Failed', error);
  process.exitCode = 1;
});
function shouldForcePathStyle(): boolean {
  const explicit = process.env.AWS_S3_FORCE_PATH_STYLE;
  if (typeof explicit === 'string') {
    const normalized = explicit.trim().toLowerCase();
    if (['1', 'true', 'yes'].includes(normalized)) {
      return true;
    }
  }
  return Boolean(s3Endpoint);
}

function resolveAwsRegion(): string {
  const candidates = [
    process.env.AWS_REGION,
    process.env.AWS_DEFAULT_REGION,
    process.env.AWS_REGION_NAME,
    'us-east-1',
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return 'us-east-1';
}

function resolveAwsEndpoint(envVar: string): string | undefined {
  const value = process.env[envVar];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return undefined;
}
