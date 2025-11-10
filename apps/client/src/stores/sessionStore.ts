import { create } from "zustand";
import type { TranscriptEntry, Turn } from "@glass-frontier/dto";

import type { ChatMessage, SessionStore } from "../state/sessionState";
import { trpcClient } from "../lib/trpcClient";
import { useAuthStore } from "./authStore";

const RECENT_SESSIONS_KEY = "glass-frontier-recent-sessions";
const MAX_RECENT_SESSIONS = 5;

const readRecentSessions = (): string[] => {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(RECENT_SESSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value) => typeof value === "string") : [];
  } catch {
    return [];
  }
};

const writeRecentSessions = (sessions: string[]) => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(RECENT_SESSIONS_KEY, JSON.stringify(sessions));
  } catch {
    // ignore storage failures
  }
};

const decodeJwtPayload = (token?: string | null): Record<string, unknown> | null => {
  if (!token) {
    return null;
  }
  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }
  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padding = normalized.length % 4;
    const padded = padding ? normalized + "=".repeat(4 - padding) : normalized;
    if (typeof globalThis.atob !== "function") {
      return null;
    }
    const decoded = globalThis.atob(padded);
    return decoded ? (JSON.parse(decoded) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const resolveLoginIdentity = (): { loginId: string; loginName: string } => {
  const authState = useAuthStore.getState();
  const username = authState.username?.trim();
  if (username) {
    return { loginId: username, loginName: username };
  }
  const payload = decodeJwtPayload(authState.tokens?.idToken);
  const sub = typeof payload?.sub === "string" ? payload.sub : null;
  if (sub) {
    return { loginId: sub, loginName: sub };
  }
  throw new Error("Login identity unavailable. Please reauthenticate.");
};

const tryResolveLoginIdentity = (): { loginId: string | null; loginName: string | null } => {
  try {
    return resolveLoginIdentity();
  } catch {
    return { loginId: null, loginName: null };
  }
};

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

const applyRecentSession = (sessions: string[], sessionId: string): string[] => {
  const next = [sessionId, ...sessions.filter((id) => id !== sessionId)].slice(
    0,
    MAX_RECENT_SESSIONS
  );
  writeRecentSessions(next);
  return next;
};

export const useSessionStore = create<SessionStore>()((set, get) => ({
  sessionId: null,
  sessionRecord: null,
  loginId: null,
  loginName: null,
  preferredCharacterId: null,
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
  recentSessions: readRecentSessions(),
  setPreferredCharacterId(characterId) {
    set({
      preferredCharacterId: characterId && characterId.trim().length > 0 ? characterId.trim() : null
    });
  },
  async hydrateSession(desiredSessionId) {
    set((prev) => ({
      ...prev,
      connectionState: prev.connectionState === "connected" ? prev.connectionState : "connecting",
      transportError: null
    }));

    try {
      let identity = tryResolveLoginIdentity();
      let targetSessionId = desiredSessionId ?? null;

      if (!targetSessionId) {
        if (!identity.loginId) {
          identity = resolveLoginIdentity();
        }
        const created = await trpcClient.createSession.mutate({
          loginId: identity.loginId,
          characterId: get().preferredCharacterId ?? undefined
        });
        targetSessionId = created.session.id;
      }

      if (!targetSessionId) {
        throw new Error("Unable to determine session identifier.");
      }

      const session = await trpcClient.getSession.query({ sessionId: targetSessionId });
      if (!session) {
        throw new Error("Session not found.");
      }

      set((prev) => ({
        ...prev,
        sessionId: session.sessionId,
        sessionRecord: session.session ?? prev.sessionRecord,
        loginId: session.session?.loginId ?? identity.loginId ?? prev.loginId,
        loginName: identity.loginName ?? prev.loginName,
        messages: flattenTurns(session.turns ?? []),
        turnSequence: session.turnSequence ?? session.turns?.length ?? 0,
        connectionState: "connected",
        sessionStatus: session.session?.status ?? prev.sessionStatus ?? "open",
        transportError: null,
        character: session.character ?? null,
        location: session.location ?? null,
        preferredCharacterId: session.character?.id ?? prev.preferredCharacterId,
        recentSessions: applyRecentSession(prev.recentSessions, session.sessionId)
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
        turnSequence:
          updatedSession.turnSequence ??
          updatedSession.turns?.length ??
          prev.turnSequence,
        connectionState: "connected",
        transportError: null,
        sessionRecord: updatedSession.session ?? prev.sessionRecord,
        sessionStatus: updatedSession.session?.status ?? prev.sessionStatus,
        loginId: updatedSession.session?.loginId ?? prev.loginId,
        character: updatedSession.character ?? prev.character,
        location: updatedSession.location ?? prev.location,
        preferredCharacterId: updatedSession.character?.id ?? prev.preferredCharacterId,
        recentSessions: applyRecentSession(
          prev.recentSessions,
          updatedSession.sessionId ?? prev.sessionId ?? ""
        )
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
