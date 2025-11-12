import type { TurnProgressEvent } from '@glass-frontier/dto';

import { getConfigValue } from '../utils/runtimeConfig';

const listeners = new Set<(event: TurnProgressEvent) => void>();

const hasNonEmptyString = (value: string | undefined | null): value is string => {
  return typeof value === 'string' && value.trim().length > 0;
};

const resolveEndpoint = (): string | null => {
  const envValueRaw: unknown = import.meta.env.VITE_PROGRESS_WS_URL;
  const envValue = typeof envValueRaw === 'string' ? envValueRaw : null;
  const explicit = getConfigValue('VITE_PROGRESS_WS_URL') ?? envValue;
  if (!hasNonEmptyString(explicit)) {
    return null;
  }
  return explicit.trim().replace(/\/$/, '');
};

class ProgressStream {
  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private readonly endpoint: string | null = resolveEndpoint();
  private token: string | null = null;
  private manualClose = false;
  private readonly pendingSubscriptions = new Set<string>();
  private readonly activeSubscriptions = new Set<string>();

  connect(token: string): void {
    if (typeof window === 'undefined') {
      return;
    }
    if (this.endpoint === null) {
      console.warn('VITE_PROGRESS_WS_URL is not configured; skipping progress stream connection.');
      return;
    }
    this.token = token;
    this.manualClose = false;
    if (
      this.socket !== null &&
      (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    this.openSocket();
  }

  disconnect(): void {
    this.manualClose = true;
    this.token = null;
    if (typeof window !== 'undefined' && this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
    }
    this.reconnectTimer = null;
    if (this.socket !== null) {
      this.socket.close();
      this.socket = null;
    }
    this.pendingSubscriptions.clear();
    this.activeSubscriptions.clear();
  }

  subscribe(jobId: string): void {
    const trimmedJobId = jobId.trim();
    if (trimmedJobId.length === 0) {
      return;
    }
    if (this.socket !== null && this.socket.readyState === WebSocket.OPEN) {
      this.sendSubscribe(trimmedJobId);
      this.activeSubscriptions.add(trimmedJobId);
      return;
    }
    this.pendingSubscriptions.add(trimmedJobId);
    this.ensureConnected();
  }

  markComplete(jobId: string | null): void {
    if (!hasNonEmptyString(jobId)) {
      return;
    }
    this.pendingSubscriptions.delete(jobId);
    this.activeSubscriptions.delete(jobId);
  }

  onEvent(listener: (event: TurnProgressEvent) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  private ensureConnected(): void {
    if (!hasNonEmptyString(this.token) || this.socket !== null) {
      return;
    }
    this.openSocket();
  }

  private openSocket(): void {
    if (typeof window === 'undefined' || this.endpoint === null || !hasNonEmptyString(this.token)) {
      return;
    }
    const url = `${this.endpoint}?token=${encodeURIComponent(this.token)}`;
    const socket = new WebSocket(url);
    this.socket = socket;

    socket.onopen = () => {
      this.flushSubscriptions();
    };

    socket.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as TurnProgressEvent;
        listeners.forEach((listener) => listener(data));
      } catch (error) {
        console.warn('Failed to parse WS payload', error);
      }
    };

    socket.onclose = () => {
      this.socket = null;
      if (this.manualClose || !hasNonEmptyString(this.token)) {
        return;
      }
      this.scheduleReconnect();
    };

    socket.onerror = () => {
      socket.close();
    };
  }

  private sendSubscribe(jobId: string): void {
    if (this.socket === null || this.socket.readyState !== WebSocket.OPEN) {
      this.pendingSubscriptions.add(jobId);
      return;
    }
    this.socket.send(JSON.stringify({ action: 'subscribe', jobId }));
  }

  private flushSubscriptions(): void {
    const jobs = new Set<string>([...this.activeSubscriptions, ...this.pendingSubscriptions]);
    jobs.forEach((jobId) => {
      this.sendSubscribe(jobId);
      this.activeSubscriptions.add(jobId);
    });
    this.pendingSubscriptions.clear();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null || typeof window === 'undefined') {
      return;
    }
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (hasNonEmptyString(this.token)) {
        this.openSocket();
      }
    }, 2000);
  }
}

export const progressStream = new ProgressStream();
