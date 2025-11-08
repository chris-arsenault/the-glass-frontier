"use strict";

import {Payload} from "../Payload";
import {fetch, Response} from "undici";
import {ProviderError} from "./ProviderError";

abstract class BaseProvider {
  id: string = "";
  aliases: string[] = [];
  supportsStreaming: boolean = false;
  target: string = "";
  apiKey: string = "";
  valid: boolean = true;
  headers: Record<string, string> = {};

  abstract preparePayload(payload: Payload): void;

  async execute(body: Payload, signal?: AbortSignal | undefined): Promise<Response> {
    try {
      return fetch(this.target, {
        method: "POST",
        headers: this.headers,
        body: body.json(),
        signal
      });
    } catch (error: any) {
      throw new ProviderError({
        code: "openai_upstream_unreachable",
        status: 502,
        retryable: true,
        details: error.message
      });
    }
  }

  isValid(): boolean {
    return this.valid;
  }
}

export {
  BaseProvider
};
