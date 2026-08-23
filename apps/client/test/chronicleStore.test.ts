import type {
  Chronicle,
  ChronicleBeat,
  TranscriptEntry,
  Turn,
  TurnProgressEvent,
} from '@glass-frontier/dto';
import { formatTurnJobId } from '@glass-frontier/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useChronicleStore } from '../src/stores/chronicleStore';

function unsubscribe() {
  return undefined;
}
const mocks = vi.hoisted(() => ({
  chronicleGet: vi.fn(),
  gmPostMessage: vi.fn(),
  gmSetChronicleTargetEnd: vi.fn(),
  progressListener: null as ((event: TurnProgressEvent) => void) | null,
  progressMarkComplete: vi.fn(),
  progressSubscribe: vi.fn(),
}));

vi.mock('../src/lib/gmClient', () => ({
  gmClient: {
    postMessage: { mutate: mocks.gmPostMessage },
    setChronicleTargetEnd: { mutate: mocks.gmSetChronicleTargetEnd },
  },
}));

vi.mock('../src/lib/progressStream', () => ({
  progressStream: {
    markComplete: mocks.progressMarkComplete,
    onEvent: vi.fn((listener: (event: TurnProgressEvent) => void) => {
      mocks.progressListener = listener;
      return unsubscribe;
    }),
    subscribe: mocks.progressSubscribe,
  },
}));

vi.mock('../src/lib/trpcClient', () => ({
  trpcClient: {
    getChronicle: { query: mocks.chronicleGet },
  },
}));
vi.mock('../src/lib/worldAtlasClient', () => ({
  worldAtlasClient: { getEntity: vi.fn() },
}));
vi.mock('../src/stores/authStore', () => ({
  useAuthStore: {
    getState: () => ({
      tokens: {
        idToken: 'e30.eyJzdWIiOiJwbGF5ZXItdGVzdCJ9.signature',
      },
      username: PLAYER_ID,
    }),
  },
}));

const CHRONICLE_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const DIALOG_SCENE_ID = 'scene:turn-3';
const DIALOG_SUBJECT = 'Amaya Venn';
const GM_RESPONSE_NODE = 'gm-response-node';
const NETWORK_FAILURE = 'Network unavailable.';
const PLAYER_ID = 'player-test';

const chronicle: Chronicle = {
  activeScene: null,
  beats: [],
  beatsEnabled: true,
  entityFocus: { entityScores: {}, tagScores: {} },
  entityRoster: {
    entries: [],
    locationName: 'Luminous Quay',
    sceneId: null,
    updatedAtTurn: 0,
  },
  id: CHRONICLE_ID,
  locationName: 'Luminous Quay',
  openingText: 'You wait beneath the quay lights.',
  playerId: PLAYER_ID,
  status: 'open',
  summaries: [],
  title: 'Store Test Chronicle',
  toneChips: [],
  toneNotes: '',
};

const beat: ChronicleBeat = {
  createdAt: 1,
  description: 'Trace the signal through the eastern vault.',
  id: 'shattered_chorus',
  status: 'in_progress',
  title: 'Shattered Chorus',
  updatedAt: 1,
};

const entry = (
  id: string,
  role: TranscriptEntry['role'],
  content: string
): TranscriptEntry => ({
  content,
  id,
  metadata: { tags: [], timestamp: 1 },
  role,
});

type TurnResult = {
  activeScene: Chronicle['activeScene'];
  beats: ChronicleBeat[];
  character: null;
  chronicleStatus: Chronicle['status'];
  entityFocus: Chronicle['entityFocus'];
  entityRoster: Chronicle['entityRoster'];
  locationName: string;
  turn: Turn;
};

const turnResult = (
  playerMessage: TranscriptEntry,
  options?: {
    activeScene?: Chronicle['activeScene'];
    failure?: boolean;
    gmResponse?: TranscriptEntry;
    sceneContext?: Turn['sceneContext'];
    systemMessage?: TranscriptEntry;
  }
): TurnResult => ({
  activeScene: options?.activeScene ?? null,
  beats: options?.failure ? [] : [beat],
  character: null,
  chronicleStatus: 'open',
  entityFocus: { entityScores: {}, tagScores: {} },
  entityRoster: chronicle.entityRoster,
  locationName: 'Auric Causeway',
  turn: {
    chronicleId: CHRONICLE_ID,
    failure: options?.failure ?? false,
    gmResponse: options?.gmResponse,
    id: 'turn-3',
    playerMessage,
    sceneContext: options?.sceneContext,
    systemMessage: options?.systemMessage,
    turnSequence: 3,
  },
});

