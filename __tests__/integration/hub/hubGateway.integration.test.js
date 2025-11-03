"use strict";

const EventEmitter = require("events");
const path = require("path");
const { createHubApplication } = require("../../../src/hub/hubApplication");
const { InMemoryPresenceStore } = require("../../../src/hub/presence/inMemoryPresenceStore");
const { InMemoryActionLogRepository } = require("../../../src/hub/actionLog/inMemoryActionLogRepository");

class MockTransport {
  constructor() {
    this.messages = [];
    this.messageHandler = null;
    this.closeHandler = null;
  }

  send(payload) {
    this.messages.push(typeof payload === "string" ? JSON.parse(payload) : payload);
  }

  onMessage(handler) {
    this.messageHandler = handler;
  }

  onClose(handler) {
    this.closeHandler = handler;
  }

  emitMessage(payload) {
    if (this.messageHandler) {
      const message = typeof payload === "string" ? payload : JSON.stringify(payload);
      return this.messageHandler(message);
    }
    return null;
  }

  close() {
    if (this.closeHandler) {
      this.closeHandler();
    }
  }
}

class FakeVerbRepository {
  constructor(records = []) {
    this.records = records;
  }

  setRecords(records) {
    this.records = records;
  }

  async listActiveVerbs({ hubId }) {
    return this.records.filter(
      (record) => record.hubId === null || record.hubId === hubId
    );
  }
}

function buildApp(overrides = {}) {
  const presenceStore = overrides.presenceStore || new InMemoryPresenceStore();
  const actionLogRepository =
    overrides.actionLogRepository || new InMemoryActionLogRepository();
  const telemetryEmitter = new EventEmitter();
  const narrativeEngine =
    overrides.narrativeEngine ||
    {
      async handlePlayerMessage() {
        return {
          narrativeEvent: { content: "Narrative response" },
          checkRequest: null
        };
      }
    };

  return createHubApplication({
    verbCatalogPath: path.join(
      __dirname,
      "../../../src/hub/config/defaultVerbCatalog.json"
    ),
    presenceStore,
    actionLogRepository,
    telemetryEmitter,
    narrativeEngine,
    clock: {
      now: () => Date.now()
    }
  });
}

describe("HubGateway integration", () => {
  test("dispatches accepted command, logs it, and escalates to narrative engine", async () => {
    const app = buildApp();
    const transport = new MockTransport();
    const handshake = {
      hubId: "hub-1",
      roomId: "room-1",
      actorId: "actor-1",
      sessionId: "session-1",
      connectionId: "conn-1",
      actorCapabilities: ["capability.spectrumless-manifest"]
    };

    const commandEvents = [];
    app.gateway.onCommand((entry) => commandEvents.push(entry));

    await app.gateway.acceptConnection({ transport, handshake });

    const welcomeMessage = transport.messages.find(
      (message) => message.type === "hub.system.connected"
    );
    expect(welcomeMessage).toBeDefined();

    await transport.emitMessage({
      type: "hub.command",
      payload: {
        verb: "verb.invokeRelic",
        args: { relicId: "relic-001" },
        metadata: {}
      }
    });

    const accepted = transport.messages.find(
      (message) => message.type === "hub.command.accepted"
    );
    expect(accepted).toBeDefined();
    expect(commandEvents).toHaveLength(1);
    expect(commandEvents[0].command.verbId).toBe("verb.invokeRelic");

    const narrativeMessage = transport.messages.find(
      (message) => message.type === "hub.narrative.update"
    );
    expect(narrativeMessage).toBeDefined();
    expect(narrativeMessage.payload.narrativeEvent.content).toContain("Narrative");

    const replay = await app.actionLogRepository.getReplay({
      roomId: "room-1",
      since: 0,
      limit: 10
    });
    expect(replay).toHaveLength(1);
    expect(replay[0].command.verbId).toBe("verb.invokeRelic");
  });

  test("replays previous commands to reconnecting client", async () => {
    const app = buildApp();
    const firstTransport = new MockTransport();

    await app.gateway.acceptConnection({
      transport: firstTransport,
      handshake: {
        hubId: "hub-1",
        roomId: "room-1",
        actorId: "actor-1",
        sessionId: "session-1",
        connectionId: "conn-1"
      }
    });

    await firstTransport.emitMessage({
      type: "hub.command",
      payload: {
        verb: "verb.say",
        args: { message: "Hello hub" },
        metadata: {}
      }
    });

    firstTransport.close();

    const reconnectTransport = new MockTransport();
    await app.gateway.acceptConnection({
      transport: reconnectTransport,
      handshake: {
        hubId: "hub-1",
        roomId: "room-1",
        actorId: "actor-2",
        sessionId: "session-1",
        connectionId: "conn-2"
      }
    });

    const replayMessage = reconnectTransport.messages.find(
      (message) => message.type === "hub.command.replay"
    );
    expect(replayMessage).toBeDefined();
    expect(replayMessage.payload[0]).toMatchObject({
      verbId: "verb.say",
      args: { message: "Hello hub" }
    });
  });

  test("broadcasts catalog sync and updates when verb catalog changes", async () => {
    const repository = new FakeVerbRepository([
      {
        hubId: null,
        verbId: "verb.say",
        version: 1,
        updatedAt: new Date("2025-11-04T10:00:00Z"),
        definition: { verbId: "verb.say", label: "Say" }
      }
    ]);

    const presenceStore = new InMemoryPresenceStore();
    const actionLogRepository = new InMemoryActionLogRepository();
    const telemetryEmitter = new EventEmitter();

    const app = createHubApplication({
      verbCatalogPath: path.join(
        __dirname,
        "../../../src/hub/config/defaultVerbCatalog.json"
      ),
      verbRepository: repository,
      presenceStore,
      actionLogRepository,
      telemetryEmitter,
      clock: { now: () => Date.now() }
    });

    const transport = new MockTransport();
    await app.gateway.acceptConnection({
      transport,
      handshake: {
        hubId: "hub-verb",
        roomId: "room-1",
        actorId: "actor-1",
        sessionId: "session-1",
        connectionId: "conn-1"
      }
    });

    const syncMessage = transport.messages.find(
      (message) => message.type === "hub.catalog.sync"
    );
    expect(syncMessage).toBeDefined();
    expect(syncMessage.payload.verbs.some((verb) => verb.verbId === "verb.say")).toBe(true);

    repository.setRecords([
      {
        hubId: null,
        verbId: "verb.say",
        version: 2,
        updatedAt: new Date("2025-11-04T11:00:00Z"),
        definition: { verbId: "verb.say", label: "Say (v2)" }
      },
      {
        hubId: "hub-verb",
        verbId: "verb.wave",
        version: 1,
        updatedAt: new Date("2025-11-04T11:05:00Z"),
        definition: { verbId: "verb.wave", label: "Wave" }
      }
    ]);

    await app.verbCatalogStore.reload("hub-verb");

    const updateMessage = transport.messages.find(
      (message) => message.type === "hub.catalog.updated"
    );
    expect(updateMessage).toBeDefined();
    expect(updateMessage.payload.versionStamp.startsWith("2:")).toBe(true);
    expect(
      updateMessage.payload.verbs.some((verb) => verb.verbId === "verb.wave")
    ).toBe(true);
  });
});
