"use strict";

import { HubNarrativeBridge, renderNarrativeInput  } from "../../_src_bak/hub/narrative/hubNarrativeBridge.js";

describe("HubNarrativeBridge", () => {
  test("packages hub context and annotates LangGraph envelope", async () => {
    const handlePlayerMessage = jest.fn().mockResolvedValue({
      narrativeEvent: { content: "Hub narration" },
      checkRequest: null,
      safety: null,
      promptPackets: [],
      auditTrail: []
    });

    const fakeStateStore = {
      getRoomState: jest.fn().mockResolvedValue({
        hubId: "hub-alpha",
        roomId: "room-1",
        version: 3,
        state: {
          commandCount: 2,
          recentCommands: [
            { actorId: "actor-b", verbId: "verb.say", args: { message: "hi" }, issuedAt: 1000 }
          ],
          participants: [
            {
              connectionId: "conn-a",
              actorId: "actor-a",
              characterId: "char-a",
              metadata: { role: "scout" }
            }
          ],
          pendingTrades: [],
          rituals: []
        }
      })
    };

    const bridge = new HubNarrativeBridge({
      narrativeEngine: {
        handlePlayerMessage,
        sessionMemory: {
          getMomentumState: jest.fn().mockReturnValue({ current: 1, floor: -2, ceiling: 3 })
        }
      },
      stateStore: fakeStateStore,
      clock: { now: () => 1234 }
    });

    const result = await bridge.escalate({
      verb: {
        verbId: "verb.say",
        label: "Say",
        safetyTags: ["chat"],
        capabilities: [
          {
            capabilityId: "capability.mass-mind-control",
            label: "Mass Mind Control",
            severity: "critical",
            rationale: "Prohibited capability"
          }
        ],
        narrative: { escalation: "auto", narrationTemplate: "chat.say" }
      },
      actorId: "actor-a",
      roomId: "room-1",
      hubId: "hub-alpha",
      args: { message: "Signal" },
      metadata: {
        sessionId: "session-123",
        issuedAt: 999,
        safetyFlags: ["manual-flag"],
        contestedActors: ["actor-b"]
      }
    });

    expect(handlePlayerMessage).toHaveBeenCalledTimes(1);
    const call = handlePlayerMessage.mock.calls[0][0];
    expect(call.sessionId).toBe("session-123");
    expect(call.metadata.topic).toBe("intent.hubNarration");
    expect(call.metadata.hubContext.recentCommands).toHaveLength(1);
    expect(call.metadata.hubContext.safety.tags).toContain("chat");
    expect(call.metadata.hubContext.safety.contested).toBe(true);
    expect(call.metadata.capabilityRefs[0]).toMatchObject({
      capabilityId: "capability.mass-mind-control",
      severity: "critical"
    });
    expect(result.auditRef).toBeTruthy();
    expect(result.hubContext.roomState.participants[0]).toMatchObject({ actorId: "actor-a" });
  });

  test("renderNarrativeInput serialises command args", () => {
    const text = renderNarrativeInput({
      verb: { label: "Offer Trade" },
      actorId: "actor-1",
      roomId: "room-1",
      args: { target: "actor-2", item: "Glass" }
    });
    expect(text).toContain("actor-1 uses Offer Trade");
    expect(text).toContain("target=\"actor-2\"");
  });
});
