import { execa } from 'execa';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';

const STACK_STATE_PATH = path.resolve(process.cwd(), 'tests/.e2e-stack.json');

export default async function globalTeardown(): Promise<void> {
  await stopDevServer();
  await execa('docker-compose', ['-f', 'docker-compose.e2e.yml', 'down', '-v'], {
    stdio: 'inherit',
  });
}

async function stopDevServer(): Promise<void> {
  try {
    const raw = await readFile(STACK_STATE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as { devServerPid?: number };
    const pid = parsed.devServerPid;
    if (typeof pid === 'number' && Number.isFinite(pid)) {
      try {
        process.kill(-pid, 'SIGTERM');
      } catch {
        try {
          process.kill(pid, 'SIGTERM');
        } catch {
          // already stopped
        }
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('[global-teardown] Failed to stop dev server', error);
    }
  } finally {
    await rm(STACK_STATE_PATH, { force: true });
  }
}
