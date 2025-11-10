import { create } from "zustand";
import type { TranscriptEntry, Turn } from "@glass-frontier/dto";

import type { SessionStore } from "../state/sessionState";
import { trpcClient } from "../lib/trpcClient";

const flattenTurns = (turns: Turn[]): TranscriptEntry[] =>
  turns.flatMap((turn) => {
    const entries: TranscriptEntry[] = [turn.playerMessage];
    if (turn.gmMessage) entries.push(turn.gmMessage);
    if (turn.systemMessage) entries.push(turn.systemMessage);
    return entries;
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
        transportError: null
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

    set((prev) => ({
      ...prev,
      isSending: true,
      messages: prev.messages.concat(playerEntry),
      turnSequence: prev.turnSequence + 1,
      transportError: null
    }));

    try {
      const sessionId = await ensureSessionId();
      const response = await trpcClient.postMessage.mutate({
        sessionId,
        content: playerEntry
      });

      const responseEntries = [response.gmMessage, response.systemMessage].filter(
        (entry): entry is TranscriptEntry => Boolean(entry)
      );

      set((prev) => ({
        ...prev,
        isSending: false,
        messages: prev.messages.concat(responseEntries),
        queuedIntents: 0,
        connectionState: "connected",
        transportError: null
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