const setActiveChronicle = () => {
  useChronicleStore.setState({
    chronicleId: CHRONICLE_ID,
    chronicleRecord: chronicle,
    chronicleStatus: 'open',
    connectionState: 'connected',
    playerId: PLAYER_ID,
    turnSequence: 2,
  });
};

describe('chronicleStore turn handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useChronicleStore.getState().resetStore();
    setActiveChronicle();
  });

  it('applies streamed previews and re-keys the optimistic turn after commit', async () => {
    let resolveTurn: ((result: TurnResult) => void) | undefined;
    mocks.gmPostMessage.mockReturnValue(
      new Promise<TurnResult>((resolve) => {
        resolveTurn = resolve;
      })
    );

    const send = useChronicleStore.getState().sendPlayerMessage({
      content: 'Follow the vault signal.',
    });
    const posted = mocks.gmPostMessage.mock.calls[0]?.[0] as
      | { content: TranscriptEntry; requestId: string }
      | undefined;
    const jobId = formatTurnJobId(CHRONICLE_ID, 3, posted?.requestId ?? 'missing-request');

    expect(posted?.content.content).toBe('Follow the vault signal.');
    expect(posted?.requestId).toBe(posted?.content.id);
    expect(mocks.progressSubscribe).toHaveBeenCalledWith(jobId);
    expect(useChronicleStore.getState().pendingTurnJobId).toBe(jobId);
    expect(useChronicleStore.getState().turnViews).toHaveProperty(jobId);

    const listener = mocks.progressListener;
    expect(listener).not.toBeNull();
    listener?.({
      chronicleId: 'another-chronicle',
      jobId,
      nodeId: GM_RESPONSE_NODE,
      playerId: PLAYER_ID,
      status: 'success',
      step: 6,
      total: 11,
      turnSequence: 3,
    });
    expect(useChronicleStore.getState().turnProgress).toBeNull();

    const preview = entry('gm-turn-3', 'gm', 'The signal flickers into view.');
    listener?.({
      chronicleId: CHRONICLE_ID,
      jobId,
      nodeId: GM_RESPONSE_NODE,
      payload: {
        advancesTimeline: true,
        failure: false,
        gmMessage: preview,
        gmSummary: 'The signal appears.',
      },
      playerId: PLAYER_ID,
      status: 'success',
      step: 6,
      total: 11,
      turnSequence: 3,
    });

    const streaming = useChronicleStore.getState();
    expect(streaming.turnProgress).toEqual({
      nodeId: GM_RESPONSE_NODE,
      status: 'success',
      step: 6,
      total: 11,
    });
    expect(streaming.turnViews[jobId]?.gmSummary).toBe('The signal appears.');
    expect(streaming.messages.some((message) => message.entry.id === preview.id)).toBe(true);

    const finalResponse = entry('gm-turn-3', 'gm', 'The signal opens a path east.');
    if (!posted || !resolveTurn) {
      throw new Error('Expected a pending GM request.');
    }
    resolveTurn(turnResult(posted.content, {
      activeScene: {
        id: DIALOG_SCENE_ID,
        startedAtTurn: 3,
        subject: DIALOG_SUBJECT,
        subjectKind: 'npc',
        type: 'dialog',
      },
      gmResponse: finalResponse,
      sceneContext: {
        outcome: 'continue',
        sceneId: DIALOG_SCENE_ID,
        subject: DIALOG_SUBJECT,
        subjectKind: 'npc',
        type: 'dialog',
      },
    }));
    await send;

    const committed = useChronicleStore.getState();
    expect(mocks.progressMarkComplete).toHaveBeenCalledWith(jobId);
    expect(committed.pendingTurnJobId).toBeNull();
    expect(committed.turnViews).not.toHaveProperty(jobId);
    expect(committed.turnViews['turn-3']?.turnId).toBe('turn-3');
    expect(committed.messages).toHaveLength(2);
    expect(committed.messages.every((message) => message.turnKey === 'turn-3')).toBe(true);
    expect(committed.messages.find((message) => message.entry.id === preview.id)?.entry.content)
      .toBe('The signal opens a path east.');
    expect(committed.beats).toEqual([beat]);
    expect(committed.chronicleRecord?.activeScene?.subject).toBe(DIALOG_SUBJECT);
    expect(committed.locationName).toBe('Auric Causeway');
    expect(committed.turnViews['turn-3']?.sceneContext?.type).toBe('dialog');
  });

  it('keeps a committed failed turn and its system message', async () => {
    mocks.gmPostMessage.mockImplementation(
      ({ content }: { content: TranscriptEntry }) => Promise.resolve(
        turnResult(content, {
          failure: true,
          systemMessage: entry('system-turn-3', 'system', 'The GM could not resolve this turn.'),
        })
      )
    );

    await useChronicleStore.getState().sendPlayerMessage({ content: 'Attempt the impossible.' });

    const state = useChronicleStore.getState();
    expect(state.connectionState).toBe('connected');
    expect(state.transportError).toBeNull();
    expect(state.turnSequence).toBe(3);
    expect(state.turnViews['turn-3']?.turnId).toBe('turn-3');
    expect(state.messages.map((message) => message.entry.role)).toEqual(['player', 'system']);
    expect(state.messages.at(-1)?.entry.content).toBe('The GM could not resolve this turn.');
  });

  it('removes the optimistic turn and restores the sequence after transport failure', async () => {
    const seedMessage = {
      entry: entry('seed', 'gm', 'The chronicle begins.'),
      turnKey: null,
    };
    useChronicleStore.setState({ messages: [seedMessage] });
    mocks.gmPostMessage.mockRejectedValue(new Error(NETWORK_FAILURE));

    await expect(
      useChronicleStore.getState().sendPlayerMessage({ content: 'Try the eastern door.' })
    ).rejects.toThrow(NETWORK_FAILURE);

    const posted = mocks.gmPostMessage.mock.calls[0]?.[0] as
      | { requestId: string }
      | undefined;
    const jobId = formatTurnJobId(CHRONICLE_ID, 3, posted?.requestId ?? 'missing-request');
    const state = useChronicleStore.getState();
    expect(mocks.progressMarkComplete).toHaveBeenCalledWith(jobId);
    expect(state.connectionState).toBe('error');
    expect(state.isSending).toBe(false);
    expect(state.messages).toEqual([seedMessage]);
    expect(state.pendingPlayerMessageId).toBeNull();
    expect(state.pendingTurnJobId).toBeNull();
    expect(state.transportError?.message).toBe(NETWORK_FAILURE);
    expect(state.turnProgress).toBeNull();
    expect(state.turnSequence).toBe(2);
    expect(state.turnViews).not.toHaveProperty(jobId);
  });

  it('attaches selected entity ids and clears them only after a committed turn', async () => {
    const entityId = '11111111-2222-4333-8444-555555555555';
    useChronicleStore.getState().toggleEntityTarget(entityId);
    mocks.gmPostMessage.mockImplementation(
      ({ content }: { content: TranscriptEntry }) => Promise.resolve(turnResult(content))
    );

    await useChronicleStore.getState().sendPlayerMessage({ content: 'Ask about passage.' });

    expect(mocks.gmPostMessage).toHaveBeenCalledWith(expect.objectContaining({
      entityTargetIds: [entityId],
    }));
    expect(useChronicleStore.getState().selectedEntityIds).toEqual([]);

    useChronicleStore.getState().toggleEntityTarget(entityId);
    mocks.gmPostMessage.mockRejectedValueOnce(new Error(NETWORK_FAILURE));
    await expect(
      useChronicleStore.getState().sendPlayerMessage({ content: 'Try again.' })
    ).rejects.toThrow(NETWORK_FAILURE);
    expect(useChronicleStore.getState().selectedEntityIds).toEqual([entityId]);
  });

  it('targets the third upcoming turn when wrap is requested before play begins', async () => {
    useChronicleStore.setState({ turnSequence: -1 });
    mocks.gmSetChronicleTargetEnd.mockResolvedValue({
      chronicle: { ...chronicle, targetEndTurn: 2 },
    });

    await useChronicleStore.getState().setChronicleWrapTarget(true);

    expect(mocks.gmSetChronicleTargetEnd).toHaveBeenCalledWith({
      chronicleId: CHRONICLE_ID,
      playerId: PLAYER_ID,
      targetEndTurn: 2,
    });
    expect(useChronicleStore.getState().chronicleRecord?.targetEndTurn).toBe(2);
  });

  it('hydrates the generated opening instead of presenting the seed as GM dialogue', async () => {
    const seededChronicle = {
      ...chronicle,
      seedText: 'A selection teaser that was never spoken.',
    };
    mocks.chronicleGet.mockResolvedValue({
      character: null,
      chronicle: seededChronicle,
      chronicleId: CHRONICLE_ID,
      locationName: chronicle.locationName,
      turns: [],
      turnSequence: -1,
    });

    await useChronicleStore.getState().hydrateChronicle(CHRONICLE_ID);

    const messages = useChronicleStore.getState().messages;
    expect(messages).toHaveLength(1);
    expect(messages[0]?.entry.content).toBe(chronicle.openingText);
    expect(messages[0]?.entry.metadata.tags).toContain('chronicle-opening');
    expect(messages[0]?.entry.content).not.toBe(seededChronicle.seedText);
  });
});
