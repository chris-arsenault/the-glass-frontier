import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export interface RegisteredProcess {
  pid: number;
  command: string;
  label?: string;
  cwd?: string;
  killGroup?: boolean;
  createdAt: string;
}

export interface PidRegistryOptions {
  /**
   * Optional absolute path where registry contents should be persisted.
   * When set, register/unregister calls will flush to disk so that
   * callers can recover the list after a crash.
   */
  persistPath?: string;
}

interface PersistedRegistry {
  processes: RegisteredProcess[];
}

export class PidRegistry {
  private readonly processes = new Map<number, RegisteredProcess>();
  private readonly persistPath?: string;

  constructor(options: PidRegistryOptions = {}) {
    this.persistPath = options.persistPath;
  }

  static async fromFile(persistPath: string): Promise<PidRegistry> {
    const registry = new PidRegistry({ persistPath });
    await registry.load();
    return registry;
  }

  async load(): Promise<void> {
    if (!this.persistPath) {
      return;
    }
    try {
      const raw = await readFile(this.persistPath, 'utf-8');
      const parsed = JSON.parse(raw) as PersistedRegistry;
      this.processes.clear();
      for (const entry of parsed.processes ?? []) {
        if (Number.isFinite(entry.pid)) {
          this.processes.set(entry.pid, entry);
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('[pid-registry] Failed to load registry', error);
      }
    }
  }

  async register(entry: Omit<RegisteredProcess, 'createdAt'>): Promise<void> {
    if (!Number.isFinite(entry.pid)) {
      return;
    }
    this.processes.set(entry.pid, {
      ...entry,
      createdAt: new Date().toISOString(),
    });
    await this.save();
  }

  async unregister(pid: number): Promise<void> {
    if (!Number.isFinite(pid)) {
      return;
    }
    this.processes.delete(pid);
    await this.save();
  }

  async clear(): Promise<void> {
    this.processes.clear();
    if (!this.persistPath) {
      return;
    }
    await rm(this.persistPath, { force: true });
  }

  async killAll(signals: NodeJS.Signals[] = ['SIGTERM', 'SIGKILL']): Promise<void> {
    const entries = [...this.processes.values()];
    for (const signal of signals) {
      for (const entry of entries) {
        this.killOne(entry, signal);
      }
      if (signal !== signals[signals.length - 1]) {
        await delay(250);
      }
    }
  }

  list(): RegisteredProcess[] {
    return [...this.processes.values()];
  }

  private killOne(entry: RegisteredProcess, signal: NodeJS.Signals): void {
    if (!Number.isFinite(entry.pid)) {
      return;
    }
    if (entry.killGroup) {
      try {
        process.kill(-entry.pid, signal);
        return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
          console.warn(`[pid-registry] Failed to kill group for pid ${entry.pid}`, error);
        }
      }
    }
    try {
      process.kill(entry.pid, signal);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
        console.warn(`[pid-registry] Failed to kill pid ${entry.pid}`, error);
      }
    }
  }

  private async save(): Promise<void> {
    if (!this.persistPath) {
      return;
    }
    const payload: PersistedRegistry = {
      processes: [...this.processes.values()],
    };
    await mkdir(path.dirname(this.persistPath), { recursive: true });
    await writeFile(this.persistPath, JSON.stringify(payload, null, 2));
  }
}
