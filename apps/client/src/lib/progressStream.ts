import type { TurnProgressEvent } from '@glass-frontier/dto';

import { getConfigValue } from '../utils/runtimeConfig';

const listeners = new Set<(event: TurnProgressEvent) => void>();

const resolveEndpoint = (): string | null => {
  const explicit = getConfigValue('VITE_PROGRESS_WS_URL') ?? import.meta.env.VITE_PROGRESS_WS_URL;
  if (explicit && explicit.length > 0) {
    return explicit.replace(/\/$/, '');
  }
  return null;
};

class ProgressStream {
  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private readonly endpoint: string | null = resolveEndpoint();
  private token: string | null = null;
  private manualClose = false;
  private readonly pendingSubscriptions = new Set<string>();
  private readonly activeSubscriptions = new Set<string>();

  connect(token: string) {
    if (typeof window === 'undefined') {
      return;
    }
    if (!this.endpoint) {
      console.warn('VITE_PROGRESS_WS_URL is not configured; skipping progress stream connection.');
      return;
    }
    this.token = token;
    this.manualClose = false;
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    this.openSocket();
  }

  disconnect() {
    this.manualClose = true;
    this.token = null;
    if (typeof window !== 'undefined' && this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
    }
    this.reconnectTimer = null;
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.pendingSubscriptions.clear();
    this.activeSubscriptions.clear();
  }

  subscribe(jobId: string) {
    if (!jobId) {
      return;
    }
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.sendSubscribe(jobId);
      this.activeSubscriptions.add(jobId);
      return;
    }
    this.pendingSubscriptions.add(jobId);
    this.ensureConnected();
  }

  markComplete(jobId: string | null) {
    if (!jobId) {
      return;
    }
    this.pendingSubscriptions.delete(jobId);
    this.activeSubscriptions.delete(jobId);
  }

  onEvent(listener: (event: TurnProgressEvent) => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  private ensureConnected() {
    if (!this.token || this.socket) {
      return;
    }
    this.openSocket();
  }

  private openSocket() {
    if (typeof window === 'undefined' || !this.endpoint || !this.token) {
      return;
    }
    const url = `${this.endpoint}?token=${encodeURIComponent(this.token)}`;
    const socket = new WebSocket(url);
    this.socket = socket;

    socket.onopen = () => {
      this.flushSubscriptions();
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        listeners.forEach((listener) => listener(data));
      } catch (error) {
        console.warn('Failed to parse WS payload', error);
      }
    };

    socket.onclose = () => {
      this.socket = null;
      if (this.manualClose || !this.token) {
        return;
      }
      this.scheduleReconnect();
    };

    socket.onerror = () => {
      socket.close();
    };
  }

  private sendSubscribe(jobId: string) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.pendingSubscriptions.add(jobId);
      return;
    }
    this.socket.send(JSON.stringify({ action: 'subscribe', jobId }));
  }

  private flushSubscriptions() {
    const jobs = new Set<string>([...this.activeSubscriptions, ...this.pendingSubscriptions]);
    jobs.forEach((jobId) => {
      this.sendSubscribe(jobId);
      this.activeSubscriptions.add(jobId);
    });
    this.pendingSubscriptions.clear();
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || typeof window === 'undefined') {
      return;
    }
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (this.token) {
        this.openSocket();
      }
    }, 2000);
  }
}

export const progressStream = new ProgressStream();
