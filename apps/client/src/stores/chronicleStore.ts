import type {
  Character,
  Chronicle,
  ChronicleBeat,
  LocationSummary,
  TranscriptEntry,
  Turn,
  TurnProgressEvent,
  PendingEquip,
  BeatDelta,
  PlayerPreferences,
} from '@glass-frontier/dto';
import { createEmptyInventory } from '@glass-frontier/dto';
import { formatTurnJobId } from '@glass-frontier/utils';
import { create } from 'zustand';

import { progressStream } from '../lib/progressStream';
import { trpcClient } from '../lib/trpcClient';
import type {
  ChronicleState,
  ChatMessage,
  CharacterCreationDraft,
  ChronicleCreationDetails,
  ChronicleSeedCreationDetails,
  ChronicleStore,
  MomentumTrend,
  SkillProgressBadge,
  PlayerSettings,
} from '../state/chronicleState';
import { decodeJwtPayload } from '../utils/jwt';
import { useAuthStore } from './authStore';

const resolveLoginIdentity = (): { loginId: string; loginName: string } => {
  const authState = useAuthStore.getState();
  const username = authState.username?.trim();
  if (username) {
    return { loginId: username, loginName: username };
  }
  const payload = decodeJwtPayload(authState.tokens?.idToken);
  const sub = typeof payload?.sub === 'string' ? payload.sub : null;
  if (sub) {
    return { loginId: sub, loginName: sub };
  }
  throw new Error('Login identity unavailable. Please reauthenticate.');
};

const DEFAULT_PLAYER_SETTINGS: PlayerSettings = {
  feedbackVisibility: 'all',
};

const normalizePlayerSettings = (preferences?: PlayerPreferences | null): PlayerSettings => ({
  feedbackVisibility: preferences?.feedbackVisibility ?? DEFAULT_PLAYER_SETTINGS.feedbackVisibility,
});

const generateId = () => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const toChatMessage = (entry: TranscriptEntry, extras?: Partial<ChatMessage>): ChatMessage => ({
  advancesTimeline: extras?.advancesTimeline ?? null,
  attributeKey: extras?.attributeKey ?? null,
  entry,
  executedNodes: extras?.executedNodes ?? null,
  gmSummary: extras?.gmSummary ?? null,
  gmTrace: extras?.gmTrace ?? null,
  handlerId: extras?.handlerId ?? null,
  intentType: extras?.intentType ?? null,
  inventoryDelta: extras?.inventoryDelta ?? null,
  playerIntent: extras?.playerIntent ?? null,
  skillCheckPlan: extras?.skillCheckPlan ?? null,
  skillCheckResult: extras?.skillCheckResult ?? null,
  skillKey: extras?.skillKey ?? null,
  skillProgress: extras?.skillProgress ?? null,
  turnId: extras?.turnId ?? null,
  turnSequence: extras?.turnSequence ?? null,
  worldDeltaTags: extras?.worldDeltaTags ?? null,
});

const upsertChatEntry = (
  messages: ChatMessage[],
  entry: TranscriptEntry,
  extras?: Partial<ChatMessage>
): ChatMessage[] => {
  const index = messages.findIndex((message) => message.entry.id === entry.id);
  if (index >= 0) {
    const updated = [...messages];
    updated[index] = {
      ...updated[index],
      advancesTimeline: extras?.advancesTimeline ?? updated[index].advancesTimeline,
      attributeKey: extras?.attributeKey ?? updated[index].attributeKey,
      entry,
      executedNodes: extras?.executedNodes ?? updated[index].executedNodes,
      gmSummary: extras?.gmSummary ?? updated[index].gmSummary,
      gmTrace: extras?.gmTrace ?? updated[index].gmTrace,
      handlerId: extras?.handlerId ?? updated[index].handlerId,
      intentType: extras?.intentType ?? updated[index].intentType,
      inventoryDelta: extras?.inventoryDelta ?? updated[index].inventoryDelta,
      playerIntent: extras?.playerIntent ?? updated[index].playerIntent,
      skillCheckPlan: extras?.skillCheckPlan ?? updated[index].skillCheckPlan,
      skillCheckResult: extras?.skillCheckResult ?? updated[index].skillCheckResult,
      skillKey: extras?.skillKey ?? updated[index].skillKey,
      turnId: extras?.turnId ?? updated[index].turnId,
      turnSequence: extras?.turnSequence ?? updated[index].turnSequence,
      worldDeltaTags: extras?.worldDeltaTags ?? updated[index].worldDeltaTags,
    };
    return updated;
  }
  return messages.concat([toChatMessage(entry, extras)]);
};

