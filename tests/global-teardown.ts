import { execa } from 'execa';
import path from 'node:path';

import { PidRegistry } from '../scripts/pid-registry';

const STACK_STATE_PATH = path.resolve(process.cwd(), 'tests/.e2e-stack.json');

export default async function globalTeardown(): Promise<void> {
  await stopDevProcesses();
  await execa('docker-compose', ['-f', 'docker-compose.e2e.yml', 'down', '-v'], {
    stdio: 'inherit',
  });
}

async function stopDevProcesses(): Promise<void> {
  const pidRegistry = new PidRegistry({ persistPath: STACK_STATE_PATH });
  await pidRegistry.load();
  if (pidRegistry.list().length === 0) {
    await pidRegistry.clear();
    return;
  }
  try {
    await pidRegistry.killAll();
  } catch (error) {
    console.warn('[global-teardown] Failed to stop some dev processes', error);
  } finally {
    await pidRegistry.clear();
  }
}
