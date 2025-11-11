import { create } from "zustand";
import type {
  Character,
  LocationProfile,
  SessionRecord,
  TranscriptEntry,
  Turn
} from "@glass-frontier/dto";

import type {
  ChatMessage,
  CharacterCreationDraft,
  SessionStore
} from "../state/sessionState";
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

const generateId = () => {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

const createMessageId = (): string => generateId();

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

const mergeSessionRecord = (list: SessionRecord[], session: SessionRecord) => {
  const filtered = list.filter((existing) => existing.id !== session.id);
  return [session, ...filtered];
};

const mergeCharacterRecord = (list: Character[], character: Character) => {
  const filtered = list.filter((existing) => existing.id !== character.id);
  return [character, ...filtered];
};

const DEFAULT_LOCATION_ID = "at-home";
const DEFAULT_MOMENTUM = { current: 0, floor: -2, ceiling: 3 };

const createBaseState = () => ({
  sessionId: null as string | null,
  sessionRecord: null as SessionRecord | null,
  loginId: null as string | null,
  loginName: null as string | null,
  preferredCharacterId: null as string | null,
  messages: [] as ChatMessage[],
  turnSequence: 0,
  connectionState: "idle" as const,
  transportError: null as Error | null,
  isSending: false,
  isOffline: false,
  queuedIntents: 0,
  sessionStatus: "open" as const,
  character: null as Character | null,
  location: null as LocationProfile | null,
  recentSessions: readRecentSessions(),
  availableCharacters: [] as Character[],
  availableSessions: [] as SessionRecord[],
  directoryStatus: "idle" as const,
  directoryError: null as Error | null
});

export const useSessionStore = create<SessionStore>()((set, get) => ({
  ...createBaseState(),

  setPreferredCharacterId(characterId) {
    set((prev) => ({
      ...prev,
      preferredCharacterId: characterId && characterId.trim().length > 0 ? characterId.trim() : null
    }));
  },

  async refreshLoginResources() {
    const identity = resolveLoginIdentity();
    set((prev) => ({
      ...prev,
      loginId: identity.loginId,
      loginName: identity.loginName,
      directoryStatus: "loading",
      directoryError: null
    }));

    try {
      const [characters, sessions] = await Promise.all([
        trpcClient.listCharacters.query({ loginId: identity.loginId }),
        trpcClient.listSessions.query({ loginId: identity.loginId })
      ]);

      set((prev) => ({
        ...prev,
        loginId: identity.loginId,
        loginName: identity.loginName,
        directoryStatus: "ready",
        availableCharacters: characters ?? [],
        availableSessions: sessions ?? [],
        directoryError: null,
        preferredCharacterId:
          prev.preferredCharacterId ?? characters?.[0]?.id ?? prev.preferredCharacterId
      }));
    } catch (error) {
      const nextError =
        error instanceof Error ? error : new Error("Failed to load character directory.");
      set((prev) => ({
        ...prev,
        directoryStatus: "error",
        directoryError: nextError
      }));
      throw nextError;
    }
  },

  async hydrateSession(sessionId) {
    if (!sessionId) {
      throw new Error("Session id is required.");
    }

    set((prev) => ({
      ...prev,
      connectionState: prev.sessionId === sessionId ? prev.connectionState : "connecting",
      transportError: null
    }));

    try {
      const session = await trpcClient.getSession.query({ sessionId });
      if (!session) {
        throw new Error("Session not found.");
      }

      set((prev) => ({
        ...prev,
        sessionId: session.sessionId,
        sessionRecord: session.session ?? prev.sessionRecord,
        loginId: session.session?.loginId ?? prev.loginId,
        messages: flattenTurns(session.turns ?? []),
        turnSequence: session.turnSequence ?? session.turns?.length ?? 0,
        connectionState: "connected",
        sessionStatus: session.session?.status ?? "open",
        character: session.character ?? null,
        location: session.location ?? null,
        transportError: null,
        recentSessions: applyRecentSession(prev.recentSessions, session.sessionId),
        availableSessions:
          session.session && prev.availableSessions
            ? mergeSessionRecord(prev.availableSessions, session.session)
            : prev.availableSessions
      }));

      return session.sessionId;
    } catch (error) {
      const nextError =
        error instanceof Error
          ? error
          : new Error("Failed to connect to the narrative engine.");
      set((prev) => ({
        ...prev,
        connectionState: "error",
        transportError: nextError
      }));
      throw nextError;
    }
  },

  async createSessionForCharacter(characterId) {
    const identity = resolveLoginIdentity();
    try {
      const result = await trpcClient.createSession.mutate({
        loginId: identity.loginId,
        characterId: characterId ?? undefined
      });
      set((prev) => ({
        ...prev,
        availableSessions: mergeSessionRecord(prev.availableSessions, result.session),
        preferredCharacterId: characterId ?? prev.preferredCharacterId ?? null
      }));
      return get().hydrateSession(result.session.id);
    } catch (error) {
      const nextError =
        error instanceof Error ? error : new Error("Failed to create session.");
      set((prev) => ({
        ...prev,
        transportError: nextError
      }));
      throw nextError;
    }
  },

  async createCharacterProfile(draft) {
    const identity = resolveLoginIdentity();
    const character: Character = {
      id: generateId(),
      loginId: identity.loginId,
      locationId: DEFAULT_LOCATION_ID,
      name: draft.name,
      archetype: draft.archetype,
      pronouns: draft.pronouns,
      tags: [],
      momentum: DEFAULT_MOMENTUM,
      attributes: draft.attributes,
      skills: Object.entries(draft.skills).reduce<Character["skills"]>((acc, [name, skill]) => {
        acc[name] = { ...skill, xp: 0 };
        return acc;
      }, {})
    };

    try {
      const { character: stored } = await trpcClient.createCharacter.mutate(character);
      set((prev) => ({
        ...prev,
        availableCharacters: mergeCharacterRecord(prev.availableCharacters, stored),
        preferredCharacterId: stored.id,
        directoryStatus: prev.directoryStatus === "idle" ? "ready" : prev.directoryStatus,
        directoryError: null
      }));
    } catch (error) {
      const nextError =
        error instanceof Error ? error : new Error("Failed to create character.");
      set((prev) => ({
        ...prev,
        directoryError: nextError,
        directoryStatus: prev.directoryStatus === "idle" ? "error" : prev.directoryStatus
      }));
      throw nextError;
    }
  },

  clearActiveSession() {
    set((prev) => ({
      ...prev,
      sessionId: null,
      sessionRecord: null,
      messages: [],
      turnSequence: 0,
      connectionState: "idle",
      transportError: null,
      isSending: false,
      queuedIntents: 0,
      sessionStatus: "open",
      character: null,
      location: null
    }));
  },

  resetStore() {
    set((prev) => ({
      ...prev,
      ...createBaseState()
    }));
  },

  async sendPlayerMessage({ content }) {
    const trimmed = content.trim();
    if (!trimmed) {
      return;
    }

    const sessionId = get().sessionId;
    if (!sessionId) {
      const error = new Error("Select or create a session before sending intents.");
      set((prev) => ({
        ...prev,
        transportError: error
      }));
      throw error;
    }

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
        ),
        availableSessions:
          updatedSession.session && prev.availableSessions
            ? mergeSessionRecord(prev.availableSessions, updatedSession.session)
            : prev.availableSessions
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
