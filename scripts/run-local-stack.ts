import { execa } from 'execa';
import waitOn from 'wait-on';

import { PidRegistry } from './pid-registry';

type StackMode = 'mock-openai' | 'live-openai';
type DbMode = 'preserve' | 'drop';

const MOCK_ENV: Record<string, string> = {
  AWS_ACCESS_KEY_ID: 'test',
  AWS_DEFAULT_REGION: 'us-east-1',
  AWS_REGION: 'us-east-1',
  AWS_SECRET_ACCESS_KEY: 'test',
  AWS_SQS_ENDPOINT: 'http://127.0.0.1:4566',
  CHRONICLE_API_PORT: '7000',
  CHRONICLE_CLOSURE_QUEUE_URL: 'http://localhost:4566/000000000000/gf-e2e-chronicle-closure',
  COGNITO_APP_CLIENT_ID: 'local-e2e',
  COGNITO_USER_POOL_ID: 'us-east-1_localE2E',
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/worldstate',
  GLASS_FRONTIER_DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/worldstate',
  GM_API_PORT: '7001',
  NARRATIVE_PORT: '7000',
  OPENAI_API_BASE: 'http://localhost:8080/v1',
  OPENAI_API_KEY: 'test-openai-key',
  OPENAI_CLIENT_BASE: 'http://localhost:8080/v1',
  PLAYWRIGHT_RESET_ENABLED: '1',
  PROGRESS_API_PORT: '8787',
  PROMPT_API_PORT: '7400',
  TURN_PROGRESS_QUEUE_URL: 'http://localhost:4566/000000000000/gf-e2e-turn-progress',
  VITE_COGNITO_CLIENT_ID: 'local-e2e',
  VITE_COGNITO_USER_POOL_ID: 'us-east-1_localE2E',
};

const LIVE_OPENAI_ENV: Record<string, string> = {
  ...MOCK_ENV,
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ?? 'test',
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
  OPENAI_API_BASE: process.env.OPENAI_API_BASE ?? 'https://api.openai.com/v1',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
  OPENAI_CLIENT_BASE: process.env.OPENAI_CLIENT_BASE ?? 'https://api.openai.com/v1',
};

const APP_WAIT_RESOURCES = [
  'http-get://localhost:5173',
  'tcp:4015',
  'tcp:4016',
  'tcp:7000',
  'tcp:7001',
  'tcp:7400',
  'tcp:7800',
  'http-get://localhost:8787/health',
];

function resolveMode(): StackMode {
  const flag = process.argv.find((entry) => entry?.startsWith('--mode='));
  if (flag) {
    const value = flag.split('=')[1];
    if (value === 'live-openai') {
      return 'live-openai';
    }
  }
  if (process.env.LOCAL_STACK_MODE === 'live-openai') {
    return 'live-openai';
  }
  return 'mock-openai';
}

function resolveDbMode(): DbMode {
  const flag = process.argv.find((entry) => entry === '--drop-db');
  if (flag) {
    return 'drop';
  }
  if (process.env.LOCAL_STACK_DB === 'drop') {
    return 'drop';
  }
  return 'preserve';
}

function buildEnv(mode: StackMode): NodeJS.ProcessEnv {
  if (mode === 'live-openai') {
    if (!LIVE_OPENAI_ENV.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY must be set for live-openai mode.');
    }
    return { ...process.env, ...LIVE_OPENAI_ENV, LOCAL_STACK_MODE: mode };
  }
  return { ...process.env, ...MOCK_ENV, LOCAL_STACK_MODE: mode };
}

let shuttingDown = false;
let devProcess: ReturnType<typeof execa> | null = null;
const pidRegistry = new PidRegistry();

async function getPostgresContainerId(): Promise<string> {
  const result = await execa('docker-compose', [
    '-f',
    'docker-compose.e2e.yml',
    'ps',
    '-q',
    'postgres',
  ]);
  return result.stdout.trim();
}

async function waitForWiremockReady(): Promise<void> {
  const timeoutMs = 5_000;
  try {
    await waitOn({
      resources: ['http-get://localhost:8080/__admin'],
      timeout: timeoutMs,
    });
  } catch (error) {
    throw new Error(
      `[run-local-stack] Wiremock did not become ready within ${timeoutMs / 1000}s. Check mock mappings for syntax issues.`,
      { cause: error }
    );
  }
}

