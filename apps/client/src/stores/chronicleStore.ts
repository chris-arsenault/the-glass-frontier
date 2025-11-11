import { create } from "zustand";
import type {
  Character,
  Chronicle,
  LocationProfile,
  TranscriptEntry,
  Turn
} from "@glass-frontier/dto";

import type {
  ChatMessage,
  CharacterCreationDraft,
  ChronicleCreationDetails,
  ChronicleStore,
  MomentumTrend,
  SkillProgressBadge
} from "../state/chronicleState";
import { trpcClient } from "../lib/trpcClient";
import { useAuthStore } from "./authStore";

const RECENT_CHRONICLES_KEY = "glass-frontier-recent-chronicles";
const MAX_RECENT_CHRONICLES = 5;

const readRecentChronicles = (): string[] => {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(RECENT_CHRONICLES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value) => typeof value === "string") : [];
  } catch {
    return [];
  }
};

const writeRecentChronicles = (chronicles: string[]) => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(RECENT_CHRONICLES_KEY, JSON.stringify(chronicles));
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
  playerIntent: extras?.playerIntent ?? null,
  gmSummary: extras?.gmSummary ?? null,
  skillProgress: extras?.skillProgress ?? null
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
      playerIntent: turn.playerIntent ?? null,
      gmSummary: turn.gmSummary ?? null,
      skillProgress: null
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

const applyRecentChronicle = (chronicles: string[], chronicleId: string): string[] => {
  const next = [chronicleId, ...chronicles.filter((id) => id !== chronicleId)].slice(
    0,
    MAX_RECENT_CHRONICLES
  );
  writeRecentChronicles(next);
  return next;
};

const mergeChronicleRecord = (list: Chronicle[], chronicle: Chronicle) => {
  const filtered = list.filter((existing) => existing.id !== chronicle.id);
  return [chronicle, ...filtered];
};

const mergeCharacterRecord = (list: Character[], character: Character) => {
  const filtered = list.filter((existing) => existing.id !== character.id);
  return [character, ...filtered];
};

const DEFAULT_MOMENTUM = { current: 0, floor: -2, ceiling: 3 };

const deriveSkillProgressBadges = (
  previous: Character | null,
  next: Character | null
): SkillProgressBadge[] => {
  if (!previous || !next) {
    return [];
  }
  const badges: SkillProgressBadge[] = [];
  for (const [name, skill] of Object.entries(next.skills ?? {})) {
    const prior = previous.skills?.[name];
    if (!prior) {
      badges.push({ type: "skill-gain", skill: name, tier: skill.tier, attribute: skill.attribute });
    } else if (prior.tier !== skill.tier) {
      badges.push({ type: "skill-tier-up", skill: name, tier: skill.tier });
    }
  }
  return badges;
};

const deriveMomentumTrend = (
  previous: Character | null,
  next: Character | null
): MomentumTrend | null => {
  if (!previous || !next) {
    return null;
  }
  const delta = next.momentum.current - previous.momentum.current;
  return {
    direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
    delta,
    previous: previous.momentum.current,
    current: next.momentum.current,
    floor: next.momentum.floor,
    ceiling: next.momentum.ceiling
  };
};

const createBaseState = () => ({
  chronicleId: null as string | null,
  chronicleRecord: null as Chronicle | null,
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
  chronicleStatus: "open" as const,
  character: null as Character | null,
  location: null as LocationProfile | null,
  recentChronicles: readRecentChronicles(),
  availableCharacters: [] as Character[],
  availableChronicles: [] as Chronicle[],
  directoryStatus: "idle" as const,
  directoryError: null as Error | null,
  momentumTrend: null as MomentumTrend | null
});

