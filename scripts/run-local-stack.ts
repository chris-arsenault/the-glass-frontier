import { execa } from 'execa';
import waitOn from 'wait-on';

const sharedEnv: Record<string, string> = {
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
  PROMPT_TEMPLATE_BUCKET: 'gf-e2e-prompts',
  TURN_PROGRESS_QUEUE_URL: 'http://localhost:4566/000000000000/gf-e2e-turn-progress',
  CHRONICLE_CLOSURE_QUEUE_URL: 'http://localhost:4566/000000000000/gf-e2e-chronicle-closure',
  LLM_PROXY_ARCHIVE_BUCKET: 'gf-e2e-audit',
  LLM_PROXY_USAGE_TABLE: 'gf-e2e-llm-usage',
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
  PLAYWRIGHT_RESET_ENABLED: '1',
};

const waitResources = [
  'tcp:4566',
  'http-get://localhost:8080/__admin',
  'http-get://localhost:5173',
  'tcp:7000',
  'tcp:7001',
  'tcp:7300',
  'tcp:7400',
];

const withEnv = (): NodeJS.ProcessEnv => ({ ...process.env, ...sharedEnv });

let shuttingDown = false;
let devProcess: ReturnType<typeof execa> | null = null;

async function main(): Promise<void> {
  process.on('SIGINT', handleSignal);
  process.on('SIGTERM', handleSignal);

  await execa('docker-compose', ['-f', 'docker-compose.e2e.yml', 'up', '-d'], {
    stdio: 'inherit',
  });

  await waitOn({
    resources: ['tcp:4566', 'http-get://localhost:8080/__admin'],
    timeout: 120_000,
  });

  await execa('pnpm', ['exec', 'tsx', 'tests/bin/seed-localstack.ts'], {
    env: withEnv(),
    stdio: 'inherit',
  });

  devProcess = execa('pnpm', ['dev'], {
    env: withEnv(),
    stdio: 'inherit',
  });
  devProcess.catch(() => undefined);

  await waitOn({ resources: waitResources, timeout: 180_000 }).catch(() => undefined);
  console.log('Local stack is running. Press Ctrl+C to stop.');

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