async function waitForPostgresReady(connectionString: string): Promise<void> {
  const timeoutMs = 30_000;
  const startTime = Date.now();

  console.log('[run-local-stack] Waiting for PostgreSQL to be ready...');

  while (Date.now() - startTime < timeoutMs) {
    try {
      // Get the container name
      const psResult = await execa('docker-compose', [
        '-f',
        'docker-compose.e2e.yml',
        'ps',
        '-q',
        'postgres',
      ]);

      const containerId = psResult.stdout.trim();
      if (!containerId) {
        console.log('[run-local-stack] PostgreSQL container not found, retrying...');
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      // Try pg_isready directly on the container
      await execa('docker', ['exec', containerId, 'pg_isready', '-U', 'postgres'], {
        timeout: 3000,
      });

      console.log('[run-local-stack] PostgreSQL is ready!');
      return;
    } catch (error) {
      // Log error for debugging
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`[run-local-stack] PostgreSQL check failed (${elapsed}s): ${errorMsg}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error(
    `[run-local-stack] PostgreSQL did not become ready within ${timeoutMs / 1000}s.`
  );
}

async function main(): Promise<void> {
  process.on('SIGINT', handleSignal);
  process.on('SIGTERM', handleSignal);

  const mode = resolveMode();
  const dbMode = resolveDbMode();
  const env = buildEnv(mode);

  // If drop-db flag is set, bring down containers with volumes first
  if (dbMode === 'drop') {
    console.log('[run-local-stack] Dropping database (removing volumes)...');
    await execa('docker-compose', ['-f', 'docker-compose.e2e.yml', 'down', '-v'], {
      stdio: 'inherit',
    }).catch(() => undefined);
  }

  await execa('docker-compose', ['-f', 'docker-compose.e2e.yml', 'up', '-d'], {
    stdio: 'inherit',
  });

  await waitOn({
    resources: ['http-get://localhost:4566/_localstack/health', 'tcp:5432'],
    timeout: 120_000,
  });

  await waitForPostgresReady(env.GLASS_FRONTIER_DATABASE_URL as string);

  if (mode === 'mock-openai') {
    await waitForWiremockReady();
  }

  await execa('pnpm', ['-F', '@glass-frontier/app', 'migrate'], {
    env,
    stdio: 'inherit',
  });
  await execa('pnpm', ['-F', '@glass-frontier/worldstate', 'migrate'], {
    env,
    stdio: 'inherit',
  });
  await execa('pnpm', ['-F', '@glass-frontier/ops', 'migrate'], {
    env,
    stdio: 'inherit',
  });

  await execa('pnpm', ['exec', 'tsx', 'tests/bin/seed-local-fixtures.ts'], {
    env,
    stdio: 'inherit',
  });

  devProcess = execa('pnpm', ['dev'], {
    env,
    forceKillAfterDelay: 1000,
    stdio: 'inherit',
  });
  devProcess.catch(() => undefined);
  if (typeof devProcess.pid === 'number') {
    const trackedPid = devProcess.pid;
    await pidRegistry.register({
      command: 'pnpm dev',
      cwd: process.cwd(),
      label: `local-stack:${mode}`,
      pid: trackedPid,
    });
    devProcess.on('exit', () => {
      void pidRegistry.unregister(trackedPid);
    });
  }

  const runtimeWait = [...APP_WAIT_RESOURCES];
  if (mode === 'mock-openai') {
    runtimeWait.unshift('http-get://localhost:8080/__admin');
  }
  await waitOn({ resources: runtimeWait, timeout: 180_000 }).catch(() => undefined);
  console.log(`Local stack (${mode}) with test fixtures is running. Press Ctrl+C to stop.`);

  try {
    await devProcess;
  } finally {
    await shutdown();
  }
}

async function handleSignal() {
  await shutdown();
}

async function shutdown() {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  await pidRegistry.killAll();
  await pidRegistry.clear();
  if (devProcess) {
    try {
      devProcess.kill('SIGTERM');
    } catch {
      // already stopped
    }
  }
  // Stop containers but preserve volumes to keep database data
  await execa('docker-compose', ['-f', 'docker-compose.e2e.yml', 'down'], {
    stdio: 'inherit',
  }).catch(() => undefined);
}

main().catch(async (error) => {
  console.error('[run-local-stack] Failed', error);
  await shutdown();
  process.exitCode = 1;
});
