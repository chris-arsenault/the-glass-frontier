import type {
  Character,
  CharacterDraft,
  Chronicle,
  ChronicleBeat,
  TranscriptEntry,
  Turn,
  TurnProgressEvent,
  PlayerPreferences,
} from '@glass-frontier/dto';
import { formatTurnJobId } from '@glass-frontier/utils';
import { create } from 'zustand';

import { gmClient } from '../lib/gmClient';
import { progressStream } from '../lib/progressStream';
import { trpcClient } from '../lib/trpcClient';
import { worldAtlasClient } from '../lib/worldAtlasClient';
import type {
  ChronicleState,
  ChatMessage,
  ChronicleSeedCreationDetails,
  ChronicleStore,
  MomentumTrend,
  PlayerSettings,
  SkillProgressBadge,
  TurnProgress,
  TurnView,
} from '../state/chronicleState';
import { decodeJwtPayload } from '../utils/jwt';
import { useAuthStore } from './authStore';

const resolvePlayerIdentity = (): { playerId: string; playerName: string } => {
  const authState = useAuthStore.getState();
  const payload = decodeJwtPayload(authState.tokens?.idToken);
  const sub = typeof payload?.sub === 'string' ? payload.sub : null;
  if (sub) {
    const fallbackName = authState.username?.trim();
    return { playerId: sub, playerName: fallbackName ?? sub };
  }
  throw new Error('Player identity unavailable. Please reauthenticate.');
};

const DEFAULT_PLAYER_SETTINGS: PlayerSettings = {
  feedbackVisibility: 'all',
};

const normalizePlayerSettings = (preferences?: PlayerPreferences | null): PlayerSettings => ({
  feedbackVisibility: preferences?.feedbackVisibility ?? DEFAULT_PLAYER_SETTINGS.feedbackVisibility,
});

type ChronicleSnapshot = {
  character: Character | null;
  chronicle: (Chronicle & { beats?: ChronicleBeat[] }) | null;
  chronicleId: string;
  locationName: string | null;
  locationId: string | null;
  locationSlug: string | null;
  turnSequence?: number | null;
  turns?: Turn[];
};

const generateId = () => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const emptyTurnView = (): TurnView => ({
  advancesTimeline: null,
  attributeKey: null,
  beatTracker: null,
  entityOffered: null,
  entityUsage: null,
  executedNodes: null,
  gmSummary: null,
  gmTrace: null,
  intentType: null,
  inventoryDelta: null,
  playerIntent: null,
  skillCheckPlan: null,
  skillCheckResult: null,
  skillKey: null,
  skillProgress: null,
  turnId: null,
  turnSequence: null,
});

const turnViewFromTurn = (turn: Turn): TurnView => ({
  advancesTimeline: typeof turn.advancesTimeline === 'boolean' ? turn.advancesTimeline : null,
  attributeKey: turn.skillCheckPlan?.attribute ?? null,
  beatTracker: turn.beatTracker ?? null,
  entityOffered: turn.entityOffered ?? null,
  entityUsage: turn.entityUsage ?? null,
  executedNodes: turn.executedNodes ?? null,
  gmSummary: turn.gmSummary ?? null,
  gmTrace: turn.gmTrace ?? null,
  intentType: turn.playerIntent?.intentType ?? null,
  inventoryDelta: turn.inventoryDelta ?? null,
  playerIntent: turn.playerIntent ?? null,
  skillCheckPlan: turn.skillCheckPlan ?? null,
  skillCheckResult: turn.skillCheckResult ?? null,
  skillKey: turn.skillCheckPlan?.skill ?? null,
  skillProgress: null,
  turnId: turn.id ?? null,
  turnSequence: turn.turnSequence ?? null,
});

const upsertChatEntry = (
  messages: ChatMessage[],
  entry: TranscriptEntry,
  turnKey: string | null
): ChatMessage[] => {
  const index = messages.findIndex((message) => message.entry.id === entry.id);
  if (index >= 0) {
    const updated = [...messages];
    updated[index] = { entry, turnKey };
    return updated;
  }
  return messages.concat([{ entry, turnKey }]);
};

