'use strict';

import { randomUUID } from 'crypto';

type RawPayload = Record<string, unknown>;

const stripProviderHints = (body: RawPayload): RawPayload => {
  const clone = { ...body };
  delete clone.provider;
  delete clone.fallbackProviders;
  return clone;
};

const resolveModel = (body: RawPayload, defaultModel?: string): RawPayload => {
  const existingModel = body.model;
  const hasModel = typeof existingModel === 'string' && existingModel.trim().length > 0;
  const fallbackModel = typeof defaultModel === 'string' ? defaultModel.trim() : '';

  if (hasModel || fallbackModel.length === 0) {
    return body;
  }

  return { ...body, model: fallbackModel };
};

class Payload {
  readonly body: RawPayload;
  readonly requestId: string;

  constructor(body: RawPayload) {
    this.body = body;
    this.requestId =
      typeof body.requestId === 'string' && body.requestId.trim().length > 0
        ? body.requestId
        : randomUUID();
  }

  sanitizePayload(defaultModel = process.env.LLM_PROXY_DEFAULT_MODEL): Payload {
    const withModel = resolveModel(this.body, defaultModel);
    return new Payload(stripProviderHints(withModel));
  }

  serialize(): string {
    return JSON.stringify(this.body);
  }
}

export { Payload };
