"use strict";

jest.mock("uuid", () => ({
  v4: jest.fn(() => "mock-uuid")
}));

const { HubOrchestrator } = require("../../../src/hub");
const { InMemoryRoomStateStore } = require("../../../src/hub/state/inMemoryRoomStateStore");
const { ContestCoordinator } = require("../../../src/hub/orchestrator/contestCoordinator");

function createGateway() {
  return {
    onCommand: jest.fn(),
    onConnectionOpened: jest.fn(),
    onConnectionClosed: jest.fn(),
    removeCommandHandler: jest.fn(),
    removeConnectionOpenedHandler: jest.fn(),
    removeConnectionClosedHandler: jest.fn(),
    sendToConnection: jest.fn()
  };
}

function buildContestEntry({
  actorId,
  targetActorId,
  issuedAt,
  contestKey,
  hubId = "hub-test",
  roomId = "room-test"
}) {
  return {
    hubId,
    roomId,
    actorId,
    command: {
      verbId: "verb.sparringMatch",
      args: {
        target: targetActorId
      },
      metadata: {
        auditRef: `${actorId}-audit`
      }
    },
    metadata: {
      contest: {
        enabled: true,
        hubId,
        roomId,
        contestKey,
        move: "sparring-match",
        label: "Sparring Match",
        type: "pvp",
        checkTemplate: "hub.sparringMatch",
        maxParticipants: 2,
        roles: {
          initiator: "challenger",
          target: "defender",
          support: "ally"
        },
        targetParameter: "target",
        targetActorId,
        windowMs: 6000,
        participants: [
          {
            actorId,
            verbId: "verb.sparringMatch",
            args: {},
            targetActorId,
            role: "challenger",
            auditRef: `${actorId}-audit`,
            issuedAt
          }
        ],
        createdAt: issuedAt,
        rematch: {
          cooldownMs: 12000,
          offerWindowMs: 60000,
          recommendedVerb: "verb.sparringMatch"
        }
      }
    }
  };
}

describe("HubOrchestrator contest telemetry sentiment hooks", () => {
  test("captures rematch telemetry and sentiment samples around cooldown blocks", async () => {
    const clock = {
      now: jest.fn(() => 0)
    };

    const telemetry = {
      recordContestArmed: jest.fn(),
      recordContestLaunched: jest.fn(),
      recordContestExpired: jest.fn(),
      recordContestRematchCooling: jest.fn(),
      recordContestRematchBlocked: jest.fn(),
      recordContestSentiment: jest.fn()
    };

    const orchestrator = new HubOrchestrator({
      gateway: createGateway(),
      stateStore: new InMemoryRoomStateStore({ clock }),
      telemetry,
      clock,
      contestCoordinator: new ContestCoordinator({ clock }),
      presenceStore: {
        listRoomParticipants: jest.fn().mockResolvedValue([])
      }
    });

    clock.now.mockReturnValue(1000);
    const contestKey = "verb.sparringMatch:actor-alpha::actor-beta";
    const initiatorEntry = buildContestEntry({
      actorId: "actor-alpha",
      targetActorId: "actor-beta",
      issuedAt: 1000,
      contestKey
    });

    const arming = await orchestrator._registerContest(initiatorEntry, 1000);
    expect(arming.status).toBe("arming");

    clock.now.mockReturnValue(8200);
    const expired = orchestrator.contestCoordinator.expire({
      roomId: "room-test",
      now: 8200
    });

    expect(expired).toHaveLength(1);
    await orchestrator._recordContestExpiredTelemetry({
      hubId: "hub-test",
      roomId: "room-test",
      contestState: expired[0]
    });

    expect(telemetry.recordContestExpired).toHaveBeenCalled();
    expect(telemetry.recordContestRematchCooling).toHaveBeenCalledWith(
      expect.objectContaining({
        cooldownMs: 12000,
        contestKey
      })
    );
    expect(orchestrator.contestSentimentByRoom.get("room-test")).toMatchObject({
      contestKey,
      cooldownMs: 12000
    });

    clock.now.mockReturnValue(8400);
    const repeatEntry = buildContestEntry({
      actorId: "actor-alpha",
      targetActorId: "actor-beta",
      issuedAt: 8400,
      contestKey
    });

    const cooldownResult = await orchestrator._registerContest(repeatEntry, 8400);
    expect(cooldownResult.status).toBe("cooldown");
    expect(telemetry.recordContestRematchBlocked).toHaveBeenCalledWith(
      expect.objectContaining({
        contestKey,
        remainingMs: expect.any(Number)
      })
    );

    telemetry.recordContestSentiment.mockClear();

    orchestrator._recordContestSentiment({
      hubId: "hub-test",
      roomId: "room-test",
      actorId: "actor-beta",
      message: "This cooldown is frustrating and annoying.",
      issuedAt: 8500
    });

    expect(telemetry.recordContestSentiment).toHaveBeenCalledWith(
      expect.objectContaining({
        contestKey,
        sentiment: "negative",
        phase: "cooldown"
      })
    );
  });
});
