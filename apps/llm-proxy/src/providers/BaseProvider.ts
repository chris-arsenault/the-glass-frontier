'use strict';

import { fetch } from 'undici';
import type { Response } from 'undici';

import type { Payload } from '../Payload';
import { ProviderError } from './ProviderError';

abstract class BaseProvider {
  id = '';
  aliases: string[] = [];
  supportsStreaming = false;
  target = '';
  apiKey = '';
  valid = true;
  headers: Record<string, string> = {};

  async execute(body: Payload, signal?: AbortSignal | undefined): Promise<Response> {
    try {
      return fetch(this.target, {
        body: body.serialize(),
        headers: this.headers,
        method: 'POST',
        signal,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'unknown';
      throw new ProviderError({
        code: 'openai_upstream_unreachable',
        details: { message },
        retryable: true,
        status: 502,
      });
    }
  }

  isValid(): boolean {
    return this.valid;
  }

  abstract preparePayload(payload: Payload): Payload;
}

export { BaseProvider };
