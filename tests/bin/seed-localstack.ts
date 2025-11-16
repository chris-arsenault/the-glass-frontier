import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
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

import { DynamoWorldStateStore } from '@glass-frontier/worldstate';
import {
  PLAYWRIGHT_CHARACTER_ID,
  PLAYWRIGHT_CHRONICLE_ID,
  PLAYWRIGHT_LOGIN_ID,
  PLAYWRIGHT_LOCATION_ID,
  buildPlaywrightCharacterRecord,
  buildPlaywrightChronicleRecord,
  buildPlaywrightLoginRecord,
  seedPlaywrightLocationGraph,
} from '../../apps/chronicle-api/src/playwright/fixtures';

const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
};

const region = resolveAwsRegion();
const s3Endpoint = resolveAwsEndpoint('AWS_S3_ENDPOINT');
const dynamoEndpoint = resolveAwsEndpoint('AWS_DYNAMODB_ENDPOINT');
const sqsEndpoint = resolveAwsEndpoint('AWS_SQS_ENDPOINT');

const worldStateBucket = process.env.WORLD_STATE_S3_BUCKET ?? 'gf-e2e-world-state';
const promptBucket = process.env.PROMPT_TEMPLATE_BUCKET ?? 'gf-e2e-prompts';
const auditBucket = process.env.LLM_PROXY_ARCHIVE_BUCKET ?? 'gf-e2e-audit';
const worldStateTable = process.env.WORLD_STATE_TABLE_NAME ?? 'gf-e2e-world-state';
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
  const worldStateStore = new DynamoWorldStateStore({
    bucketName: worldStateBucket,
    tableName: worldStateTable,
    s3Prefix: process.env.WORLD_STATE_S3_PREFIX ?? undefined,
    dynamoClient: dynamo,
    s3Client: s3,
  });

  await ensureBucket(s3, worldStateBucket);
  await ensureBucket(s3, promptBucket);
  await ensureBucket(s3, auditBucket);
  await uploadPromptTemplates(s3, promptBucket);

  await ensureWorldStateTable(dynamo, worldStateTable);
  await ensureUsageTable(dynamo, usageTable);

  await ensureQueue(sqs, turnProgressQueue.name);
  await ensureQueue(sqs, closureQueue.name);
  await seedPlaywrightChronicle(worldStateStore);
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

async function ensureWorldStateTable(client: DynamoDBClient, tableName: string): Promise<void> {
  await ensureTable(client, {
    AttributeDefinitions: [
      { AttributeName: 'pk', AttributeType: 'S' },
      { AttributeName: 'sk', AttributeType: 'S' },
      { AttributeName: 'character_login_pk', AttributeType: 'S' },
      { AttributeName: 'character_login_sk', AttributeType: 'S' },
      { AttributeName: 'chronicle_login_pk', AttributeType: 'S' },
      { AttributeName: 'chronicle_login_sk', AttributeType: 'S' },
      { AttributeName: 'character_chronicle_pk', AttributeType: 'S' },
      { AttributeName: 'character_chronicle_sk', AttributeType: 'S' },
      { AttributeName: 'location_place_pk', AttributeType: 'S' },
      { AttributeName: 'location_place_sk', AttributeType: 'S' },
    ],
    BillingMode: 'PAY_PER_REQUEST',
    GlobalSecondaryIndexes: [
      {
        IndexName: 'character_login',
        KeySchema: [
          { AttributeName: 'character_login_pk', KeyType: 'HASH' },
          { AttributeName: 'character_login_sk', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'chronicle_login',
        KeySchema: [
          { AttributeName: 'chronicle_login_pk', KeyType: 'HASH' },
          { AttributeName: 'chronicle_login_sk', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'character_chronicle',
        KeySchema: [
          { AttributeName: 'character_chronicle_pk', KeyType: 'HASH' },
          { AttributeName: 'character_chronicle_sk', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'location_place',
        KeySchema: [
          { AttributeName: 'location_place_pk', KeyType: 'HASH' },
          { AttributeName: 'location_place_sk', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
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
      if (typeof config.TableName === 'string') {
        await waitForTableActive(client, config.TableName);
      }
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

async function waitForTableActive(
  client: DynamoDBClient,
  tableName: string,
  attempts = 25,
  pauseMs = 400
): Promise<void> {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const description = await client.send(
        new DescribeTableCommand({
          TableName: tableName,
        })
      );
      if (description.Table?.TableStatus === 'ACTIVE') {
        return;
      }
    } catch {
      // fall through to retry
    }
    await delay(pauseMs);
  }
  throw new Error(`Table ${tableName} did not become active`);
}

async function seedPlaywrightChronicle(store: DynamoWorldStateStore): Promise<void> {
  const loginRecord = buildPlaywrightLoginRecord();
  const characterRecord = buildPlaywrightCharacterRecord();
  const chronicleRecord = buildPlaywrightChronicleRecord({ locationId: PLAYWRIGHT_LOCATION_ID });

  await store.upsertLogin(loginRecord);
  await store.createCharacter(characterRecord);
  await store.deleteChronicle(chronicleRecord.id!);
  await store.createChronicle(chronicleRecord);
  await seedPlaywrightLocationGraph(store, {
    loginId: PLAYWRIGHT_LOGIN_ID,
    chronicleId: chronicleRecord.id!,
    locationId: PLAYWRIGHT_LOCATION_ID,
  });
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
