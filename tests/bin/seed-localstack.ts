import { CreateBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { CreateQueueCommand, SQSClient } from '@aws-sdk/client-sqs';
import { execa } from 'execa';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { createLocationGraphStore, createWorldStateStore } from '@glass-frontier/worldstate';
import { AuditFeedbackStore, AuditGroupStore, AuditLogStore, AuditReviewStore, BugReportStore, TokenUsageStore } from '@glass-frontier/ops';
import {
  LOCATION_ROOT_SEED,
  PLAYWRIGHT_CHARACTER_ID,
  PLAYWRIGHT_CHRONICLE_ID,
  PLAYWRIGHT_PLAYER_ID,
  buildPlaywrightCharacterRecord,
  buildPlaywrightChronicleRecord,
  buildPlaywrightPlayerRecord,
  seedPlaywrightLocationGraph,
} from '../../apps/chronicle-api/src/playwright/fixtures';

const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
};

const region = resolveAwsRegion();
const s3Endpoint = resolveAwsEndpoint('AWS_S3_ENDPOINT');
const sqsEndpoint = resolveAwsEndpoint('AWS_SQS_ENDPOINT');

const narrativeBucket = process.env.NARRATIVE_S3_BUCKET ?? 'gf-e2e-narrative';
const promptBucket = process.env.PROMPT_TEMPLATE_BUCKET ?? 'gf-e2e-prompts';
const auditBucket = process.env.LLM_PROXY_ARCHIVE_BUCKET ?? 'gf-e2e-audit';
const turnProgressQueue = queueUrlFromEnv('TURN_PROGRESS_QUEUE_URL', 'gf-e2e-turn-progress');
const closureQueue = queueUrlFromEnv('CHRONICLE_CLOSURE_QUEUE_URL', 'gf-e2e-chronicle-closure');
const worldstateDatabaseUrl =
  process.env.WORLDSTATE_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgres://postgres:postgres@localhost:5432/worldstate';

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
  const sqs = new SQSClient({
    credentials,
    endpoint: sqsEndpoint,
    region,
  });
  const locationGraphStore = createLocationGraphStore({
    connectionString: worldstateDatabaseUrl,
  });
  const worldStateStore = createWorldStateStore({
    connectionString: worldstateDatabaseUrl,
    locationGraphStore,
  });
  const bugReportStore = new BugReportStore({ connectionString: worldstateDatabaseUrl });
  const tokenUsageStore = new TokenUsageStore({ connectionString: worldstateDatabaseUrl });
  const auditGroupStore = new AuditGroupStore({ connectionString: worldstateDatabaseUrl });
  const auditLogStore = new AuditLogStore({ connectionString: worldstateDatabaseUrl });
  const auditReviewStore = new AuditReviewStore({ connectionString: worldstateDatabaseUrl });
  const auditFeedbackStore = new AuditFeedbackStore({ connectionString: worldstateDatabaseUrl });

  await runWorldstateMigrations();
  await runOpsMigrations();
  await ensureBucket(s3, narrativeBucket);
  await ensureBucket(s3, promptBucket);
  await ensureBucket(s3, auditBucket);
  await uploadPromptTemplates(s3, promptBucket);

  await ensureQueue(sqs, turnProgressQueue.name);
  await ensureQueue(sqs, closureQueue.name);
  await seedPlaywrightChronicle(worldStateStore, locationGraphStore);
  // Touch ops stores so migrations are exercised in tests
  await bugReportStore.listReports();
  await tokenUsageStore.listUsage(PLAYWRIGHT_PLAYER_ID, 1);
  const group = await auditGroupStore.ensureGroup({
    chronicleId: PLAYWRIGHT_CHRONICLE_ID,
    playerId: PLAYWRIGHT_PLAYER_ID,
    scopeRef: PLAYWRIGHT_CHRONICLE_ID,
    scopeType: 'turn',
  });
  await auditLogStore.record({
    groupId: group.id,
    playerId: PLAYWRIGHT_PLAYER_ID,
    providerId: 'seed',
    request: { message: 'seed' },
    response: { ok: true },
  });
  await auditReviewStore.listByGroup(group.id);
  await auditFeedbackStore.listByGroup(group.id);
}

async function runWorldstateMigrations(): Promise<void> {
  await execa('pnpm', ['-F', '@glass-frontier/worldstate', 'migrate'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      WORLDSTATE_DATABASE_URL: worldstateDatabaseUrl,
    },
  });
}

async function runOpsMigrations(): Promise<void> {
  await execa('pnpm', ['-F', '@glass-frontier/ops', 'migrate'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      OPS_DATABASE_URL: worldstateDatabaseUrl,
    },
  });
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
    'prompt-api',
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

async function seedPlaywrightChronicle(
  worldStateStore: ReturnType<typeof createWorldStateStore>,
  locationGraphStore: ReturnType<typeof createLocationGraphStore>
): Promise<void> {
  const playerRecord = buildPlaywrightPlayerRecord();
  const characterRecord = buildPlaywrightCharacterRecord();
  const chronicleRecord = buildPlaywrightChronicleRecord();

  await worldStateStore.upsertPlayer(playerRecord);
  await worldStateStore.upsertCharacter(characterRecord);
  await worldStateStore.upsertChronicle(chronicleRecord);
  await seedPlaywrightLocationGraph(locationGraphStore, {
    characterId: PLAYWRIGHT_CHARACTER_ID,
    locationId: LOCATION_ROOT_SEED.id,
  });
}

const toPk = (prefix: 'player' | 'character' | 'chronicle' | 'location' | 'turn', id: string) =>
  `${prefix.toUpperCase()}#${id}`;
const toSk = toPk;

async function writeJson(client: S3Client, key: string, payload: unknown): Promise<void> {
  await client.send(
    new PutObjectCommand({
      Body: Buffer.from(JSON.stringify(payload, null, 2), 'utf-8'),
      Bucket: narrativeBucket,
      ContentType: 'application/json',
      Key: key,
    })
  );
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
