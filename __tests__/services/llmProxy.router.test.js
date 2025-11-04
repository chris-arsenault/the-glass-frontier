"use strict";

const { Response, Headers } = require("undici");
const { createRouter } = require("../../services/llm-proxy/router");
const { ProviderError } = require("../../services/llm-proxy/providers/providerError");

function flushAsync() {
  return new Promise((resolve) => setImmediate(resolve));
}

function createMockResponse() {
  const headers = new Map();
  let statusCode = 200;
  let body = null;

  return {
    headers,
    status(code) {
      statusCode = code;
      return this;
    },
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value);
    },
    json(payload) {
      body = payload;
      this.sent = true;
      return this;
    },
    send(payload) {
      body = payload;
      this.sent = true;
      return this;
    },
    end(payload) {
      body = payload;
      this.sent = true;
      return this;
    },
    write(chunk) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      body = body ? Buffer.concat([Buffer.from(body), buffer]) : buffer;
      return true;
    },
    flushHeaders() {},
    destroy() {
      this.destroyed = true;
    },
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    }
  };
}

describe("LLM proxy router", () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test("falls back to secondary provider on retryable status", async () => {
    const body = { provider: "primary", messages: [{ role: "user", content: "ping" }] };
    const buildPayload = jest.fn((payload) => payload);

    const providers = [
      {
        id: "primary",
        aliases: [],
        supportsStreaming: false,
        preparePayload: buildPayload,
        execute: jest.fn().mockResolvedValue(
          new Response(JSON.stringify({ error: "upstream" }), {
            status: 503,
            headers: new Headers({ "content-type": "application/json" })
          })
        )
      },
      {
        id: "secondary",
        aliases: [],
        supportsStreaming: false,
        preparePayload: buildPayload,
        execute: jest.fn().mockResolvedValue(
          new Response(JSON.stringify({ id: "chatcmpl-1", choices: [] }), {
            status: 200,
            headers: new Headers({ "content-type": "application/json" })
          })
        )
      }
    ];

    const logger = jest.fn();
    const router = createRouter({
      providers,
      logger,
      defaultProviderOrder: ["primary", "secondary"],
      timeoutMs: 50
    });

    const res = createMockResponse();

    await router.proxy({ body, res });
    await flushAsync();

    expect(providers[0].execute).toHaveBeenCalledTimes(1);
    expect(providers[1].execute).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body.toString())).toEqual({
      id: "chatcmpl-1",
      choices: []
    });
    expect(logger).toHaveBeenCalled();
  });

  test("responds with final provider error when no fallbacks succeed", async () => {
    const providers = [
      {
        id: "alpha",
        aliases: [],
        supportsStreaming: false,
        preparePayload: (payload) => payload,
        execute: jest.fn().mockRejectedValue(
          new ProviderError({
            code: "alpha_unavailable",
            status: 503,
            retryable: true
          })
        )
      },
      {
        id: "beta",
        aliases: [],
        supportsStreaming: false,
        preparePayload: (payload) => payload,
        execute: jest.fn().mockRejectedValue(
          new ProviderError({
            code: "beta_down",
            status: 502,
            retryable: false
          })
        )
      }
    ];

    const router = createRouter({
      providers,
      allowFallback: true,
      defaultProviderOrder: ["alpha", "beta"]
    });

    const res = createMockResponse();

    await router.proxy({ body: { provider: "alpha", messages: [] }, res });
    await flushAsync();

    expect(providers[0].execute).toHaveBeenCalled();
    expect(providers[1].execute).toHaveBeenCalled();
    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({
      error: "beta_down",
      message: "beta_down"
    });
  });

  test("strips proxy control fields before provider execution", async () => {
    const providers = [
      {
        id: "gamma",
        aliases: [],
        supportsStreaming: false,
        preparePayload: jest.fn((payload) => payload),
        execute: jest.fn().mockResolvedValue(
          new Response("{}", {
            status: 200,
            headers: new Headers({ "content-type": "application/json" })
          })
        )
      }
    ];

    const router = createRouter({
      providers,
      allowFallback: false,
      defaultProviderOrder: ["gamma"]
    });

    const res = createMockResponse();
    const requestBody = {
      provider: "gamma",
      fallbackProviders: ["delta"],
      model: "custom",
      messages: []
    };

    await router.proxy({ body: requestBody, res });
    await flushAsync();

    expect(providers[0].preparePayload).toHaveBeenCalledWith({
      model: "custom",
      messages: []
    });
    expect(providers[0].execute).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });
});
