import { CreateQueueCommand, SQSClient } from '@aws-sdk/client-sqs';
import { execa } from 'execa';
import { setTimeout as delay } from 'node:timers/promises';

import { createAppStore } from '../../packages/app/src/index.js';
import { createLocationStore, createWorldStateStore } from '../../packages/worldstate/src/index.js';
import { createOpsStore } from '../../packages/ops/src/index.js';
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
const sqsEndpoint = resolveAwsEndpoint('AWS_SQS_ENDPOINT');

const turnProgressQueue = queueUrlFromEnv('TURN_PROGRESS_QUEUE_URL', 'gf-e2e-turn-progress');
const closureQueue = queueUrlFromEnv('CHRONICLE_CLOSURE_QUEUE_URL', 'gf-e2e-chronicle-closure');
const worldstateDatabaseUrl =
  process.env.GLASS_FRONTIER_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/worldstate';

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
  const sqs = new SQSClient({
    credentials,
    endpoint: sqsEndpoint,
    region,
  });
  const appStore = createAppStore({ connectionString: worldstateDatabaseUrl });
  const locationStore = createLocationStore({
    connectionString: worldstateDatabaseUrl,
  });
  const worldStateStore = createWorldStateStore({
    connectionString: worldstateDatabaseUrl,
    locationStore,
  });
  const opsStore = createOpsStore({ connectionString: worldstateDatabaseUrl });

  await runAppMigrations();
  await runWorldstateMigrations();
  await runOpsMigrations();

  await ensureQueue(sqs, turnProgressQueue.name);
  await ensureQueue(sqs, closureQueue.name);
  await seedPlaywrightChronicle(worldStateStore, locationStore, appStore.playerStore);
  // Touch ops stores so migrations are exercised in tests
  await opsStore.bugReportStore.listReports();
  await opsStore.tokenUsageStore.listUsage(PLAYWRIGHT_PLAYER_ID, 1);
  const group = await opsStore.auditGroupStore.ensureGroup({
    chronicleId: PLAYWRIGHT_CHRONICLE_ID,
    playerId: PLAYWRIGHT_PLAYER_ID,
    scopeRef: PLAYWRIGHT_CHRONICLE_ID,
    scopeType: 'turn',
  });
  await opsStore.auditLogStore.record({
    groupId: group.id,
    playerId: PLAYWRIGHT_PLAYER_ID,
    providerId: 'seed',
    request: { message: 'seed' },
    response: { ok: true },
  });
  await opsStore.auditReviewStore.listByGroup(group.id);
  await opsStore.auditFeedbackStore.listByGroup(group.id);
}

async function runAppMigrations(): Promise<void> {
  await execa('pnpm', ['-F', '@glass-frontier/app', 'migrate'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      GLASS_FRONTIER_DATABASE_URL: worldstateDatabaseUrl,
    },
  });
}

async function runWorldstateMigrations(): Promise<void> {
  await execa('pnpm', ['-F', '@glass-frontier/worldstate', 'migrate'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      GLASS_FRONTIER_DATABASE_URL: worldstateDatabaseUrl,
    },
  });
}

async function runOpsMigrations(): Promise<void> {
  await execa('pnpm', ['-F', '@glass-frontier/ops', 'migrate'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      GLASS_FRONTIER_DATABASE_URL: worldstateDatabaseUrl,
    },
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

async function seedPlaywrightChronicle(
  worldStateStore: ReturnType<typeof createWorldStateStore>,
  locationStore: ReturnType<typeof createLocationStore>,
  playerStore: ReturnType<typeof createAppStore>['playerStore']
): Promise<void> {
  const playerRecord = buildPlaywrightPlayerRecord();
  const characterRecord = buildPlaywrightCharacterRecord();
  const chronicleRecord = buildPlaywrightChronicleRecord();

  await playerStore.upsert(playerRecord);
  await worldStateStore.upsertCharacter(characterRecord);
  await worldStateStore.upsertChronicle(chronicleRecord);
  await seedPlaywrightLocationGraph(locationStore, {
    characterId: PLAYWRIGHT_CHARACTER_ID,
    locationId: LOCATION_ROOT_SEED.id,
  });
}

main().catch((error) => {
  console.error('[seed-localstack] Failed', error);
  process.exitCode = 1;
});

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
