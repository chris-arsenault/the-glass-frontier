"use strict";

import { fetch  } from "undici";
import { ProviderError  } from "./ProviderError";
import { Payload  } from "../Payload";
import {BaseProvider} from "./BaseProvider";

class AnthropicProvider extends BaseProvider {
  version: string;
  beta: string;

  constructor() {
    super();
    this.id = "anthropic"
    this.aliases = ["claude", "claude-3", "anthropic-messages"]
    this.supportsStreaming = true

    this.target = process.env.ANTHROPIC_API_BASE || "https://api.anthropic.com/v1/messages";
    this.version = process.env.ANTHROPIC_VERSION || "2023-06-01";
    this.beta = process.env.ANTHROPIC_BETA || "0";
    this.apiKey = process.env.ANTHROPIC_API_KEY || "";

    if (!this.apiKey) {
      this.valid = false;
    }

    this.headers = {
       "content-type": "application/json",
       "x-api-key": this.apiKey,
       "anthropic-version": this.version
     };

     if (this.beta) {
       this.headers["anthropic-beta"] = this.beta;
     }
  }

  preparePayload(payload: Payload): Payload {
    const base = payload.sanitizePayload();
    if (!base.body.messages && base.body.prompt) {
      base.body.messages = [
        {
          role: "user",
          content: base.body.prompt
        }
      ];
      delete base.body.prompt;
    }

    return base;
  }
}

export {
  AnthropicProvider
};
