import { execa } from 'execa';
import waitOn from 'wait-on';

import { PidRegistry } from './pid-registry';

type StackMode = 'mock-openai' | 'live-openai';

const MOCK_ENV: Record<string, string> = {
  AWS_ACCESS_KEY_ID: 'test',
  AWS_SECRET_ACCESS_KEY: 'test',
  AWS_REGION: 'us-east-1',
  AWS_DEFAULT_REGION: 'us-east-1',
  AWS_S3_ENDPOINT: 'http://127.0.0.1:4566',
  AWS_DYNAMODB_ENDPOINT: 'http://127.0.0.1:4566',
  AWS_SQS_ENDPOINT: 'http://127.0.0.1:4566',
  AWS_S3_FORCE_PATH_STYLE: '1',
  NARRATIVE_S3_BUCKET: 'gf-e2e-narrative',
  NARRATIVE_S3_PREFIX: 'test/',
  NARRATIVE_DDB_TABLE: 'gf-e2e-world-index',
  LOCATION_GRAPH_DDB_TABLE: 'gf-e2e-location-graph',
  TURN_PROGRESS_QUEUE_URL: 'http://localhost:4566/000000000000/gf-e2e-turn-progress',
  CHRONICLE_CLOSURE_QUEUE_URL: 'http://localhost:4566/000000000000/gf-e2e-chronicle-closure',
  LLM_PROXY_ARCHIVE_BUCKET: 'gf-e2e-audit',
  WORLDSTATE_DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/worldstate',
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/worldstate',
  OPENAI_API_BASE: 'http://localhost:8080/v1',
  OPENAI_CLIENT_BASE: 'http://localhost:8080/v1',
  OPENAI_API_KEY: 'test-openai-key',
  CHRONICLE_API_PORT: '7000',
  NARRATIVE_PORT: '7000',
  PROMPT_API_PORT: '7400',
  LOCATION_API_PORT: '7300',
  GM_API_PORT: '7001',
  VITE_COGNITO_USER_POOL_ID: 'us-east-1_localE2E',
  VITE_COGNITO_CLIENT_ID: 'local-e2e',
  VITE_PROGRESS_WS_URL: 'ws://localhost:8787',
  PLAYWRIGHT_RESET_ENABLED: '1',
};

const LIVE_OPENAI_ENV: Record<string, string> = {
  ...MOCK_ENV,
  OPENAI_API_BASE: process.env.OPENAI_API_BASE ?? 'https://api.openai.com/v1',
  OPENAI_CLIENT_BASE: process.env.OPENAI_CLIENT_BASE ?? 'https://api.openai.com/v1',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? '',
};

const APP_WAIT_RESOURCES = [
  'http-get://localhost:5173',
  'tcp:7000',
  'tcp:7001',
  'tcp:7300',
  'tcp:7400',
  'tcp:5432',
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

async function main(): Promise<void> {
  process.on('SIGINT', handleSignal);
  process.on('SIGTERM', handleSignal);

  const mode = resolveMode();
  const env = buildEnv(mode);

  await execa('docker-compose', ['-f', 'docker-compose.e2e.yml', 'up', '-d'], {
    stdio: 'inherit',
  });

  await waitOn({
    resources: ['tcp:4566', 'tcp:5432'],
    timeout: 120_000,
  });

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

  await execa('pnpm', ['exec', 'tsx', 'tests/bin/seed-localstack.ts'], {
    env,
    stdio: 'inherit',
  });

  devProcess = execa('pnpm', ['dev'], {
    env,
    stdio: 'inherit',
  });
  devProcess.catch(() => undefined);
  if (typeof devProcess.pid === 'number') {
    const trackedPid = devProcess.pid;
    await pidRegistry.register({
      pid: trackedPid,
      command: 'pnpm dev',
      label: `local-stack:${mode}`,
      cwd: process.cwd(),
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
  console.log(`Local stack (${mode}) is running. Press Ctrl+C to stop.`);

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
      devProcess.kill('SIGTERM', { forceKillAfterTimeout: 1000 });
    } catch {
      // already stopped
    }
  }
  await execa('docker-compose', ['-f', 'docker-compose.e2e.yml', 'down', '-v'], {
    stdio: 'inherit',
  }).catch(() => undefined);
}

main().catch(async (error) => {
  console.error('[run-local-stack] Failed', error);
  await shutdown();
  process.exitCode = 1;
});
