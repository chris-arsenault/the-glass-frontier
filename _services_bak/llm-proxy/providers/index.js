"use strict";

import { createOpenAiProvider  } from "./openai.js";
import { createAnthropicProvider  } from "./anthropic.js";

function buildDefaultProviders() {
  return [createOpenAiProvider(), createAnthropicProvider()];
}

export {
  buildDefaultProviders
};
