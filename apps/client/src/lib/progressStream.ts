import { TurnProgressResponseSchema, type TurnProgressEvent } from '@glass-frontier/dto';

import { getConfigValue, getEnvValue } from '../utils/runtimeConfig';
import { authenticatedFetch } from './authenticatedFetch';

const POLL_INTERVAL_MS = 750;
const listeners = new Set<(event: TurnProgressEvent) => void>();

const hasNonEmptyString = (value: string | undefined | null): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const resolveEndpoint = (): string => {
  const apiTarget = getConfigValue('VITE_API_TARGET') ?? getEnvValue('VITE_API_TARGET');
  if (!hasNonEmptyString(apiTarget)) {
    return '/progress';
  }
  return `${apiTarget.trim().replace(/\/$/u, '')}/progress`;
};

const eventIdentity = (event: TurnProgressEvent): string =>
  `${event.turnSequence}#${event.step}#${event.nodeId}#${event.status}`;

export class ProgressStream {
  private readonly activeSubscriptions = new Set<string>();
  private readonly endpoint = resolveEndpoint();
  private readonly failedSubscriptions = new Set<string>();
  private readonly seenEvents = new Map<string, Set<string>>();
  private pollInFlight = false;
  private pollTimer: number | null = null;
  private token: string | null = null;

  connect(token: string): void {
    if (typeof window === 'undefined' || !hasNonEmptyString(token)) {
      return;
    }
    this.token = token;
    this.schedulePoll(0);
  }

  disconnect(): void {
    this.token = null;
    if (typeof window !== 'undefined' && this.pollTimer !== null) {
      window.clearTimeout(this.pollTimer);
    }
    this.pollTimer = null;
    this.activeSubscriptions.clear();
    this.failedSubscriptions.clear();
    this.seenEvents.clear();
  }

  subscribe(jobId: string): void {
    const trimmedJobId = jobId.trim();
    if (trimmedJobId.length === 0) {
      return;
    }
    this.activeSubscriptions.add(trimmedJobId);
    this.seenEvents.set(trimmedJobId, new Set());
    this.schedulePoll(0);
  }

  markComplete(jobId: string | null): void {
    if (!hasNonEmptyString(jobId)) {
      return;
    }
    this.activeSubscriptions.delete(jobId);
    this.failedSubscriptions.delete(jobId);
    this.seenEvents.delete(jobId);
  }

  onEvent(listener: (event: TurnProgressEvent) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  private async poll(): Promise<void> {
    if (this.pollInFlight || !hasNonEmptyString(this.token)) {
      return;
    }
    const jobIds = Array.from(this.activeSubscriptions);
    if (jobIds.length === 0) {
      return;
    }

    this.pollInFlight = true;
    try {
      await Promise.all(jobIds.map((jobId) => this.pollJob(jobId)));
    } finally {
      this.pollInFlight = false;
      if (this.activeSubscriptions.size > 0 && hasNonEmptyString(this.token)) {
        this.schedulePoll(POLL_INTERVAL_MS);
      }
    }
  }

  private async pollJob(jobId: string): Promise<void> {
    const token = this.token;
    if (!hasNonEmptyString(token)) {
      return;
    }

    try {
      const response = await authenticatedFetch(`${this.endpoint}/${encodeURIComponent(jobId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error(`Progress request failed with status ${response.status}`);
      }
      const payload = TurnProgressResponseSchema.parse(await response.json());
      if (!this.activeSubscriptions.has(jobId)) {
        return;
      }

      const seen = this.seenEvents.get(jobId) ?? new Set<string>();
      for (const event of payload.events) {
        const identity = eventIdentity(event);
        if (!seen.has(identity)) {
          seen.add(identity);
          listeners.forEach((listener) => listener(event));
        }
      }
      this.seenEvents.set(jobId, seen);
      this.failedSubscriptions.delete(jobId);
    } catch (error: unknown) {
      if (!this.failedSubscriptions.has(jobId)) {
        console.warn('Failed to poll turn progress', error);
        this.failedSubscriptions.add(jobId);
      }
    }
  }

  private schedulePoll(delay: number): void {
    if (
      typeof window === 'undefined' ||
      this.pollTimer !== null ||
      this.pollInFlight ||
      !hasNonEmptyString(this.token) ||
      this.activeSubscriptions.size === 0
    ) {
      return;
    }
    this.pollTimer = window.setTimeout(() => {
      this.pollTimer = null;
      void this.poll();
    }, delay);
  }
}

export const progressStream = new ProgressStream();
