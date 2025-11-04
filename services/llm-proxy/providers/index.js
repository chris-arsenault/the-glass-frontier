"use strict";

const { createOpenAiProvider } = require("./openai");
const { createAnthropicProvider } = require("./anthropic");

function buildDefaultProviders() {
  return [createOpenAiProvider(), createAnthropicProvider()];
}

module.exports = {
  buildDefaultProviders
};
