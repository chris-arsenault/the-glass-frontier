"use strict";

jest.mock("uuid", () => ({
  v4: jest.fn(() => "contest-uuid")
}));

const { ContestCoordinator } = require("../../../src/hub/orchestrator/contestCoordinator");

function buildContestEntry({
  actorId,
  targetActorId,
  issuedAt,
  contestKey,
  role = "challenger",
  maxParticipants = 2,
  rematch = {
    cooldownMs: 12000,
    offerWindowMs: 90000,
    recommendedVerb: "verb.testContest"
  }
}) {
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
        maxParticipants,
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
            role,
            auditRef: `${actorId}-audit`,
            issuedAt
          }
        ],
        contestActors: [actorId, targetActorId],
        createdAt: issuedAt,
        rematch
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

  test("expires pending contests once the arming window elapses", () => {
    const clock = { now: jest.fn() };
    const coordinator = new ContestCoordinator({ clock });
    const contestKey = "verb.testContest:actor-alpha::actor-beta";

    clock.now.mockReturnValue(1000);
    const entry = buildContestEntry({
      actorId: "actor-alpha",
      targetActorId: "actor-beta",
      issuedAt: 1000,
      contestKey
    });

    const arming = coordinator.register({ entry, issuedAt: 1000 });
    expect(arming.status).toBe("arming");
    expect(coordinator.pendingByRoom.size).toBe(1);

    clock.now.mockReturnValue(8200);
    const expired = coordinator.expire({ roomId: "room-test", now: 8200 });
    expect(expired).toHaveLength(1);
    expect(expired[0]).toMatchObject({
      status: "expired",
      contestKey,
      expiredAt: 8200,
      windowMs: 6000
    });
    expect(expired[0].participants).toHaveLength(1);
    expect(expired[0].outcome).toMatchObject({
      tier: "timeout",
      missingParticipants: 1,
      participantCount: 1,
      requiredParticipants: 2
    });
    expect(expired[0].participants[0].result).toMatchObject({
      tier: "timeout",
      momentumDelta: 0
    });
    expect(expired[0].sharedComplications).toHaveLength(0);
    expect(coordinator.pendingByRoom.size).toBe(0);
  });

  test("applies timeout payouts for multi-actor arming deficits", () => {
    const clock = { now: jest.fn() };
    const coordinator = new ContestCoordinator({ clock });
    const contestKey = "verb.testContest:actor-alpha::actor-beta";

    clock.now.mockReturnValue(1000);
    const initiatorEntry = buildContestEntry({
      actorId: "actor-alpha",
      targetActorId: "actor-beta",
      issuedAt: 1000,
      contestKey,
      maxParticipants: 3
    });

    const arming = coordinator.register({ entry: initiatorEntry, issuedAt: 1000 });
    expect(arming.status).toBe("arming");

    clock.now.mockReturnValue(1400);
    const supportEntry = buildContestEntry({
      actorId: "actor-gamma",
      targetActorId: "actor-beta",
      issuedAt: 1400,
      contestKey,
      maxParticipants: 3
    });

    const supportRegistration = coordinator.register({ entry: supportEntry, issuedAt: 1400 });
    expect(supportRegistration.status).toBe("arming");

    clock.now.mockReturnValue(8200);
    const expired = coordinator.expire({ roomId: "room-test", now: 8200 });
    expect(expired).toHaveLength(1);
    expect(expired[0].participants).toHaveLength(2);
    expect(expired[0].outcome).toMatchObject({
      tier: "timeout",
      missingParticipants: 1,
      participantCount: 2,
      requiredParticipants: 3
    });
    expect(expired[0].sharedComplications).toHaveLength(0);
    const participantResults = expired[0].participants.map((participant) => participant.result);
    expect(participantResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tier: "timeout", momentumDelta: 0 }),
        expect.objectContaining({ tier: "timeout", momentumDelta: 0 })
      ])
    );
  });

  test("enforces rematch cooldown after expiration", () => {
    const clock = { now: jest.fn() };
    const coordinator = new ContestCoordinator({ clock });
    const contestKey = "verb.testContest:actor-alpha::actor-beta";

    clock.now.mockReturnValue(1000);
    const entry = buildContestEntry({
      actorId: "actor-alpha",
      targetActorId: "actor-beta",
      issuedAt: 1000,
      contestKey
    });

    const arming = coordinator.register({ entry, issuedAt: 1000 });
    expect(arming.status).toBe("arming");

    clock.now.mockReturnValue(8200);
    const expired = coordinator.expire({ roomId: "room-test", now: 8200 });
    expect(expired).toHaveLength(1);
    expect(expired[0].rematch).toMatchObject({
      status: "cooldown",
      cooldownMs: 12000
    });

    clock.now.mockReturnValue(8400);
    const repeatEntry = buildContestEntry({
      actorId: "actor-alpha",
      targetActorId: "actor-beta",
      issuedAt: 8400,
      contestKey
    });
    const cooldown = coordinator.register({ entry: repeatEntry, issuedAt: 8400 });
    expect(cooldown.status).toBe("cooldown");
    expect(cooldown.state.rematch).toMatchObject({
      status: "cooldown"
    });
    expect(cooldown.state.rematch.remainingMs).toBeGreaterThan(0);

    clock.now.mockReturnValue(22000);
    const readyEntry = buildContestEntry({
      actorId: "actor-alpha",
      targetActorId: "actor-beta",
      issuedAt: 22000,
      contestKey
    });
    const rematch = coordinator.register({ entry: readyEntry, issuedAt: 22000 });
    expect(rematch.status).toBe("arming");
  });
});