export const useChronicleStore = create<ChronicleStore>()((set, get) => ({
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
      const [characters, chronicles] = await Promise.all([
        trpcClient.listCharacters.query({ loginId: identity.loginId }),
        trpcClient.listChronicles.query({ loginId: identity.loginId })
      ]);

      set((prev) => ({
        ...prev,
        loginId: identity.loginId,
        loginName: identity.loginName,
        directoryStatus: "ready",
        availableCharacters: characters ?? [],
        availableChronicles: chronicles ?? [],
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

  async hydrateChronicle(chronicleId) {
    if (!chronicleId) {
      throw new Error("Chronicle id is required.");
    }

    set((prev) => ({
      ...prev,
      connectionState: prev.chronicleId === chronicleId ? prev.connectionState : "connecting",
      transportError: null
    }));

    try {
      const chronicleState = await trpcClient.getChronicle.query({ chronicleId });
      if (!chronicleState) {
        throw new Error("Chronicle not found.");
      }

      set((prev) => ({
        ...prev,
        chronicleId: chronicleState.chronicleId,
        chronicleRecord: chronicleState.chronicle ?? prev.chronicleRecord,
        loginId: chronicleState.chronicle?.loginId ?? prev.loginId,
        messages: flattenTurns(chronicleState.turns ?? []),
        turnSequence: chronicleState.turnSequence ?? chronicleState.turns?.length ?? 0,
        connectionState: "connected",
        chronicleStatus: chronicleState.chronicle?.status ?? "open",
        character: chronicleState.character ?? null,
        location: chronicleState.location ?? null,
        transportError: null,
        momentumTrend:
          prev.chronicleId === chronicleState.chronicleId ? prev.momentumTrend : null,
        recentChronicles: applyRecentChronicle(
          prev.recentChronicles,
          chronicleState.chronicleId
        ),
        availableChronicles:
          chronicleState.chronicle && prev.availableChronicles
            ? mergeChronicleRecord(prev.availableChronicles, chronicleState.chronicle)
            : prev.availableChronicles
      }));

      return chronicleState.chronicleId;
    } catch (error) {
      const nextError =
        error instanceof Error ? error : new Error("Failed to connect to the narrative engine.");
      set((prev) => ({
        ...prev,
        connectionState: "error",
        transportError: nextError
      }));
      throw nextError;
    }
  },

  async createChronicleForCharacter(details: ChronicleCreationDetails) {
    const identity = resolveLoginIdentity();
    const targetCharacterId = details.characterId ?? get().preferredCharacterId;
    const title = details.title?.trim() ?? "";
    const locationName = details.locationName?.trim() ?? "";
    const locationAtmosphere = details.locationAtmosphere?.trim() ?? "";

    if (!targetCharacterId) {
      throw new Error("Select a character before starting a chronicle.");
    }
    if (!title || !locationName || !locationAtmosphere) {
      throw new Error("Chronicle title, location name, and atmosphere are required.");
    }

    try {
      const result = await trpcClient.createChronicle.mutate({
        loginId: identity.loginId,
        characterId: targetCharacterId,
        title,
        location: {
          locale: locationName,
          atmosphere: locationAtmosphere
        }
      });
      set((prev) => ({
        ...prev,
        availableChronicles: mergeChronicleRecord(prev.availableChronicles, result.chronicle),
        preferredCharacterId: targetCharacterId
      }));
      return get().hydrateChronicle(result.chronicle.id);
    } catch (error) {
      const nextError =
        error instanceof Error ? error : new Error("Failed to create chronicle.");
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

  clearActiveChronicle() {
    set((prev) => ({
      ...prev,
      chronicleId: null,
      chronicleRecord: null,
      messages: [],
      turnSequence: 0,
      connectionState: "idle",
      transportError: null,
      isSending: false,
      queuedIntents: 0,
      chronicleStatus: "open",
      character: null,
      location: null,
      momentumTrend: null
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

    const chronicleId = get().chronicleId;
    if (!chronicleId) {
      const error = new Error("Select or create a chronicle before sending intents.");
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
      const { turn, character } = await trpcClient.postMessage.mutate({
        chronicleId,
        content: playerEntry
      });

      set((prev) => {
        const nextCharacter = character ?? prev.character;
        const skillBadges = character
          ? deriveSkillProgressBadges(prev.character, character)
          : [];
        const nextMomentumTrend = character
          ? deriveMomentumTrend(prev.character, character) ?? prev.momentumTrend
          : prev.momentumTrend;

        const extras = {
          skillCheckPlan: turn.skillCheckPlan ?? null,
          skillCheckResult: turn.skillCheckResult ?? null,
          skillKey: turn.playerIntent?.skill ?? null,
          attributeKey: turn.playerIntent?.attribute ?? null,
          playerIntent: turn.playerIntent ?? null,
          gmSummary: turn.gmSummary ?? null,
          skillProgress: skillBadges.length > 0 ? skillBadges : null
        };

        const nextMessages = prev.messages
          .map((message) =>
            message.entry.id === turn.playerMessage.id
              ? {
                  ...message,
                  skillCheckPlan: extras.skillCheckPlan,
                  skillCheckResult: extras.skillCheckResult,
                  skillKey: extras.skillKey,
                  attributeKey: extras.attributeKey,
                  playerIntent: extras.playerIntent
                }
              : message
          )
          .concat(
            turn.gmMessage ? [toChatMessage(turn.gmMessage, extras)] : [],
            turn.systemMessage ? [toChatMessage(turn.systemMessage, extras)] : []
          );

        return {
          ...prev,
          isSending: false,
          messages: nextMessages,
          queuedIntents: 0,
          turnSequence: Math.max(prev.turnSequence, turn.turnSequence),
          connectionState: "connected",
          transportError: null,
          character: nextCharacter,
          availableCharacters: character
            ? mergeCharacterRecord(prev.availableCharacters, character)
            : prev.availableCharacters,
          momentumTrend: nextMomentumTrend,
          recentChronicles: applyRecentChronicle(
            prev.recentChronicles,
            prev.chronicleId ?? chronicleId
          )
        };
      });
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
