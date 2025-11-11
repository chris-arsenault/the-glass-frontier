'use strict';

import { randomUUID } from 'crypto';

class Payload {
  body: Record<string, any>;
  requestId: string;

  constructor(body: Record<string, any>) {
    this.body = body;
    this.requestId = body.requestId || randomUUID();
  }

  sanitizePayload(): Payload {
    const clone = { ...this.body };
    delete clone.provider;
    delete clone.fallbackProviders;

    if (!clone.model && process.env.LLM_PROXY_DEFAULT_MODEL) {
      clone.model = process.env.LLM_PROXY_DEFAULT_MODEL;
    }

    return new Payload(clone);
  }

  json(): string {
    return JSON.stringify(this.body);
  }
}

export { Payload };
