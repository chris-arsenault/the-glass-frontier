'use strict';

import type { Payload } from '../Payload';
import { BaseProvider } from './BaseProvider';

const defaultAnthropicEndpoint = 'https://api.anthropic.com/v1/messages';

const readEnvOrFallback = (value: string | undefined, fallback: string): string => {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

const readOptionalEnv = (value: string | undefined): string =>
  typeof value === 'string' ? value.trim() : '';

class AnthropicProvider extends BaseProvider {
  version: string;
  beta: string;

  constructor() {
    super();
    this.id = 'anthropic';
    this.aliases = ['claude', 'claude-3', 'anthropic-messages'];
    this.supportsStreaming = true;

    this.target = readEnvOrFallback(process.env.ANTHROPIC_API_BASE, defaultAnthropicEndpoint);
    this.version = readEnvOrFallback(process.env.ANTHROPIC_VERSION, '2023-06-01');
    this.beta = readEnvOrFallback(process.env.ANTHROPIC_BETA, '0');
    this.apiKey = readOptionalEnv(process.env.ANTHROPIC_API_KEY);

    if (this.apiKey.length === 0) {
      this.valid = false;
    }

    this.headers = {
      'anthropic-version': this.version,
      'content-type': 'application/json',
      'x-api-key': this.apiKey,
    };

    if (this.beta.length > 0) {
      this.headers['anthropic-beta'] = this.beta;
    }
  }

  preparePayload(payload: Payload): Payload {
    const base = payload.sanitizePayload();
    const hasMessages = Array.isArray(base.body.messages);
    const prompt = base.body.prompt;
    const promptValue = typeof prompt === 'string' ? prompt.trim() : '';
    const hasPrompt = promptValue.length > 0;

    if (!hasMessages && hasPrompt) {
      base.body.messages = [
        {
          content: promptValue,
          role: 'user',
        },
      ];
      delete base.body.prompt;
    }

    return base;
  }
}

export { AnthropicProvider };
