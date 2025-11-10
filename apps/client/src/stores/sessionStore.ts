import { create } from "zustand";
import type { TranscriptEntry, Turn } from "@glass-frontier/dto";

import type { ChatMessage, SessionStore } from "../state/sessionState";
import { trpcClient } from "../lib/trpcClient";

const toChatMessage = (
  entry: TranscriptEntry,
  extras?: Partial<ChatMessage>
): ChatMessage => ({
  entry,
  skillCheckPlan: extras?.skillCheckPlan ?? null,
  skillCheckResult: extras?.skillCheckResult ?? null,
  skillKey: extras?.skillKey ?? null,
  attributeKey: extras?.attributeKey ?? null,
  playerIntent: extras?.playerIntent ?? null
});

const flattenTurns = (turns: Turn[]): ChatMessage[] =>
  turns.flatMap((turn) => {
    const skillKey = turn.playerIntent?.skill ?? null;
    const attributeKey = turn.playerIntent?.attribute ?? null;
    const extras = {
      skillCheckPlan: turn.skillCheckPlan ?? null,
      skillCheckResult: turn.skillCheckResult ?? null,
      skillKey,
      attributeKey,
      playerIntent: turn.playerIntent ?? null
    };
    const turnEntries: ChatMessage[] = [];
    if (turn.playerMessage) {
      turnEntries.push(toChatMessage(turn.playerMessage, extras));
    }
    if (turn.gmMessage) {
      turnEntries.push(toChatMessage(turn.gmMessage, extras));
    }
    if (turn.systemMessage) {
      turnEntries.push(toChatMessage(turn.systemMessage, extras));
    }
    return turnEntries;
  });

const createMessageId = (): string => {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const buildPlayerEntry = (content: string): TranscriptEntry => ({
  id: createMessageId(),
  role: "player",
  content,
  metadata: {
    timestamp: Date.now(),
    tags: []
  }
});

export const useSessionStore = create<SessionStore>()((set, get) => ({
  sessionId: null,
  messages: [],
  turnSequence: 0,
  connectionState: "idle",
  transportError: null,
  isSending: false,
  isOffline: false,
  queuedIntents: 0,
  sessionStatus: "open",
  character: null,
  location: null,
  async hydrateSession(desiredSessionId) {
    set((prev) => ({
      ...prev,
      connectionState: prev.connectionState === "connected" ? prev.connectionState : "connecting",
      transportError: null
    }));

    try {
      const session = desiredSessionId
        ? await trpcClient.getSession.query({ sessionId: desiredSessionId })
        : (await trpcClient.createSession.mutate({})).session;

      set((prev) => ({
        ...prev,
        sessionId: session.sessionId,
        messages: flattenTurns(session.turns ?? []),
        turnSequence: session.turnSequence ?? session.turns?.length ?? 0,
        connectionState: "connected",
        sessionStatus: "open",
        transportError: null,
        character: session.character ?? null,
        location: session.location ?? null
      }));

      return session.sessionId;
    } catch (error) {
      const nextError = error instanceof Error ? error : new Error("Failed to connect to the narrative engine.");
      set((prev) => ({
        ...prev,
        connectionState: "error",
        transportError: nextError
      }));
      throw nextError;
    }
  },
  async sendPlayerMessage({ content }) {
    const trimmed = content.trim();
    if (!trimmed) {
      return;
    }

    const ensureSessionId = async (): Promise<string> => {
      if (get().sessionId) {
        return get().sessionId as string;
      }
      return get().hydrateSession();
    };

    const playerEntry = buildPlayerEntry(trimmed);
    const playerMessage = toChatMessage(playerEntry, { playerIntent: null });

    set((prev) => ({
      ...prev,
      isSending: true,
      messages: prev.messages.concat(playerMessage),
      turnSequence: prev.turnSequence + 1,
      transportError: null
    }));

    try {
      const sessionId = await ensureSessionId();
      await trpcClient.postMessage.mutate({
        sessionId,
        content: playerEntry
      });

      const updatedSession = await trpcClient.getSession.query({ sessionId });

      set((prev) => ({
        ...prev,
        isSending: false,
        messages: flattenTurns(updatedSession.turns ?? []),
        queuedIntents: 0,
        connectionState: "connected",
        transportError: null,
        character: updatedSession.character ?? prev.character,
        location: updatedSession.location ?? prev.location
      }));
    } catch (error) {
      const nextError = error instanceof Error ? error : new Error("Failed to send player intent.");
      set((prev) => ({
        ...prev,
        isSending: false,
        connectionState: "error",
        transportError: nextError
      }));
      throw nextError;
    }
  }
}));