const flattenTurns = (turns: Turn[]): ChatMessage[] =>
  turns.flatMap((turn) => {
    const skillKey = turn.playerIntent?.skill ?? null;
    const attributeKey = turn.playerIntent?.attribute ?? null;
    const extras = {
      advancesTimeline:
        typeof turn.advancesTimeline === 'boolean' ? turn.advancesTimeline : null,
      attributeKey,
      executedNodes: turn.executedNodes ?? null,
      gmSummary: turn.gmSummary ?? null,
      gmTrace: turn.gmTrace ?? null,
      handlerId: turn.handlerId ?? null,
      intentType: turn.resolvedIntentType ?? turn.playerIntent?.intentType ?? null,
      inventoryDelta: turn.inventoryDelta ?? null,
      playerIntent: turn.playerIntent ?? null,
      skillCheckPlan: turn.skillCheckPlan ?? null,
      skillCheckResult: turn.skillCheckResult ?? null,
      skillKey,
      skillProgress: null,
      turnId: turn.id ?? null,
      turnSequence: turn.turnSequence ?? null,
      worldDeltaTags: turn.worldDeltaTags ?? null,
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
  content,
  id: createMessageId(),
  metadata: {
    tags: [],
    timestamp: Date.now(),
  },
  role: 'player',
});

const createSeedChatMessage = (seedText: string): ChatMessage => ({
  attributeKey: null,
  entry: {
    content: seedText,
    id: createMessageId(),
    metadata: {
      tags: ['chronicle-seed'],
      timestamp: Date.now(),
    },
    role: 'gm',
  },
  gmSummary: 'Chronicle seed',
  gmTrace: null,
  inventoryDelta: null,
  playerIntent: null,
  skillCheckPlan: null,
  skillCheckResult: null,
  skillKey: null,
  skillProgress: null,
  turnId: null,
  turnSequence: null,
});

const deriveTitleFromSeed = (seedText: string): string => {
  const words = seedText
    .split(/\s+/)
    .filter((word) => word.trim().length > 0)
    .slice(0, 6);
  if (!words.length) {
    return 'New Chronicle';
  }
  const base = words.join(' ');
  return base.length > 64 ? `${base.slice(0, 61)}…` : base;
};

const isUnequipEntry = (entry: PendingEquip): entry is PendingEquip & { unequip: true } =>
  'unequip' in entry && entry.unequip === true;

const isSameEquipEntry = (a: PendingEquip, b: PendingEquip): boolean => {
  if (isUnequipEntry(a) && isUnequipEntry(b)) {
    return a.slot === b.slot;
  }
  if (!isUnequipEntry(a) && !isUnequipEntry(b) && 'itemId' in a && 'itemId' in b) {
    return a.slot === b.slot && a.itemId === b.itemId;
  }
  return false;
};

const mergeChronicleRecord = (list: Chronicle[], chronicle: Chronicle) => {
  const filtered = list.filter((existing) => existing.id !== chronicle.id);
  return [chronicle, ...filtered];
};

const mergeCharacterRecord = (list: Character[], character: Character) => {
  const filtered = list.filter((existing) => existing.id !== character.id);
  return [character, ...filtered];
};

const upsertBeatRecord = (beats: ChronicleBeat[], candidate: ChronicleBeat): ChronicleBeat[] => {
  const index = beats.findIndex((beat) => beat.id === candidate.id);
  if (index >= 0) {
    const next = [...beats];
    next[index] = candidate;
    return next;
  }
  return [...beats, candidate];
};

const applyBeatStateDelta = (
  beats: ChronicleBeat[],
  delta?: BeatDelta | null
): { beats: ChronicleBeat[]; focusBeatId: string | null } => {
  if (!delta) {
    return { beats, focusBeatId: null };
  }
  let nextBeats = beats;
  for (const entry of delta.updated ?? []) {
    nextBeats = upsertBeatRecord(nextBeats, entry);
  }
  for (const entry of delta.created ?? []) {
    nextBeats = upsertBeatRecord(nextBeats, entry);
  }
  return {
    beats: nextBeats,
    focusBeatId: delta.focusBeatId ?? null,
  };
};

const DEFAULT_MOMENTUM = { ceiling: 3, current: 0, floor: -2 };

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
      badges.push({
        attribute: skill.attribute,
        skill: name,
        tier: skill.tier,
        type: 'skill-gain',
      });
    } else if (prior.tier !== skill.tier) {
      badges.push({ skill: name, tier: skill.tier, type: 'skill-tier-up' });
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
    ceiling: next.momentum.ceiling,
    current: next.momentum.current,
    delta,
    direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
    floor: next.momentum.floor,
    previous: previous.momentum.current,
  };
};

