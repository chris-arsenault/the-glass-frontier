"use strict";

const { CommandParser } = require("../../../src/hub/commandParser");
const { RateLimiter } = require("../../../src/hub/rateLimiter");
const { VerbCatalog, normalizeVerbDefinition } = require("../../../src/hub/verbCatalog");
const { HubValidationError, HubRateLimitError } = require("../../../src/hub/commandErrors");

function buildCatalog() {
  return new VerbCatalog([
    normalizeVerbDefinition({
      verbId: "verb.test",
      parameters: [
        {
          name: "message",
          type: "string",
          required: true,
          maxLength: 50
        }
      ],
      rateLimit: {
        burst: 1,
        perSeconds: 60,
        scope: "actor"
      }
    }),
    normalizeVerbDefinition({
      verbId: "verb.capability",
      capabilities: [
        {
          capabilityId: "capability.spectrumless-manifest"
        }
      ]
    })
  ]);
}

describe("CommandParser", () => {
  let parser;
  let rateLimiter;

  beforeEach(() => {
    rateLimiter = new RateLimiter({
      clock: {
        now: () => 1_000
      }
    });
    parser = new CommandParser({
      verbCatalog: buildCatalog(),
      rateLimiter,
      clock: {
        now: () => 1_000
      }
    });
  });

  test("parses valid command and returns normalized payload", () => {
    const result = parser.parse({
      verb: "verb.test",
      actorId: "actor-1",
      roomId: "room-1",
      hubId: "hub-1",
      args: { message: "Hello" },
      metadata: {}
    });

    expect(result.verb.verbId).toBe("verb.test");
    expect(result.args).toEqual({ message: "Hello" });
    expect(result.metadata.issuedAt).toBe(1_000);
  });

  test("throws when actor lacks required capability", () => {
    expect(() =>
      parser.parse({
        verb: "verb.capability",
        actorId: "actor-1",
        roomId: "room-1",
        hubId: "hub-1",
        args: {},
        metadata: {
          actorCapabilities: []
        }
      })
    ).toThrow(HubValidationError);
  });

  test("enforces rate limiting per actor", () => {
    parser.parse({
      verb: "verb.test",
      actorId: "actor-1",
      roomId: "room-1",
      hubId: "hub-1",
      args: { message: "Hello" },
      metadata: {}
    });

    expect(() =>
      parser.parse({
        verb: "verb.test",
        actorId: "actor-1",
        roomId: "room-1",
        hubId: "hub-1",
        args: { message: "Second" },
        metadata: {}
      })
    ).toThrow(HubRateLimitError);
  });
});
