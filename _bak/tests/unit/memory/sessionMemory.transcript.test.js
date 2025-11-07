"use strict";

import { SessionMemoryFacade  } from "../../../_src_bak/memory/sessionMemory.js";

describe("SessionMemoryFacade · transcript + change feed integration", () => {
  test("appendTranscript records transcript entry and change-feed metadata", () => {
    const sessionMemory = new SessionMemoryFacade();
    const sessionId = "session-transcript-1";

    sessionMemory.appendTranscript(sessionId, {
      role: "player",
      content: "I scout the relay corridors.",
      metadata: { turn: 1 }
    });

    const session = sessionMemory.getSessionState(sessionId);
    expect(session.transcript).toHaveLength(1);
    expect(session.transcript[0].content).toBe("I scout the relay corridors.");
    expect(
      session.changeFeed.some(
        (entry) =>
          entry.shard === "transcript" &&
          entry.actor === "player" &&
          entry.after.content === "I scout the relay corridors."
      )
    ).toBe(true);
  });

  test("recordCheckResolution appends a system transcript entry with metadata", () => {
    const sessionMemory = new SessionMemoryFacade();
    const sessionId = "session-transcript-2";

    sessionMemory.recordCheckRequest(sessionId, {
      id: "check-1",
      turnSequence: 1,
      data: {
        move: "delve-the-ruins",
        difficulty: "standard",
        difficultyValue: 8,
        mechanics: {
          statValue: 2
        }
      }
    });

    sessionMemory.recordCheckResolution(sessionId, {
      id: "check-1",
      sessionId,
      result: "full-success",
      tier: "full-success",
      move: "delve-the-ruins",
      dice: {
        kept: [5, 4],
        statValue: 2
      },
      momentum: {
        after: 1,
        delta: 1
      }
    });

    const transcript = sessionMemory.getSessionState(sessionId).transcript;
    const systemEntry = transcript.find((entry) => entry.metadata?.type === "check-resolution");
    expect(systemEntry).toBeDefined();
    expect(systemEntry.metadata.checkId).toBe("check-1");
    expect(systemEntry.metadata.momentumAfter).toBe(1);
  });

  test("recordCheckVeto appends a veto system transcript entry", () => {
    const sessionMemory = new SessionMemoryFacade();
    const sessionId = "session-transcript-3";

    sessionMemory.recordCheckVeto(sessionId, {
      id: "check-2",
      sessionId,
      reason: "prohibited-capability",
      safetyFlags: ["prohibited-capability"]
    });

    const transcript = sessionMemory.getSessionState(sessionId).transcript;
    const vetoEntry = transcript.find((entry) => entry.metadata?.type === "check-veto");
    expect(vetoEntry).toBeDefined();
    expect(vetoEntry.metadata.reason).toBe("prohibited-capability");
    expect(vetoEntry.metadata.safetyFlags).toEqual(["prohibited-capability"]);
  });
});

