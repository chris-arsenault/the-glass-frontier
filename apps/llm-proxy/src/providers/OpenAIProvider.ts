"use strict";

import { fetch  } from "undici";
import { ProviderError  } from "./ProviderError";
import { Payload  } from "../Payload";
import {BaseProvider} from "./BaseProvider";

class OpenAIProvider extends BaseProvider {
  constructor() {
    super();
    this.id = "openai";
    this.aliases = ["oai", "gpt", "gpt-4o", "gpt4", "openai-chat"];
    this.supportsStreaming = true;

    this.target = process.env.OPENAI_API_BASE || "https://api.openai.com/v1/chat/completions";
    this.apiKey = process.env.OPENAI_API_KEY || "";

    if (!this.apiKey) {
      this.valid = false;
    }

    this.headers = {
      "content-type": "application/json",
      authorization: `Bearer ${this.apiKey}`,
      "accept-encoding": "identity",
    }
  }

  preparePayload(payload: Payload): Payload {
    return payload.sanitizePayload();
  }
}

export {
  OpenAIProvider
};