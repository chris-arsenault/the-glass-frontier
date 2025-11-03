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
});
