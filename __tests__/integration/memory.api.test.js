"use strict";

const request = require("supertest");
const { createApp } = require("../../src/server/app");
const { SessionMemoryFacade } = require("../../src/memory/sessionMemory");
const { NarrativeEngine } = require("../../src/narrative/narrativeEngine");
const { CheckBus } = require("../../src/events/checkBus");
const { createStubLlmClient } = require("../helpers/createStubLlmClient");

describe("Session Memory API", () => {
  let sessionMemory;
  let checkBus;
  let narrativeEngine;
  let broadcaster;
  let app;
  const sessionId = "session-memory-api";

  beforeEach(() => {
    sessionMemory = new SessionMemoryFacade();
    checkBus = new CheckBus();
    narrativeEngine = new NarrativeEngine({
      sessionMemory,
      checkBus,
      llmClient: createStubLlmClient()
    });
    broadcaster = {
      publish: jest.fn(),
      registerStream: jest.fn(() => () => {})
    };

    sessionMemory.ensureSession(sessionId);
    app = createApp({ narrativeEngine, checkBus, broadcaster, sessionMemory });
  });

  test("returns shard metadata and pending flag", async () => {
    const response = await request(app).get(`/sessions/${sessionId}/memory`);

    expect(response.status).toBe(200);
    expect(response.body.sessionId).toBe(sessionId);
    expect(response.body.shards.character).toBeDefined();
    expect(response.body.shards.character.revision).toBe(1);
    expect(response.body.pendingOfflineReconcile).toBe(false);
    expect(Array.isArray(response.body.capabilityReferences)).toBe(true);
  });

  test("updates character shard with optimistic locking and logs change feed", async () => {
    const initial = sessionMemory.getShard(sessionId, "character");
    const updatedCharacter = {
      ...initial.data,
      stats: { ...initial.data.stats, ingenuity: initial.data.stats.ingenuity + 1 },
      tags: [...new Set([...(initial.data.tags || []), "sc.character.progression.test"])]
    };

    const updateResponse = await request(app)
      .put(`/sessions/${sessionId}/memory/character`)
      .send({
        data: updatedCharacter,
        expectedRevision: initial.revision,
        capabilityRefs: [
          { capabilityId: "capability.spectrum-bloom-array", severity: "critical" }
        ],
        reason: "Test memory adjustment"
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.changed).toBe(true);
    expect(updateResponse.body.revision).toBe(initial.revision + 1);

    const memoryResponse = await request(app).get(`/sessions/${sessionId}/memory`);
    expect(memoryResponse.body.pendingOfflineReconcile).toBe(true);
    expect(memoryResponse.body.capabilityReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ capabilityId: "capability.spectrum-bloom-array" })
      ])
    );

    const changesResponse = await request(app)
      .get(`/sessions/${sessionId}/memory/changes`)
      .query({ since: 0 });

    expect(changesResponse.status).toBe(200);
    expect(Array.isArray(changesResponse.body.entries)).toBe(true);
    expect(changesResponse.body.entries.length).toBeGreaterThanOrEqual(1);
    expect(changesResponse.body.entries[0].capabilityRefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ capabilityId: "capability.spectrum-bloom-array" })
      ])
    );

    const acknowledgeResponse = await request(app)
      .post(`/sessions/${sessionId}/memory/ack`)
      .send({ cursor: changesResponse.body.latestCursor });

    expect(acknowledgeResponse.status).toBe(200);
    expect(acknowledgeResponse.body.pending).toBe(false);

    const overlay = sessionMemory.getOverlaySnapshot(sessionId);
    expect(overlay.pendingOfflineReconcile).toBe(false);
  });

  test("rejects stale revisions and unknown capabilities", async () => {
    const character = sessionMemory.getShard(sessionId, "character");

    const staleResponse = await request(app)
      .put(`/sessions/${sessionId}/memory/character`)
      .send({
        data: character.data,
        expectedRevision: character.revision - 1,
        reason: "stale update"
      });

    expect(staleResponse.status).toBe(409);
    expect(staleResponse.body.error).toBe("revision_mismatch");

    const unknownCapabilityResponse = await request(app)
      .put(`/sessions/${sessionId}/memory/character`)
      .send({
        data: character.data,
        expectedRevision: character.revision,
        capabilityRefs: [{ capabilityId: "capability.unknown", severity: "critical" }]
      });

    expect(unknownCapabilityResponse.status).toBe(400);
    expect(unknownCapabilityResponse.body.error).toBe("unknown_capability_reference");
  });
});
