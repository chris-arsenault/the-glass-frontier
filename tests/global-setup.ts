import { execa } from 'execa';
import path from 'node:path';
import waitOn from 'wait-on';

import { PidRegistry } from '../scripts/pid-registry';

const STACK_STATE_PATH = path.resolve(process.cwd(), 'tests/.e2e-stack.json');

const sharedEnv: Record<string, string> = {
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

const waitResources = [
  'http-get://localhost:4566/_localstack/health',
  'http-get://localhost:8080/__admin',
  'http-get://localhost:5173',
  'tcp:4015',
  'tcp:4016',
  'tcp:7000',
  'tcp:7001',
  'tcp:7400',
  'tcp:7800',
  'http-get://localhost:8787/health',
];

const withEnv = (): NodeJS.ProcessEnv => ({ ...process.env, ...sharedEnv });

export default async function globalSetup(): Promise<void> {
  const pidRegistry = new PidRegistry({ persistPath: STACK_STATE_PATH });
  await pidRegistry.load();
  if (pidRegistry.list().length > 0) {
    console.warn('[global-setup] Found stale dev processes; cleaning them up before bootstrapping.');
    await pidRegistry.killAll();
    await pidRegistry.clear();
  } else {
    await pidRegistry.clear();
  }

  await execa('docker-compose', ['-f', 'docker-compose.e2e.yml', 'up', '-d'], {
    stdio: 'inherit',
  });

  await waitOn({
    resources: [
      'http-get://localhost:4566/_localstack/health',
      'http-get://localhost:8080/__admin',
      'tcp:5432',
    ],
    timeout: 120_000,
  });

  // Applies db/migrations and its seed: the same files the deploy applies, so
  // an end-to-end run exercises the production schema and vocabulary.
  await execa('pnpm', ['exec', 'tsx', 'scripts/dbMigrate.ts'], {
    env: withEnv(),
    stdio: 'inherit',
  });

  await execa('pnpm', ['exec', 'tsx', 'tests/bin/seed-local-fixtures.ts'], {
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

  if (typeof devServer.pid === 'number') {
    await pidRegistry.register({
      command: 'pnpm dev',
      cwd: process.cwd(),
      killGroup: true,
      label: 'playwright-dev-server',
      pid: devServer.pid,
    });
  }

  await waitOn({
    resources: waitResources,
    timeout: 180_000,
  });
}
