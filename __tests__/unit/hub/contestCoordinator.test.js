"use strict";

const { ContestCoordinator } = require("../../../src/hub/orchestrator/contestCoordinator");

function buildContestEntry({ actorId, targetActorId, issuedAt, contestKey }) {
  return {
    hubId: "hub-test",
    roomId: "room-test",
    actorId,
    command: {
      verbId: "verb.testContest",
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
        hubId: "hub-test",
        roomId: "room-test",
        contestKey,
        move: "test-contest",
        label: "Test Contest",
        type: "pvp",
        checkTemplate: "hub.testContest",
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
            verbId: "verb.testContest",
            args: {},
            targetActorId,
            role: "challenger",
            auditRef: `${actorId}-audit`,
            issuedAt
          }
        ],
        contestActors: [actorId, targetActorId],
        createdAt: issuedAt
      }
    }
  };
}

describe("ContestCoordinator", () => {
  test("derives resolvedAt from workflow timings and preserves window metadata", () => {
    const clock = { now: jest.fn() };
    const coordinator = new ContestCoordinator({ clock });
    const contestKey = "verb.testContest:actor-alpha::actor-beta";

    clock.now.mockReturnValue(1000);
    const armingEntry = buildContestEntry({
      actorId: "actor-alpha",
      targetActorId: "actor-beta",
      issuedAt: 1000,
      contestKey
    });

    const arming = coordinator.register({ entry: armingEntry, issuedAt: 1000 });
    expect(arming.status).toBe("arming");
    expect(arming.state.windowMs).toBe(6000);

    clock.now.mockReturnValue(1400);
    const resolvingEntry = buildContestEntry({
      actorId: "actor-beta",
      targetActorId: "actor-alpha",
      issuedAt: 1400,
      contestKey
    });

    const started = coordinator.register({ entry: resolvingEntry, issuedAt: 1400 });
    expect(started.status).toBe("started");
    expect(started.state.windowMs).toBe(6000);

    const { contestId, state } = started;
    const startedAt = state.startedAt;

    clock.now.mockReturnValue(5400);
    const resolved = coordinator.resolve(contestId, {
      timings: {
        resolutionDurationMs: 520
      }
    });

    expect(resolved.resolvedAt).toBe(startedAt + 520);
    expect(resolved.windowMs).toBe(6000);
  });
});