const applyTurnProgressEvent = (
  state: ChronicleState,
  event: TurnProgressEvent
): ChronicleState => {
  if (
    !event.payload ||
    !state.chronicleId ||
    event.chronicleId !== state.chronicleId ||
    (state.pendingTurnJobId && event.jobId !== state.pendingTurnJobId)
  ) {
    return state;
  }

  const payload = event.payload;
  let nextMessages = state.messages;

  if (
    state.pendingPlayerMessageId &&
    (payload.playerIntent || payload.skillCheckPlan || payload.skillCheckResult)
  ) {
    nextMessages = nextMessages.map((message) =>
      message.entry.id === state.pendingPlayerMessageId
        ? {
          ...message,
          advancesTimeline:
              typeof payload.advancesTimeline === 'boolean'
                ? payload.advancesTimeline
                : message.advancesTimeline ?? null,
          attributeKey: payload.playerIntent?.attribute ?? message.attributeKey,
          executedNodes: payload.executedNodes ?? message.executedNodes ?? null,
          handlerId: payload.handlerId ?? message.handlerId ?? null,
          intentType: payload.resolvedIntentType ?? payload.playerIntent?.intentType ?? message.intentType ?? null,
          inventoryDelta: payload.inventoryDelta ?? message.inventoryDelta,
          playerIntent: payload.playerIntent ?? message.playerIntent,
          skillCheckPlan: payload.skillCheckPlan ?? message.skillCheckPlan,
          skillCheckResult: payload.skillCheckResult ?? message.skillCheckResult,
          skillKey: payload.playerIntent?.skill ?? message.skillKey,
          worldDeltaTags: payload.worldDeltaTags ?? message.worldDeltaTags ?? null,
        }
        : message
    );
  }

  const extras: Partial<ChatMessage> = {
    advancesTimeline:
      typeof payload.advancesTimeline === 'boolean' ? payload.advancesTimeline : null,
    attributeKey: payload.playerIntent?.attribute ?? null,
    executedNodes: payload.executedNodes ?? null,
    gmSummary: payload.gmSummary ?? null,
    gmTrace: payload.gmTrace ?? null,
    handlerId: payload.handlerId ?? null,
    intentType: payload.resolvedIntentType ?? payload.playerIntent?.intentType ?? null,
    inventoryDelta: payload.inventoryDelta ?? null,
    playerIntent: payload.playerIntent ?? null,
    skillCheckPlan: payload.skillCheckPlan ?? null,
    skillCheckResult: payload.skillCheckResult ?? null,
    skillKey: payload.playerIntent?.skill ?? null,
    skillProgress: null,
    turnId: null,
    turnSequence: event.turnSequence ?? null,
    worldDeltaTags: payload.worldDeltaTags ?? null,
  };

  if (payload.gmMessage) {
    nextMessages = upsertChatEntry(nextMessages, payload.gmMessage, extras);
  }

  if (payload.systemMessage) {
    nextMessages = upsertChatEntry(nextMessages, payload.systemMessage, extras);
  }

  const shouldClose = payload.chronicleShouldClose === true;
  const beatResult = applyBeatStateDelta(state.beats, payload.beatDelta);
  return {
    ...state,
    beats: beatResult.beats,
    chronicleRecord:
      shouldClose && state.chronicleRecord
        ? { ...state.chronicleRecord, status: 'closed' }
        : state.chronicleRecord
          ? { ...state.chronicleRecord, beats: beatResult.beats }
          : state.chronicleRecord,
    chronicleStatus: shouldClose ? 'closed' : state.chronicleStatus,
    focusedBeatId: beatResult.focusBeatId ?? state.focusedBeatId,
    messages: nextMessages,
  };
};