const flattenTurns = (
  turns: Turn[]
): { messages: ChatMessage[]; turnViews: Record<string, TurnView> } => {
  const messages: ChatMessage[] = [];
  const turnViews: Record<string, TurnView> = {};
  for (const turn of turns) {
    const turnKey = turn.id;
    turnViews[turnKey] = turnViewFromTurn(turn);
    if (turn.playerMessage) {
      messages.push({ entry: turn.playerMessage, turnKey });
    }
    if (turn.gmResponse) {
      messages.push({ entry: turn.gmResponse, turnKey });
    }
    if (turn.systemMessage) {
      messages.push({ entry: turn.systemMessage, turnKey });
    }
  }
  return { messages, turnViews };
};

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

const createOpeningChatMessage = (openingText: string): ChatMessage => ({
  entry: {
    content: openingText,
    id: createMessageId(),
    metadata: {
      tags: ['chronicle-opening'],
      timestamp: Date.now(),
    },
    role: 'gm',
  },
  turnKey: null,
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

const mergeChronicleRecord = (list: Chronicle[], chronicle: Chronicle) => {
  const filtered = list.filter((existing) => existing.id !== chronicle.id);
  return [chronicle, ...filtered];
};

const mergeCharacterRecord = (list: Character[], character: Character) => {
  const filtered = list.filter((existing) => existing.id !== character.id);
  return [character, ...filtered];
};

const deriveSkillProgressBadges = (
  previous: Character | null | undefined,
  next: Character | null | undefined
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
  previous: Character | null | undefined,
  next: Character | null | undefined
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
  if (!state.chronicleId || event.chronicleId !== state.chronicleId) {
    return state;
  }

  const isCurrentTurn =
    state.pendingTurnJobId !== null
      ? event.jobId === state.pendingTurnJobId
      : event.turnSequence === state.turnSequence;
  if (!isCurrentTurn) {
    return state;
  }

  const withProgress: ChronicleState = {
    ...state,
    turnProgress: {
      nodeId: event.nodeId,
      status: event.status,
      step: event.step,
      total: event.total,
    },
  };
  // Only successful node payloads carry state worth applying; error payloads
  // reflect an aborted node and the authoritative result arrives via tRPC.
  if (!event.payload || event.status !== 'success') {
    return withProgress;
  }

  const payload = event.payload;
  const turnKey = event.jobId;
  const existing = withProgress.turnViews[turnKey] ?? emptyTurnView();
  const view: TurnView = {
    ...existing,
    advancesTimeline:
      typeof payload.advancesTimeline === 'boolean'
        ? payload.advancesTimeline
        : existing.advancesTimeline,
    attributeKey: payload.skillCheckPlan?.attribute ?? existing.attributeKey,
    beatTracker: payload.beatTracker ?? existing.beatTracker,
    executedNodes: payload.executedNodes ?? existing.executedNodes,
    gmSummary: payload.gmSummary ?? existing.gmSummary,
    gmTrace: payload.gmTrace ?? existing.gmTrace,
    intentType: payload.playerIntent?.intentType ?? existing.intentType,
    inventoryDelta: payload.inventoryDelta ?? existing.inventoryDelta,
    playerIntent: payload.playerIntent ?? existing.playerIntent,
    skillCheckPlan: payload.skillCheckPlan ?? existing.skillCheckPlan,
    skillCheckResult: payload.skillCheckResult ?? existing.skillCheckResult,
    skillKey: payload.skillCheckPlan?.skill ?? existing.skillKey,
    turnSequence: event.turnSequence ?? existing.turnSequence,
  };

  let nextMessages = withProgress.messages;
  if (payload.gmMessage) {
    nextMessages = upsertChatEntry(nextMessages, payload.gmMessage, turnKey);
  }

  const shouldClose = payload.chronicleShouldClose === true;
  return {
    ...withProgress,
    chronicleRecord:
      shouldClose && withProgress.chronicleRecord
        ? { ...withProgress.chronicleRecord, status: 'closed' }
        : withProgress.chronicleRecord,
    chronicleStatus: shouldClose ? 'closed' : withProgress.chronicleStatus,
    focusedBeatId: payload.beatTracker?.focusBeatId ?? withProgress.focusedBeatId,
    messages: nextMessages,
    turnViews: { ...withProgress.turnViews, [turnKey]: view },
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
  isSending: false,
  isUpdatingPlayerSettings: false,
  locationId: null as string | null,
  locationName: null as string | null,
  locationSlug: null as string | null,
  messages: [] as ChatMessage[],
  momentumTrend: null as MomentumTrend | null,
  pendingPlayerMessageId: null as string | null,
  pendingTurnJobId: null as string | null,
  playerId: null as string | null,
  playerName: null as string | null,
  playerSettings: DEFAULT_PLAYER_SETTINGS,
  playerSettingsError: null as Error | null,
  playerSettingsStatus: 'idle' as const,
  preferredCharacterId: null as string | null,
  startLocationName: null as string | null,
  transportError: null as Error | null,
  turnProgress: null as TurnProgress | null,
  turnSequence: 0,
  turnViews: {} as Record<string, TurnView>,
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
      locationId: null,
      locationName: null,
      locationSlug: null,
      messages: [],
      momentumTrend: null,
      pendingPlayerMessageId: null,
      pendingTurnJobId: null,
      startLocationName: null,
      transportError: null,
      turnProgress: null,
      turnSequence: 0,
      turnViews: {},
    }));
  },

  async createCharacterProfile(draft: CharacterDraft) {
    const identity = resolvePlayerIdentity();

    try {
      const { character: stored } = await trpcClient.createCharacter.mutate({
        draft,
        playerId: identity.playerId,
      });
      set((prev) => ({
        ...prev,
        availableCharacters: mergeCharacterRecord(prev.availableCharacters, stored),
        directoryError: null,
        directoryStatus: prev.directoryStatus === 'idle' ? 'ready' : prev.directoryStatus,
        preferredCharacterId: stored.id,
      }));
    } catch (error: unknown) {
      const nextError = error instanceof Error ? error : new Error('Failed to create character.');
      set((prev) => ({
        ...prev,
        directoryError: nextError,
        directoryStatus: prev.directoryStatus === 'idle' ? 'error' : prev.directoryStatus,
      }));
      throw nextError;
    }
  },

  async createChronicleFromSeed(details: ChronicleSeedCreationDetails) {
    const identity = resolvePlayerIdentity();
    const targetCharacterId = details.characterId ?? get().preferredCharacterId;
    const trimmedSeed = details.seedText?.trim() ?? '';
    const locationName = details.locationName?.trim() ?? '';
    const beatsEnabled = details.beatsEnabled ?? true;
    if (!targetCharacterId) {
      throw new Error('Select a character before starting a chronicle.');
    }
    if (!details.locationId || !locationName) {
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
        anchorEntityId: details.anchorEntityId ?? undefined,
        beatsEnabled,
        characterId: targetCharacterId,
        location: { locale: locationName },
        locationId: details.locationId,
        playerId: identity.playerId,
        seedText: trimmedSeed,
        status: 'open',
        title,
        toneChips: details.toneChips,
        toneNotes: details.toneNotes,
      });
      set((prev) => ({
        ...prev,
        availableChronicles: mergeChronicleRecord(prev.availableChronicles, result.chronicle),
        preferredCharacterId: targetCharacterId,
      }));
      return get().hydrateChronicle(result.chronicle.id);
    } catch (error: unknown) {
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
    const identity = resolvePlayerIdentity();
    const isActive = get().chronicleId === chronicleId;
    try {
      await trpcClient.deleteChronicle.mutate({
        chronicleId,
        playerId: identity.playerId,
      });
      set((prev) => ({
        ...prev,
        availableChronicles: prev.availableChronicles.filter((entry) => entry.id !== chronicleId),
      }));
      if (isActive) {
        get().clearActiveChronicle();
      }
    } catch (error: unknown) {
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
      const chronicleSnapshot = (await trpcClient.getChronicle.query({
        chronicleId,
      })) as ChronicleSnapshot | null;
      if (!chronicleSnapshot) {
        throw new Error('Chronicle not found.');
      }
      const chronicleState = chronicleSnapshot;

      const { messages: messageHistory, turnViews } = flattenTurns(chronicleState.turns ?? []);
      const chronicleBeats = chronicleState.chronicle?.beats ?? [];
      const beatsEnabled = chronicleState.chronicle?.beatsEnabled !== false;
      const initialFocusBeatId =
        chronicleBeats.find((beat) => beat.status === 'in_progress')?.id ?? null;
      // The generated scene opener always starts the transcript. The seed
      // remains visible in the overview as the player's chosen premise.
      if (
        chronicleState.chronicle?.openingText &&
        chronicleState.chronicle.openingText.trim().length > 0
      ) {
        messageHistory.unshift(createOpeningChatMessage(chronicleState.chronicle.openingText));
      }
      const locationId = chronicleState.chronicle?.locationId ?? null;
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
        locationId,
        locationName: chronicleState.chronicle?.locationName ?? null,
        locationSlug: null,
        messages: messageHistory,
        momentumTrend: prev.chronicleId === chronicleState.chronicleId ? prev.momentumTrend : null,
        playerId: chronicleState.chronicle?.playerId ?? prev.playerId,
        startLocationName: null,
        transportError: null,
        turnSequence: chronicleState.turnSequence ?? chronicleState.turns?.length ?? 0,
        turnViews,
      }));

      if (locationId !== null) {
        // Resolve the canon start location so the location pill can link to
        // the Atlas while the chronicle is still there.
        void worldAtlasClient.getEntity(locationId).then(
          (result) => {
            set((prev) =>
              prev.chronicleId === chronicleState.chronicleId
                ? {
                  ...prev,
                  locationSlug: result.entity.slug,
                  startLocationName: result.entity.name,
                }
                : prev
            );
            return undefined;
          },
          () => undefined
        );
      }

      return chronicleState.chronicleId;
    } catch (error: unknown) {
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
    const playerId = get().playerId;
    if (!playerId) {
      return;
    }
    set((prev) => ({
      ...prev,
      playerSettingsError: null,
      playerSettingsStatus: 'loading',
    }));
    try {
      const result = await trpcClient.getPlayerSettings.query({ playerId });
      set((prev) => ({
        ...prev,
        playerSettings: normalizePlayerSettings(result.preferences),
        playerSettingsStatus: 'ready',
      }));
    } catch (error: unknown) {
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

  async refreshPlayerResources() {
    const identity = resolvePlayerIdentity();
    set((prev) => ({
      ...prev,
      directoryError: null,
      directoryStatus: 'loading',
      playerId: identity.playerId,
      playerName: identity.playerName,
    }));

    try {
      const [characters, chronicles] = await Promise.all([
        trpcClient.listCharacters.query({ playerId: identity.playerId }),
        trpcClient.listChronicles.query({ playerId: identity.playerId }),
      ]);

      set((prev) => ({
        ...prev,
        availableCharacters: characters ?? [],
        availableChronicles: chronicles ?? [],
        directoryError: null,
        directoryStatus: 'ready',
        playerId: identity.playerId,
        playerName: identity.playerName,
        preferredCharacterId:
          prev.preferredCharacterId ?? characters?.[0]?.id ?? prev.preferredCharacterId,
      }));
    } catch (error: unknown) {
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
    const nextTurnSequence = get().turnSequence + 1;
    const jobId = formatTurnJobId(chronicleId, nextTurnSequence, playerEntry.id);

    set((prev) => ({
      ...prev,
      isSending: true,
      messages: prev.messages.concat({ entry: playerEntry, turnKey: jobId }),
      pendingPlayerMessageId: playerEntry.id,
      pendingTurnJobId: jobId,
      transportError: null,
      turnSequence: nextTurnSequence,
      turnViews: { ...prev.turnViews, [jobId]: emptyTurnView() },
    }));

    progressStream.subscribe(jobId);

    try {
      const { beats, character, chronicleStatus, entityFocus, locationName, turn } =
        await gmClient.postMessage.mutate({
          chronicleId,
          content: playerEntry,
          requestId: playerEntry.id,
        });
      progressStream.markComplete(jobId);

      set((prev) => {
        const nextCharacter = character ?? prev.character;
        const skillBadges = character ? deriveSkillProgressBadges(prev.character, character) : [];
        const nextMomentumTrend = character
          ? (deriveMomentumTrend(prev.character, character) ?? prev.momentumTrend)
          : prev.momentumTrend;

        // The committed turn replaces the provisional jobId-keyed view.
        const finalView: TurnView = {
          ...turnViewFromTurn(turn),
          skillProgress: skillBadges.length > 0 ? skillBadges : null,
        };
        const nextTurnViews = { ...prev.turnViews };
        delete nextTurnViews[jobId];
        nextTurnViews[turn.id] = finalView;

        let nextMessages = prev.messages.map((message) =>
          message.turnKey === jobId ? { ...message, turnKey: turn.id } : message
        );
        if (turn.gmResponse) {
          nextMessages = upsertChatEntry(nextMessages, turn.gmResponse, turn.id);
        }
        if (turn.systemMessage) {
          nextMessages = upsertChatEntry(nextMessages, turn.systemMessage, turn.id);
        }

        const shouldCloseChronicle = chronicleStatus === 'closed';
        return {
          ...prev,
          availableCharacters: character
            ? mergeCharacterRecord(prev.availableCharacters, character)
            : prev.availableCharacters,
          beats,
          beatsEnabled: prev.beatsEnabled,
          character: nextCharacter,
          chronicleRecord:
            shouldCloseChronicle && prev.chronicleRecord
              ? { ...prev.chronicleRecord, beats, entityFocus, status: 'closed' }
              : prev.chronicleRecord
                ? { ...prev.chronicleRecord, beats, entityFocus }
                : prev.chronicleRecord,
          chronicleStatus: chronicleStatus ?? prev.chronicleStatus,
          connectionState: 'connected',
          focusedBeatId: turn.beatTracker?.focusBeatId ?? prev.focusedBeatId,
          isSending: false,
          locationName: locationName ?? prev.locationName,
          messages: nextMessages,
          momentumTrend: nextMomentumTrend,
          pendingPlayerMessageId:
            prev.pendingPlayerMessageId === playerEntry.id ? null : prev.pendingPlayerMessageId,
          pendingTurnJobId: prev.pendingTurnJobId === jobId ? null : prev.pendingTurnJobId,
          transportError: null,
          turnProgress: null,
          turnSequence: Math.max(prev.turnSequence, turn.turnSequence),
          turnViews: nextTurnViews,
        };
      });
    } catch (error: unknown) {
      progressStream.markComplete(jobId);
      const nextError = error instanceof Error ? error : new Error('Failed to send player intent.');
      set((prev) => {
        const nextTurnViews = { ...prev.turnViews };
        delete nextTurnViews[jobId];
        return {
          ...prev,
          connectionState: 'error',
          isSending: false,
          // The composer restores the draft on failure; drop the optimistic entry.
          messages: prev.messages.filter((message) => message.turnKey !== jobId),
          pendingPlayerMessageId:
            prev.pendingPlayerMessageId === playerEntry.id ? null : prev.pendingPlayerMessageId,
          pendingTurnJobId: prev.pendingTurnJobId === jobId ? null : prev.pendingTurnJobId,
          transportError: nextError,
          turnProgress: null,
          // The turn never committed; keep the local sequence aligned with the
          // server so the next turn's jobId still matches its progress events.
          turnSequence: prev.turnSequence === nextTurnSequence
            ? nextTurnSequence - 1
            : prev.turnSequence,
          turnViews: nextTurnViews,
        };
      });
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
    const identity = resolvePlayerIdentity();
    const targetEndTurn = shouldWrap ? get().turnSequence + 3 : null;

    try {
      const result = await gmClient.setChronicleTargetEnd.mutate({
        chronicleId,
        playerId: identity.playerId,
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
    } catch (error: unknown) {
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
    const playerId = get().playerId;
    if (!playerId) {
      const nextError = new Error('Player identity not established. Please reauthenticate.');
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
        playerId,
        preferences: settings,
      });
      set((prev) => ({
        ...prev,
        isUpdatingPlayerSettings: false,
        playerSettings: normalizePlayerSettings(result.preferences),
        playerSettingsStatus: 'ready',
      }));
    } catch (error: unknown) {
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
