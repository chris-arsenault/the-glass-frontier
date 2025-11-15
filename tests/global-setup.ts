import { execa } from 'execa';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import waitOn from 'wait-on';

const STACK_STATE_PATH = path.resolve(process.cwd(), 'tests/.e2e-stack.json');

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
  LLM_PROXY_PORT: '8082',
  SERVICE_NAME: 'llm-proxy',
  VITE_COGNITO_USER_POOL_ID: 'us-east-1_localE2E',
  VITE_COGNITO_CLIENT_ID: 'local-e2e',
};

const waitResources = [
  'tcp:4566',
  'http-get://localhost:8080/__admin',
  'http-get://localhost:5173',
  'tcp:7000',
  'tcp:7300',
  'tcp:7400',
  'tcp:8082',
];

const withEnv = (): NodeJS.ProcessEnv => ({ ...process.env, ...sharedEnv });

export default async function globalSetup(): Promise<void> {
  await rm(STACK_STATE_PATH, { force: true });

  await execa('docker-compose', ['-f', 'docker-compose.e2e.yml', 'up', '-d'], {
    stdio: 'inherit',
  });

  await waitOn({
    resources: ['tcp:4566', 'http-get://localhost:8080/__admin'],
    timeout: 120_000,
  });

  await delay(2_000);

  await execa('pnpm', ['exec', 'tsx', 'tests/bin/seed-localstack.ts'], {
    env: withEnv(),
    stdio: 'inherit',
  });

  const devServer = execa('pnpm', ['dev'], {
    detached: true,
    env: withEnv(),
    stdio: 'inherit',
  });
  devServer.catch(() => undefined);
  devServer.unref();

  await waitOn({
    resources: waitResources,
    timeout: 180_000,
  });

  await mkdir(path.dirname(STACK_STATE_PATH), { recursive: true });
  await writeFile(
    STACK_STATE_PATH,
    JSON.stringify(
      {
        devServerPid: devServer.pid,
      },
      null,
      2
    ),
    'utf-8'
  );
}
