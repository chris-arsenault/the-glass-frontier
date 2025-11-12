"use strict";

import EventEmitter from "events";
import path from "path";
import { createHubApplication  } from "../../../_src_bak/hub/hubApplication.js";
import { InMemoryPresenceStore  } from "../../../_src_bak/hub/presence/inMemoryPresenceStore.js";
import { InMemoryActionLogRepository  } from "../../../_src_bak/hub/actionLog/inMemoryActionLogRepository.js";
import { MockTransport  } from "../../../tests/helpers/mockTransport.js";

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
      },
      sessionMemory: {
        getMomentumState() {
          return { current: 0, floor: -2, ceiling: 3 };
        }
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

  test("emits telemetry for contested and safety escalations", async () => {
    const telemetryEmitter = new EventEmitter();
    const contestedEvents = [];
    const safetyEvents = [];
    const deliveredEvents = [];
    telemetryEmitter.on("telemetry.hub.contestedAction", (event) => contestedEvents.push(event));
    telemetryEmitter.on("telemetry.hub.safetyEscalated", (event) => safetyEvents.push(event));
    telemetryEmitter.on("telemetry.hub.narrativeDelivered", (event) => deliveredEvents.push(event));

    const narrativeEngine = {
      async handlePlayerMessage() {
        return {
          narrativeEvent: { content: "Contest resolved" },
          checkRequest: { id: "check-42", auditRef: "audit-42" },
          safety: {
            escalate: true,
            severity: "high",
            flags: ["tag:ritual"],
            auditRef: "audit-42"
          },
          promptPackets: [],
          auditTrail: []
        };
      },
      sessionMemory: {
        getMomentumState() {
          return { current: 2, floor: -2, ceiling: 3 };
        }
      }
    };

    const app = createHubApplication({
      verbCatalogPath: path.join(
        __dirname,
        "../../../src/hub/config/defaultVerbCatalog.json"
      ),
      telemetryEmitter,
      narrativeEngine,
      presenceStore: new InMemoryPresenceStore(),
      actionLogRepository: new InMemoryActionLogRepository(),
      clock: {
        now: () => Date.now()
      }
    });

    const transport = new MockTransport();
    await app.gateway.acceptConnection({
      transport,
      handshake: {
        hubId: "hub-telemetry",
        roomId: "room-1",
        actorId: "actor-1",
        sessionId: "session-telemetry",
        connectionId: "conn-telemetry",
        actorCapabilities: ["capability.spectrumless-manifest"]
      }
    });

    await transport.emitMessage({
      type: "hub.command",
      payload: {
        verb: "verb.invokeRelic",
        args: { relicId: "relic-9" },
        metadata: { safetyFlags: ["manual-flag"], auditRef: "audit-42" }
      }
    });

    expect(contestedEvents).toHaveLength(1);
    expect(contestedEvents[0].checkId).toBe("check-42");
    expect(safetyEvents).toHaveLength(1);
    expect(safetyEvents[0].auditRef).toBe("audit-42");
    expect(deliveredEvents).toHaveLength(1);
    expect(deliveredEvents[0].auditRef).toBe("audit-42");
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