const createBaseState = () => ({
  availableCharacters: [] as Character[],
  availableChronicles: [] as Chronicle[],
  beats: [] as ChronicleBeat[],
  beatsEnabled: true,
  character: null as Character | null,
  chronicleId: null as string | null,
  chronicleRecord: null as Chronicle | null,
  chronicleStatus: 'open' as const,
  connectionState: 'idle' as const,
  directoryError: null as Error | null,
  directoryStatus: 'idle' as const,
  focusedBeatId: null as string | null,
  isOffline: false,
  isSending: false,
  isUpdatingPlayerSettings: false,
  location: null as LocationSummary | null,
  loginId: null as string | null,
  loginName: null as string | null,
  messages: [] as ChatMessage[],
  momentumTrend: null as MomentumTrend | null,
  pendingEquip: [] as PendingEquip[],
  pendingPlayerMessageId: null as string | null,
  pendingTurnJobId: null as string | null,
  playerSettings: DEFAULT_PLAYER_SETTINGS,
  playerSettingsError: null as Error | null,
  playerSettingsStatus: 'idle' as const,
  preferredCharacterId: null as string | null,
  queuedIntents: 0,
  recentChronicles: [],
  transportError: null as Error | null,
  turnSequence: 0,
});

export const useChronicleStore = create<ChronicleStore>()((set, get) => ({
  ...createBaseState(),

  clearActiveChronicle() {
    set((prev) => ({
      ...prev,
      beats: [],
      beatsEnabled: true,
      character: null,
      chronicleId: null,
      chronicleRecord: null,
      chronicleStatus: 'open',
      connectionState: 'idle',
      focusedBeatId: null,
      isSending: false,
      location: null,
      messages: [],
      momentumTrend: null,
      pendingEquip: [],
      pendingPlayerMessageId: null,
      pendingTurnJobId: null,
      queuedIntents: 0,
      transportError: null,
      turnSequence: 0,
    }));
  },

  clearPendingEquipQueue() {
    set((prev) => ({
      ...prev,
      pendingEquip: [],
    }));
  },

  async createCharacterProfile(draft: CharacterCreationDraft) {
    const identity = resolveLoginIdentity();
    const character: Character = {
      archetype: draft.archetype,
      attributes: draft.attributes,
      id: generateId(),
      inventory: createEmptyInventory(),
      loginId: identity.loginId,
      momentum: DEFAULT_MOMENTUM,
      name: draft.name,
      pronouns: draft.pronouns,
      skills: Object.entries(draft.skills).reduce<Character['skills']>((acc, [name, skill]) => {
        acc[name] = { ...skill, xp: 0 };
        return acc;
      }, {}),
      tags: [],
    };

    try {
      const { character: stored } = await trpcClient.createCharacter.mutate(character);
      set((prev) => ({
        ...prev,
        availableCharacters: mergeCharacterRecord(prev.availableCharacters, stored),
        directoryError: null,
        directoryStatus: prev.directoryStatus === 'idle' ? 'ready' : prev.directoryStatus,
        preferredCharacterId: stored.id,
      }));
    } catch (error) {
      const nextError = error instanceof Error ? error : new Error('Failed to create character.');
      set((prev) => ({
        ...prev,
        directoryError: nextError,
        directoryStatus: prev.directoryStatus === 'idle' ? 'error' : prev.directoryStatus,
      }));
      throw nextError;
    }
  },

  async createChronicleForCharacter(details: ChronicleCreationDetails) {
    const identity = resolveLoginIdentity();
    const targetCharacterId = details.characterId ?? get().preferredCharacterId;
    const title = details.title?.trim() ?? '';
    const locationName = details.locationName?.trim() ?? '';
    const locationAtmosphere = details.locationAtmosphere?.trim() ?? '';
    const beatsEnabled = details.beatsEnabled ?? true;

    if (!targetCharacterId) {
      throw new Error('Select a character before starting a chronicle.');
    }
    if (!title || !locationName || !locationAtmosphere) {
      throw new Error('Chronicle title, location name, and atmosphere are required.');
    }

    try {
      const result = await trpcClient.createChronicle.mutate({
        beatsEnabled,
        characterId: targetCharacterId,
        location: {
          atmosphere: locationAtmosphere,
          locale: locationName,
        },
        loginId: identity.loginId,
        title,
      });
      set((prev) => ({
        ...prev,
        availableChronicles: mergeChronicleRecord(prev.availableChronicles, result.chronicle),
        preferredCharacterId: targetCharacterId,
      }));
      return get().hydrateChronicle(result.chronicle.id);
    } catch (error) {
      const nextError = error instanceof Error ? error : new Error('Failed to create chronicle.');
      set((prev) => ({
        ...prev,
        transportError: nextError,
      }));
      throw nextError;
    }
  },

  async createChronicleFromSeed(details: ChronicleSeedCreationDetails) {
    const identity = resolveLoginIdentity();
    const targetCharacterId = details.characterId ?? get().preferredCharacterId;
    const trimmedSeed = details.seedText?.trim() ?? '';
    const beatsEnabled = details.beatsEnabled ?? true;
    if (!targetCharacterId) {
      throw new Error('Select a character before starting a chronicle.');
    }
    if (!details.locationId) {
      throw new Error('Select a location before creating a chronicle.');
    }
    if (!trimmedSeed) {
      throw new Error('Provide a seed prompt before creating a chronicle.');
    }

    try {
      const title = details.title?.trim()
        ? details.title.trim()
        : deriveTitleFromSeed(trimmedSeed);
      const result = await trpcClient.createChronicle.mutate({
        beatsEnabled,
        characterId: targetCharacterId,
        locationId: details.locationId,
        loginId: identity.loginId,
        seedText: trimmedSeed,
        status: 'open',
        title,
      });
      set((prev) => ({
        ...prev,
        availableChronicles: mergeChronicleRecord(prev.availableChronicles, result.chronicle),
        preferredCharacterId: targetCharacterId,
      }));
      return get().hydrateChronicle(result.chronicle.id);
    } catch (error) {
      const nextError = error instanceof Error ? error : new Error('Failed to create chronicle.');
      set((prev) => ({
        ...prev,
        transportError: nextError,
      }));
      throw nextError;
    }
  },

  async deleteChronicle(chronicleId) {
    if (!chronicleId) {
      throw new Error('Chronicle id is required.');
    }
    const identity = resolveLoginIdentity();
    const isActive = get().chronicleId === chronicleId;
    try {
      await trpcClient.deleteChronicle.mutate({
        chronicleId,
        loginId: identity.loginId,
      });
      set((prev) => ({
        ...prev,
        availableChronicles: prev.availableChronicles.filter((entry) => entry.id !== chronicleId),
        recentChronicles: prev.recentChronicles.filter((id) => id !== chronicleId),
      }));
      if (isActive) {
        get().clearActiveChronicle();
      }
    } catch (error) {
      const nextError =
        error instanceof Error ? error : new Error('Failed to delete chronicle.');
      set((prev) => ({
        ...prev,
        transportError: nextError,
      }));
      throw nextError;
    }
  },

  async hydrateChronicle(chronicleId) {
    if (!chronicleId) {
      throw new Error('Chronicle id is required.');
    }

    set((prev) => ({
      ...prev,
      connectionState: prev.chronicleId === chronicleId ? prev.connectionState : 'connecting',
      transportError: null,
    }));

    try {
      const chronicleState = await trpcClient.getChronicle.query({ chronicleId });
      if (!chronicleState) {
        throw new Error('Chronicle not found.');
      }

      const messageHistory = flattenTurns(chronicleState.turns ?? []);
      const chronicleBeats = chronicleState.chronicle?.beats ?? [];
      const beatsEnabled = chronicleState.chronicle?.beatsEnabled !== false;
      const initialFocusBeatId =
        chronicleBeats.find((beat) => beat.status === 'in_progress')?.id ?? null;
      if (
        messageHistory.length === 0 &&
        chronicleState.chronicle?.seedText &&
        chronicleState.chronicle.seedText.trim().length > 0
      ) {
        messageHistory.push(createSeedChatMessage(chronicleState.chronicle.seedText));
      }
      set((prev) => ({
        ...prev,
        availableChronicles:
          chronicleState.chronicle && prev.availableChronicles
            ? mergeChronicleRecord(prev.availableChronicles, chronicleState.chronicle)
            : prev.availableChronicles,
        beats: chronicleBeats,
        beatsEnabled,
        character: chronicleState.character ?? null,
        chronicleId: chronicleState.chronicleId,
        chronicleRecord: chronicleState.chronicle ?? prev.chronicleRecord,
        chronicleStatus: chronicleState.chronicle?.status ?? 'open',
        connectionState: 'connected',
        focusedBeatId: initialFocusBeatId,
        location: chronicleState.location ?? null,
        loginId: chronicleState.chronicle?.loginId ?? prev.loginId,
        messages: messageHistory,
        momentumTrend: prev.chronicleId === chronicleState.chronicleId ? prev.momentumTrend : null,
        pendingEquip: [],
        transportError: null,
        turnSequence: chronicleState.turnSequence ?? chronicleState.turns?.length ?? 0,
      }));

      return chronicleState.chronicleId;
    } catch (error) {
      const nextError =
        error instanceof Error ? error : new Error('Failed to connect to the narrative engine.');
      set((prev) => ({
        ...prev,
        connectionState: 'error',
        transportError: nextError,
      }));
      throw nextError;
    }
  },

  async loadPlayerSettings() {
    const loginId = get().loginId ?? get().loginName;
    if (!loginId) {
      return;
    }
    set((prev) => ({
      ...prev,
      playerSettingsError: null,
      playerSettingsStatus: 'loading',
    }));
    try {
      const result = await trpcClient.getPlayerSettings.query({ loginId });
      set((prev) => ({
        ...prev,
        playerSettings: normalizePlayerSettings(result.preferences),
        playerSettingsStatus: 'ready',
      }));
    } catch (error) {
      const nextError =
        error instanceof Error ? error : new Error('Failed to load player settings.');
      set((prev) => ({
        ...prev,
        playerSettingsError: nextError,
        playerSettingsStatus: 'error',
      }));
      throw nextError;
    }
  },

  queueEquipChange(entry) {
    set((prev) => {
      const filtered = prev.pendingEquip.filter((item) => item.slot !== entry.slot);
      const existing = prev.pendingEquip.find((item) => item.slot === entry.slot);
      if (!isUnequipEntry(entry) && prev.character?.inventory?.gear?.[entry.slot]?.id === entry.itemId && !existing) {
        return prev;
      }
      if (isUnequipEntry(entry) && !prev.character?.inventory?.gear?.[entry.slot] && !existing) {
        return prev;
      }
      const sameAction =
        existing &&
        ((isUnequipEntry(existing) && isUnequipEntry(entry)) ||
          (!isUnequipEntry(existing) &&
            !isUnequipEntry(entry) &&
            'itemId' in existing &&
            'itemId' in entry &&
            existing.itemId === entry.itemId));
      return {
        ...prev,
        pendingEquip: sameAction ? filtered : [...filtered, entry],
      };
    });
  },

  async refreshLoginResources() {
    const identity = resolveLoginIdentity();
    set((prev) => ({
      ...prev,
      directoryError: null,
      directoryStatus: 'loading',
      loginId: identity.loginId,
      loginName: identity.loginName,
    }));

    try {
      const [characters, chronicles] = await Promise.all([
        trpcClient.listCharacters.query({ loginId: identity.loginId }),
        trpcClient.listChronicles.query({ loginId: identity.loginId }),
      ]);

      set((prev) => ({
        ...prev,
        availableCharacters: characters ?? [],
        availableChronicles: chronicles ?? [],
        directoryError: null,
        directoryStatus: 'ready',
        loginId: identity.loginId,
        loginName: identity.loginName,
        preferredCharacterId:
          prev.preferredCharacterId ?? characters?.[0]?.id ?? prev.preferredCharacterId,
      }));
    } catch (error) {
      const nextError =
        error instanceof Error ? error : new Error('Failed to load character directory.');
      set((prev) => ({
        ...prev,
        directoryError: nextError,
        directoryStatus: 'error',
      }));
      throw nextError;
    }
  },

  resetStore() {
    set((prev) => ({
      ...prev,
      ...createBaseState(),
    }));
  },

  async sendPlayerMessage({ content }) {
    const trimmed = content.trim();
    if (!trimmed) {
      return;
    }

    const chronicleId = get().chronicleId;
    if (!chronicleId) {
      const error = new Error('Select or create a chronicle before sending intents.');
      set((prev) => ({
        ...prev,
        transportError: error,
      }));
      throw error;
    }
    if (get().chronicleStatus === 'closed') {
      const error = new Error('Chronicle is closed. No further turns can be sent.');
      set((prev) => ({
        ...prev,
        transportError: error,
      }));
      throw error;
    }

    const playerEntry = buildPlayerEntry(trimmed);
    const pendingEquipQueue = get().pendingEquip;
    const playerMessage = toChatMessage(playerEntry, { playerIntent: null });
    const nextTurnSequence = get().turnSequence + 1;
    const jobId = formatTurnJobId(chronicleId, nextTurnSequence);

    set((prev) => ({
      ...prev,
      isSending: true,
      messages: prev.messages.concat(playerMessage),
      pendingPlayerMessageId: playerEntry.id,
      pendingTurnJobId: jobId,
      transportError: null,
      turnSequence: nextTurnSequence,
    }));

    progressStream.subscribe(jobId);

    try {
      const { character, chronicleStatus, location, turn } = await trpcClient.postMessage.mutate({
        chronicleId,
        content: playerEntry,
        pendingEquip: pendingEquipQueue,
      });
      progressStream.markComplete(jobId);

      set((prev) => {
        const nextCharacter = character ?? prev.character;
        const skillBadges = character ? deriveSkillProgressBadges(prev.character, character) : [];
        const nextMomentumTrend = character
          ? (deriveMomentumTrend(prev.character, character) ?? prev.momentumTrend)
          : prev.momentumTrend;
        const beatResult = applyBeatStateDelta(prev.beats, turn.beatDelta);

        const extras = {
          attributeKey: turn.playerIntent?.attribute ?? null,
          gmSummary: turn.gmSummary ?? null,
          gmTrace: turn.gmTrace ?? null,
          inventoryDelta: turn.inventoryDelta ?? null,
          playerIntent: turn.playerIntent ?? null,
          skillCheckPlan: turn.skillCheckPlan ?? null,
          skillCheckResult: turn.skillCheckResult ?? null,
          skillKey: turn.playerIntent?.skill ?? null,
          skillProgress: skillBadges.length > 0 ? skillBadges : null,
          turnId: turn.id ?? null,
          turnSequence: turn.turnSequence ?? null,
        };

        const updatedMessages = prev.messages.map((message) =>
          message.entry.id === turn.playerMessage.id
            ? {
              ...message,
              attributeKey: extras.attributeKey,
              inventoryDelta: extras.inventoryDelta,
              playerIntent: extras.playerIntent,
              skillCheckPlan: extras.skillCheckPlan,
              skillCheckResult: extras.skillCheckResult,
              skillKey: extras.skillKey,
            }
            : message
        );

        let nextMessages = updatedMessages;
        if (turn.gmMessage) {
          nextMessages = upsertChatEntry(nextMessages, turn.gmMessage, extras);
        }
        if (turn.systemMessage) {
          nextMessages = upsertChatEntry(nextMessages, turn.systemMessage, extras);
        }

        const shouldCloseChronicle = chronicleStatus === 'closed';
        return {
          ...prev,
          availableCharacters: character
            ? mergeCharacterRecord(prev.availableCharacters, character)
            : prev.availableCharacters,
          beats: beatResult.beats,
          beatsEnabled: prev.beatsEnabled,
          character: nextCharacter,
          chronicleRecord:
            shouldCloseChronicle && prev.chronicleRecord
              ? { ...prev.chronicleRecord, beats: beatResult.beats, status: 'closed' }
              : prev.chronicleRecord
                ? { ...prev.chronicleRecord, beats: beatResult.beats }
                : prev.chronicleRecord,
          chronicleStatus: chronicleStatus ?? prev.chronicleStatus,
          connectionState: 'connected',
          focusedBeatId: beatResult.focusBeatId ?? prev.focusedBeatId,
          isSending: false,
          location: location ?? prev.location,
          messages: nextMessages,
          momentumTrend: nextMomentumTrend,
          pendingEquip: prev.pendingEquip.filter(
            (entry) => !pendingEquipQueue.some((sent) => isSameEquipEntry(entry, sent))
          ),
          pendingPlayerMessageId:
            prev.pendingPlayerMessageId === playerEntry.id ? null : prev.pendingPlayerMessageId,
          pendingTurnJobId: prev.pendingTurnJobId === jobId ? null : prev.pendingTurnJobId,
          queuedIntents: 0,
          transportError: null,
          turnSequence: Math.max(prev.turnSequence, turn.turnSequence),
        };
      });
    } catch (error) {
      progressStream.markComplete(jobId);
      const nextError = error instanceof Error ? error : new Error('Failed to send player intent.');
      set((prev) => ({
        ...prev,
        connectionState: 'error',
        isSending: false,
        pendingPlayerMessageId:
          prev.pendingPlayerMessageId === playerEntry.id ? null : prev.pendingPlayerMessageId,
        pendingTurnJobId: prev.pendingTurnJobId === jobId ? null : prev.pendingTurnJobId,
        transportError: nextError,
      }));
      throw nextError;
    }
  },

  async setChronicleWrapTarget(shouldWrap) {
    const chronicleId = get().chronicleId;
    if (!chronicleId) {
      const nextError = new Error('Select or create a chronicle before toggling wrap-up.');
      set((prev) => ({
        ...prev,
        transportError: nextError,
      }));
      throw nextError;
    }
    if (get().chronicleStatus === 'closed') {
      const nextError = new Error('Chronicle is closed. Toggle unavailable.');
      set((prev) => ({
        ...prev,
        transportError: nextError,
      }));
      throw nextError;
    }
    const identity = resolveLoginIdentity();
    const currentTurnSequence = Math.max(get().turnSequence, 0);
    const targetEndTurn = shouldWrap ? currentTurnSequence + 3 : null;

    try {
      const result = await trpcClient.setChronicleTargetEnd.mutate({
        chronicleId,
        loginId: identity.loginId,
        targetEndTurn,
      });
      const updatedChronicle = result?.chronicle ?? null;
      set((prev) => ({
        ...prev,
        availableChronicles:
          updatedChronicle !== null
            ? mergeChronicleRecord(prev.availableChronicles, updatedChronicle)
            : prev.availableChronicles,
        chronicleRecord: updatedChronicle ?? prev.chronicleRecord,
        transportError: null,
      }));
    } catch (error) {
      const nextError =
        error instanceof Error ? error : new Error('Failed to update chronicle wrap state.');
      set((prev) => ({
        ...prev,
        transportError: nextError,
      }));
      throw nextError;
    }
  },

  setPreferredCharacterId(characterId) {
    set((prev) => ({
      ...prev,
      preferredCharacterId:
        characterId && characterId.trim().length > 0 ? characterId.trim() : null,
    }));
  },

  async updatePlayerSettings(settings) {
    const loginId = get().loginId ?? get().loginName;
    if (!loginId) {
      const nextError = new Error('Login not established. Please reauthenticate.');
      set((prev) => ({
        ...prev,
        playerSettingsError: nextError,
      }));
      throw nextError;
    }
    set((prev) => ({
      ...prev,
      isUpdatingPlayerSettings: true,
      playerSettings: settings,
      playerSettingsError: null,
    }));
    try {
      const result = await trpcClient.updatePlayerSettings.mutate({
        loginId,
        preferences: settings,
      });
      set((prev) => ({
        ...prev,
        isUpdatingPlayerSettings: false,
        playerSettings: normalizePlayerSettings(result.preferences),
        playerSettingsStatus: 'ready',
      }));
    } catch (error) {
      const nextError =
        error instanceof Error ? error : new Error('Failed to update player settings.');
      set((prev) => ({
        ...prev,
        isUpdatingPlayerSettings: false,
        playerSettingsError: nextError,
      }));
      throw nextError;
    }
  },
}));

progressStream.onEvent((event) => {
  useChronicleStore.setState((prev) => applyTurnProgressEvent(prev, event));
});
