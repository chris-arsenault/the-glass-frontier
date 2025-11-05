"use strict";

const EventEmitter = require("events");
const path = require("path");
const { createHubApplication } = require("../../../src/hub/hubApplication");
const {
  HubOrchestrator,
  InMemoryRoomStateStore
} = require("../../../src/hub");
const { MockTransport } = require("../../../tests/helpers/mockTransport");

function buildApp(overrides = {}) {
  const telemetryEmitter = overrides.telemetryEmitter || new EventEmitter();
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

  const app = createHubApplication({
    verbCatalogPath: path.join(
      __dirname,
      "../../../src/hub/config/defaultVerbCatalog.json"
    ),
    presenceStore: overrides.presenceStore,
    actionLogRepository: overrides.actionLogRepository,
    telemetryEmitter,
    narrativeEngine,
    clock: overrides.clock || {
      now: () => Date.now()
    }
  });

  return app;
}

describe("HubOrchestrator integration", () => {
  afterEach(async () => {
    jest.clearAllMocks();
  });

  test("processes commands and broadcasts room state updates", async () => {
    const app = buildApp();
    const orchestrator = new HubOrchestrator({
      gateway: app.gateway,
      stateStore: app.roomStateStore || new InMemoryRoomStateStore(),
      presenceStore: app.presenceStore,
      telemetry: app.telemetry,
      clock: { now: () => Date.now() }
    });
    orchestrator.start();

    const transportA = new MockTransport();
    const transportB = new MockTransport();

    await app.gateway.acceptConnection({
      transport: transportA,
      handshake: {
        hubId: "hub-state",
        roomId: "room-alpha",
        actorId: "actor-a",
        sessionId: "session-a",
        connectionId: "conn-a"
      }
    });

    await orchestrator.whenIdle("room-alpha");

    await app.gateway.acceptConnection({
      transport: transportB,
      handshake: {
        hubId: "hub-state",
        roomId: "room-alpha",
        actorId: "actor-b",
        sessionId: "session-b",
        connectionId: "conn-b"
      }
    });

    await orchestrator.whenIdle("room-alpha");

    await transportA.emitMessage({
      type: "hub.command",
      payload: {
        verb: "verb.offerTrade",
        args: { target: "actor-b", item: "Glass Shard" },
        metadata: {}
      }
    });

    await orchestrator.whenIdle("room-alpha");

    const stateUpdate = transportA.messages
      .filter((message) => message.type === "hub.stateUpdate")
      .find((message) => message.payload?.command?.verbId === "verb.offerTrade");

    expect(stateUpdate).toBeDefined();
    expect(stateUpdate.payload.state.pendingTrades).toHaveLength(1);
    expect(stateUpdate.payload.state.pendingTrades[0]).toMatchObject({
      target: "actor-b",
      item: "Glass Shard",
      status: "proposed"
    });
    expect(stateUpdate.payload.state.recentCommands[0].auditRef).toEqual(expect.any(String));

    const snapshot = await app.roomStateStore.getRoomState({
      hubId: "hub-state",
      roomId: "room-alpha"
    });
    expect(snapshot.state.pendingTrades).toHaveLength(1);

    await orchestrator.stop();
  });

  test("emits presence updates and snapshots on reconnect", async () => {
    const app = buildApp();
    const orchestrator = new HubOrchestrator({
      gateway: app.gateway,
      stateStore: app.roomStateStore,
      presenceStore: app.presenceStore,
      telemetry: app.telemetry,
      clock: { now: () => Date.now() }
    });
    orchestrator.start();
    const errors = [];
    orchestrator.on("processingError", (event) => errors.push(event));
    const snapshots = [];
    orchestrator.on("snapshotDispatched", (event) => snapshots.push(event));
    const snapshotEvaluations = [];
    orchestrator.on("snapshotEvaluated", (event) => snapshotEvaluations.push(event));

    const transportA = new MockTransport();

    await app.gateway.acceptConnection({
      transport: transportA,
      handshake: {
        hubId: "hub-presence",
        roomId: "room-beta",
        actorId: "actor-beta",
        sessionId: "session-beta",
        connectionId: "conn-beta"
      }
    });

    await orchestrator.whenIdle("room-beta");

    const joinUpdate = transportA.messages.find(
      (message) =>
        message.type === "hub.stateUpdate" &&
        message.payload?.meta?.presenceEvent?.type === "join"
    );
    expect(joinUpdate).toBeDefined();
    expect(joinUpdate.payload.state.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ actorId: "actor-beta" })
      ])
    );

    const reconnectTransport = new MockTransport();

    await app.gateway.acceptConnection({
      transport: reconnectTransport,
      handshake: {
        hubId: "hub-presence",
        roomId: "room-beta",
        actorId: "actor-reconnect",
        sessionId: "session-reconnect",
        connectionId: "conn-reconnect"
      }
    });

    await orchestrator.whenIdle("room-beta");
    await new Promise((resolve) => setImmediate(resolve));
    expect(snapshotEvaluations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          connectionId: "conn-reconnect",
          snapshot: expect.any(Object)
        })
      ])
    );

    expect(snapshots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          connectionId: "conn-reconnect",
          hubId: "hub-presence",
          roomId: "room-beta"
        })
      ])
    );

    const stateUpdateForReconnect = reconnectTransport.messages
      .filter((message) => message.type === "hub.stateUpdate")
      .pop();
    expect(stateUpdateForReconnect).toBeDefined();
    expect(stateUpdateForReconnect.payload.state.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ actorId: "actor-beta" }),
        expect.objectContaining({ actorId: "actor-reconnect" })
      ])
    );

    reconnectTransport.close();
    await orchestrator.whenIdle("room-beta");
    await new Promise((resolve) => setImmediate(resolve));

    const leaveUpdate = transportA.messages.find(
      (message) =>
        message.type === "hub.stateUpdate" &&
        message.payload?.meta?.presenceEvent?.type === "leave"
    );
    expect(leaveUpdate).toBeDefined();
    expect(
      leaveUpdate.payload.state.participants.some(
        (participant) => participant.actorId === "actor-reconnect"
      )
    ).toBe(false);

    expect(errors.filter((entry) => entry.stage.startsWith("snapshot")).length).toBe(0);
    await orchestrator.stop();
  });

  test("starts Temporal workflow for ritual verbs and records workflow metadata", async () => {
    const temporalClient = {
      startHubActionWorkflow: jest.fn().mockResolvedValue({
        workflowId: "workflow-ritual",
        runId: "run-ritual"
      })
    };
    const app = buildApp();
    const orchestrator = new HubOrchestrator({
      gateway: app.gateway,
      stateStore: app.roomStateStore,
      presenceStore: app.presenceStore,
      telemetry: app.telemetry,
      temporalClient,
      clock: { now: () => Date.now() }
    });
    orchestrator.start();

    const transport = new MockTransport();
    await app.gateway.acceptConnection({
      transport,
      handshake: {
        hubId: "hub-temporal",
        roomId: "room-ritual",
        actorId: "actor-temporal",
        sessionId: "session-temporal",
        connectionId: "conn-temporal",
        actorCapabilities: ["capability.spectrumless-manifest"]
      }
    });

    await orchestrator.whenIdle("room-ritual");

    await transport.emitMessage({
      type: "hub.command",
      payload: {
        verb: "verb.invokeRelic",
        args: { relicId: "relic-77" },
        metadata: {}
      }
    });

    await orchestrator.whenIdle("room-ritual");

    expect(temporalClient.startHubActionWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        hubId: "hub-temporal",
        roomId: "room-ritual",
        actorId: "actor-temporal",
        verbId: "verb.invokeRelic",
        args: { relicId: "relic-77" }
      })
    );

    const ritualUpdate = transport.messages
      .filter((message) => message.type === "hub.stateUpdate")
      .find((message) => message.payload?.command?.verbId === "verb.invokeRelic");

    expect(ritualUpdate).toBeDefined();
    expect(ritualUpdate.payload.workflow).toMatchObject({
      workflowId: "workflow-ritual",
      runId: "run-ritual"
    });
    expect(ritualUpdate.payload.state.rituals[0]).toMatchObject({
      ritualId: expect.any(String),
      status: "workflow",
      workflowId: "workflow-ritual"
    });

    await orchestrator.stop();
  });

  test("expires contested arming windows and broadcasts timeout events", async () => {
    let currentTime = 1000;
    const clock = { now: () => currentTime };
    const app = buildApp({ clock });
    const orchestrator = new HubOrchestrator({
      gateway: app.gateway,
      stateStore: app.roomStateStore,
      presenceStore: app.presenceStore,
      telemetry: app.telemetry,
      clock,
      maxContestHistory: 5
    });
    const telemetrySpy = jest.spyOn(app.telemetry, "recordContestExpired");
    orchestrator.start();

    const challengerTransport = new MockTransport();
    const defenderTransport = new MockTransport();

    await app.gateway.acceptConnection({
      transport: challengerTransport,
      handshake: {
        hubId: "hub-contest",
        roomId: "room-timeout",
        actorId: "actor-alpha",
        sessionId: "session-alpha",
        connectionId: "conn-alpha"
      }
    });

    await orchestrator.whenIdle("room-timeout");

    await app.gateway.acceptConnection({
      transport: defenderTransport,
      handshake: {
        hubId: "hub-contest",
        roomId: "room-timeout",
        actorId: "actor-beta",
        sessionId: "session-beta",
        connectionId: "conn-beta"
      }
    });

    await orchestrator.whenIdle("room-timeout");

    await challengerTransport.emitMessage({
      type: "hub.command",
      payload: {
        verb: "verb.challengeDuel",
        args: {
          target: "actor-beta",
          stakes: "Test the arena."
        },
        metadata: {}
      }
    });

    await orchestrator.whenIdle("room-timeout");
    expect(telemetrySpy).not.toHaveBeenCalled();

    currentTime = 8200;

    await challengerTransport.emitMessage({
      type: "hub.command",
      payload: {
        verb: "verb.say",
        args: {
          message: "Looks like nobody stepped up."
        },
        metadata: {}
      }
    });

    await orchestrator.whenIdle("room-timeout");

    const expiredUpdate = challengerTransport.messages
      .filter((message) => message.type === "hub.stateUpdate")
      .find((message) => message.payload?.meta?.contestEvent?.status === "expired");

    expect(expiredUpdate).toBeDefined();
    expect(expiredUpdate.payload.meta.contestEvent).toMatchObject({
      status: "expired",
      contestId: null
    });
    expect(expiredUpdate.payload.state.contests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "expired",
          contestKey: expect.any(String)
        })
      ])
    );
    expect(telemetrySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        hubId: "hub-contest",
        roomId: "room-timeout",
        contestKey: expect.any(String)
      })
    );

    await orchestrator.stop();
    telemetrySpy.mockRestore();
  });

  test("coordinates contested duel commands and resolves contest workflow", async () => {
    const temporalClient = {
      startHubActionWorkflow: jest.fn(),
      startHubContestWorkflow: jest.fn().mockResolvedValue({
        workflowId: "contest-workflow",
        runId: "contest-run"
      })
    };
    const app = buildApp();
    const orchestrator = new HubOrchestrator({
      gateway: app.gateway,
      stateStore: app.roomStateStore,
      presenceStore: app.presenceStore,
      telemetry: app.telemetry,
      temporalClient,
      clock: { now: () => Date.now() },
      maxContestHistory: 5
    });
    const telemetrySpy = jest.spyOn(app.telemetry, "recordContestResolved");
    orchestrator.start();

    const challengerTransport = new MockTransport();
    const defenderTransport = new MockTransport();

    await app.gateway.acceptConnection({
      transport: challengerTransport,
      handshake: {
        hubId: "hub-contest",
        roomId: "room-duel",
        actorId: "actor-alpha",
        sessionId: "session-alpha",
        connectionId: "conn-alpha"
      }
    });

    await orchestrator.whenIdle("room-duel");

    await app.gateway.acceptConnection({
      transport: defenderTransport,
      handshake: {
        hubId: "hub-contest",
        roomId: "room-duel",
        actorId: "actor-beta",
        sessionId: "session-beta",
        connectionId: "conn-beta"
      }
    });

    await orchestrator.whenIdle("room-duel");

    await challengerTransport.emitMessage({
      type: "hub.command",
      payload: {
        verb: "verb.challengeDuel",
        args: {
          target: "actor-beta",
          stakes: "First strike takes the lead."
        },
        metadata: {}
      }
    });

    await orchestrator.whenIdle("room-duel");

    const armingUpdate = challengerTransport.messages
      .filter((message) => message.type === "hub.stateUpdate")
      .pop();
    expect(armingUpdate).toBeDefined();
    expect(armingUpdate.payload.meta?.contestEvent).toMatchObject({
      status: "arming",
      contestId: null,
      contestKey: expect.stringContaining("verb.challengeDuel"),
      participants: expect.arrayContaining([expect.objectContaining({ actorId: "actor-alpha" })])
    });
    expect(armingUpdate.payload.state.contests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "arming",
          participants: expect.arrayContaining([
            expect.objectContaining({ actorId: "actor-alpha", role: "challenger" })
          ])
        })
      ])
    );

    await defenderTransport.emitMessage({
      type: "hub.command",
      payload: {
        verb: "verb.challengeDuel",
        args: {
          target: "actor-alpha",
          stakes: "Winner claims the shard."
        },
        metadata: {}
      }
    });

    await orchestrator.whenIdle("room-duel");

    expect(temporalClient.startHubContestWorkflow).toHaveBeenCalledTimes(1);
    const contestPayload = temporalClient.startHubContestWorkflow.mock.calls[0][0];
    expect(contestPayload).toMatchObject({
      contestId: expect.any(String),
      hubId: "hub-contest",
      roomId: "room-duel",
      contestKey: expect.stringContaining("verb.challengeDuel"),
      participants: expect.arrayContaining([
        expect.objectContaining({ actorId: "actor-alpha", role: "challenger" }),
        expect.objectContaining({ actorId: "actor-beta", role: expect.any(String) })
      ])
    });

    const resolvingUpdate = defenderTransport.messages
      .filter((message) => message.type === "hub.stateUpdate")
      .pop();
    expect(resolvingUpdate).toBeDefined();
    expect(resolvingUpdate.payload.meta?.contestEvent).toMatchObject({
      status: "started",
      contestId: contestPayload.contestId
    });
    expect(resolvingUpdate.payload.state.contests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          contestId: contestPayload.contestId,
          status: "resolving",
          participants: expect.arrayContaining([
            expect.objectContaining({ actorId: "actor-alpha" }),
            expect.objectContaining({ actorId: "actor-beta" })
          ])
        })
      ])
    );

    const resolutionPayload = {
      outcome: { tier: "major-success", summary: "Alpha seizes the initiative." },
      sharedComplications: [
        { tag: "crowd-panics", summary: "Spectators scatter amidst the clash." }
      ],
      participants: [
        {
          actorId: "actor-alpha",
          tier: "major-success",
          summary: "Alpha disarms Beta with a flourish.",
          momentumDelta: 1,
          complications: []
        },
        {
          actorId: "actor-beta",
          tier: "miss",
          summary: "Beta tumbles back, weapon skidding across the floor.",
          momentumDelta: -1,
          complications: [{ tag: "injured", summary: "Suffers a bruised shoulder." }]
        }
      ]
    };

    const resolutionResult = await orchestrator.resolveContest(
      contestPayload.contestId,
      resolutionPayload
    );

    expect(resolutionResult.contest).toMatchObject({
      contestId: contestPayload.contestId,
      status: "resolved",
      outcome: resolutionPayload.outcome,
      sharedComplications: resolutionPayload.sharedComplications
    });

    const challengerFinal = challengerTransport.messages
      .filter((message) => message.type === "hub.stateUpdate")
      .pop();
    const defenderFinal = defenderTransport.messages
      .filter((message) => message.type === "hub.stateUpdate")
      .pop();

    expect(defenderFinal?.payload?.meta?.contestEvent).toMatchObject({
      status: "resolved",
      contestId: contestPayload.contestId
    });
    expect(defenderFinal.payload.meta.contestEvent.outcome).toMatchObject(
      resolutionPayload.outcome
    );
    expect(defenderFinal.payload.state.contests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          contestId: contestPayload.contestId,
          status: "resolved",
          outcome: expect.objectContaining({
            tier: "major-success"
          }),
          participants: expect.arrayContaining([
            expect.objectContaining({
              actorId: "actor-alpha",
              result: expect.objectContaining({
                tier: "major-success",
                momentumDelta: 1
              })
            }),
            expect.objectContaining({
              actorId: "actor-beta",
              result: expect.objectContaining({
                tier: "miss",
                momentumDelta: -1
              })
            })
          ])
        })
      ])
    );
    expect(challengerFinal?.payload?.meta?.contestEvent?.status).toBe("resolved");

    expect(telemetrySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        contestId: contestPayload.contestId,
        hubId: "hub-contest",
        roomId: "room-duel"
      })
    );

    await orchestrator.stop();
    telemetrySpy.mockRestore();
  });
});
