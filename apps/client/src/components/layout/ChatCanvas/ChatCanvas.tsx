import type {
  PlayerFeedbackSentiment,
  Intent,
  BeatTracker,
} from '@glass-frontier/dto';
import { IntentType } from '@glass-frontier/dto';
import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { useNavigate } from 'react-router-dom';
import remarkGfm from 'remark-gfm';

import { promptClient } from '../../../lib/promptClient';
import type { ChatMessage, TurnView } from '../../../state/chronicleState';
import { useChronicleStore } from '../../../stores/chronicleStore';
import { useUiStore } from '../../../stores/uiStore';
import { BeatTrackerBadge } from '../../badges/BeatTrackerBadge/BeatTrackerBadge';
import {
  describeBeatTrackerEffect,
  hasBeatTrackerDetails,
} from '../../badges/beatTrackerPresentation';
import { InventoryDeltaBadge } from '../../badges/InventoryDeltaBadge/InventoryDeltaBadge';
import { SkillCheckBadge } from '../../badges/SkillCheckBadge/SkillCheckBadge';
import {
  AnnotatedEntityText,
} from '../../entities/EntityReferencePopover/EntityReferencePopover';
import {
  WorldReferenceLink,
  worldReferenceRemarkPlugin,
} from '../../entities/WorldReferencePopover';
import { useFeedbackVisibility } from '../../feedbackVisibility/FeedbackVisibilityGate';
import './ChatCanvas.css';
import { WorldPanel } from './WorldPanel';

type FeedbackTarget = {
  auditId: string;
  gmEntryId: string;
  turnId: string;
  turnSequence: number;
  excerpt: string;
};

const FEEDBACK_CACHE_KEY = 'chat-feedback-cache';
const TRACKED_BEAT_LABEL = 'Tracked beat';
const FEEDBACK_SENTIMENTS: PlayerFeedbackSentiment[] = ['positive', 'neutral', 'negative'];
const FEEDBACK_LABELS: Record<PlayerFeedbackSentiment, string> = {
  negative: 'Needs work',
  neutral: 'It was okay',
  positive: 'Loved it',
};
type FeedbackIntentChoice = 'none' | NonNullable<Intent['intentType']>;
type FeedbackBooleanChoice = 'none' | 'true' | 'false';

const FEEDBACK_INTENT_OPTIONS: Array<{ label: string; value: FeedbackIntentChoice }> = [
  { label: 'No Feedback', value: 'none' },
  ...IntentType.options.map((value) => ({
    label: value.replace(/^[a-z]/, (char) => char.toUpperCase()),
    value,
  })),
];

const FEEDBACK_BOOLEAN_OPTIONS: Array<{ label: string; value: FeedbackBooleanChoice }> = [
  { label: 'No Feedback', value: 'none' },
  { label: 'True', value: 'true' },
  { label: 'False', value: 'false' },
];

const describeBeatTurnEffect = (tracker?: BeatTracker | null): string | null => {
  return tracker === null || tracker === undefined
    ? null
    : describeBeatTrackerEffect(tracker);
};

type PlayerBeatDirective = {
  kind: 'existing' | 'new' | 'independent';
  summary?: string;
  targetBeatId?: string | null;
};

const readPlayerBeatDirective = (intent?: Intent | null): PlayerBeatDirective | null => {
  if (!intent || typeof intent !== 'object') {
    return null;
  }
  const candidate = (intent as { beatDirective?: PlayerBeatDirective | null }).beatDirective;
  if (!candidate || typeof candidate.kind !== 'string') {
    return null;
  }
  return candidate;
};

const describePlayerBeatLabel = (directive: PlayerBeatDirective | null): string | null => {
  if (!directive) {
    return null;
  }
  if (directive.kind === 'new') {
    return 'New beat';
  }
  if (directive.kind === 'existing') {
    return 'Existing beat';
  }
  // Don't show beat tag for independent actions
  return null;
};

const PROGRESS_NODE_LABELS: Record<string, string> = {
  'check-planner': 'weighing the risk',
  'check-runner': 'rolling the dice',
  environment: 'the world takes its turn',
  'gm-response-node': 'writing the narration',
  'intent-classifier': 'reading your intent',
  'inventory-delta': 'checking your gear',
  'player-entity-reference-resolver': 'linking your words to canon',
  'scene-subject-resolver': 'finding the scene subject',
  scout: 'looking things up',
  'turn-judge': 'judging the turn',
};

const formatProgressNode = (nodeId: string): string =>
  PROGRESS_NODE_LABELS[nodeId] ?? nodeId.replace(/-/g, ' ');

const formatIntentBadgeLabel = (intentType: TurnView['intentType']): string | null => {
  if (!intentType) {
    return null;
  }
  return intentType.replace(/^\w/, (char) => char.toUpperCase());
};

const describeTimelineBadge = (advancesTimeline: TurnView['advancesTimeline']): string | null => {
  if (typeof advancesTimeline !== 'boolean') {
    return null;
  }
  return advancesTimeline ? 'Advances timeline' : 'Holds moment';
};

const readFeedbackCache = (): Record<string, true> => {
  if (typeof window === 'undefined') {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(FEEDBACK_CACHE_KEY);
    if (typeof raw !== 'string') {
      return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    if (parsed !== null && typeof parsed === 'object') {
      return parsed as Record<string, true>;
    }
    return {};
  } catch {
    return {};
  }
};

const writeFeedbackCache = (cache: Record<string, true>): void => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(FEEDBACK_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore storage failures
  }
};

export function ChatCanvas() {
  const navigate = useNavigate();
  const messages = useChronicleStore((state) => state.messages);
  const hasChronicle = useChronicleStore((state) => Boolean(state.chronicleId));
  const chronicleId = useChronicleStore((state) => state.chronicleId);
  const chronicleStatus = useChronicleStore((state) => state.chronicleStatus);
  const playerId = useChronicleStore((state) => state.playerId);
  const branchChronicleFromTurn = useChronicleStore((state) => state.branchChronicleFromTurn);
  const isWaitingForGm = useChronicleStore((state) => state.isSending);
  const turnProgress = useChronicleStore((state) => state.turnProgress);
  const turnViews = useChronicleStore((state) => state.turnViews);
  const beats = useChronicleStore((state) => state.beats);
  const expandedMessages = useUiStore((state) => state.expandedMessages);
  const setExpandedMessages = useUiStore((state) => state.setExpandedMessages);
  const toggleMessageExpansion = useUiStore((state) => state.toggleMessageExpansion);
  const resetExpandedMessages = useUiStore((state) => state.resetExpandedMessages);
  const { isAtLeast } = useFeedbackVisibility();
  const showBadges = isAtLeast('badges');
  const showNarrative = isAtLeast('narrative');
  const showAll = isAtLeast('all');
  const streamRef = useRef<HTMLDivElement | null>(null);
  const [feedbackCache, setFeedbackCache] = useState<Record<string, true>>(() => readFeedbackCache());
  const [feedbackTarget, setFeedbackTarget] = useState<FeedbackTarget | null>(null);
  const [responseIndexByEntry, setResponseIndexByEntry] = useState<Record<string, number>>({});
  const [feedbackSentiment, setFeedbackSentiment] = useState<PlayerFeedbackSentiment>('positive');
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackIntentExpectation, setFeedbackIntentExpectation] =
    useState<FeedbackIntentChoice>('none');
  const [feedbackSkillExpectation, setFeedbackSkillExpectation] =
    useState<FeedbackBooleanChoice>('none');
  const [feedbackLocationExpectation, setFeedbackLocationExpectation] =
    useState<FeedbackBooleanChoice>('none');
  const [feedbackInventoryExpectation, setFeedbackInventoryExpectation] =
    useState<FeedbackBooleanChoice>('none');
  const [feedbackSkillNotes, setFeedbackSkillNotes] = useState('');
  const [feedbackLocationNotes, setFeedbackLocationNotes] = useState('');
  const [feedbackInventoryNotes, setFeedbackInventoryNotes] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [branchingTurnSequence, setBranchingTurnSequence] = useState<number | null>(null);
  const beatLookup = useMemo(() => {
    const map = new Map<string, string>();
    beats.forEach((beat) => {
      if (beat && typeof beat.id === 'string') {
        map.set(beat.id, beat.title);
      }
    });
    return map;
  }, [beats]);
  const finalEntryIdByTurn = useMemo(() => {
    const result = new Map<string, string>();
    for (const message of messages) {
      if (message.turnKey !== null) {
        result.set(message.turnKey, message.entry.id);
      }
    }
    return result;
  }, [messages]);

  const handleBranchFromTurn = async (turnSequence: number): Promise<void> => {
    const confirmed = window.confirm(
      `Resume from turn ${turnSequence + 1} in a new chronicle version? The original chronicle will remain unchanged.`
    );
    if (!confirmed) {
      return;
    }
    setBranchingTurnSequence(turnSequence);
    try {
      const branchedChronicleId = await branchChronicleFromTurn(turnSequence);
      void navigate(`/chron/${branchedChronicleId}`);
    } catch {
      return;
    } finally {
      setBranchingTurnSequence(null);
    }
  };

  const markFeedbackSubmitted = (auditId: string) => {
    setFeedbackCache((prev) => {
      if (prev[auditId]) {
        return prev;
      }
      const next: Record<string, true> = { ...prev, [auditId]: true };
      writeFeedbackCache(next);
      return next;
    });
  };

  const closeFeedbackModal = () => {
    setFeedbackTarget(null);
    setFeedbackComment('');
    setFeedbackError(null);
    setIsSubmittingFeedback(false);
    setFeedbackIntentExpectation('none');
    setFeedbackSkillExpectation('none');
    setFeedbackLocationExpectation('none');
    setFeedbackInventoryExpectation('none');
    setFeedbackSkillNotes('');
    setFeedbackLocationNotes('');
    setFeedbackInventoryNotes('');
  };

  const openFeedbackModal = (message: ChatMessage, view: TurnView | null) => {
    const auditId = view?.gmTrace?.auditId ?? null;
    const turnSequence = typeof view?.turnSequence === 'number' ? view.turnSequence : null;
    if (!auditId || !view?.turnId || turnSequence === null) {
      return;
    }
    setFeedbackTarget({
      auditId,
      excerpt: (message.entry.content ?? '').slice(0, 280),
      gmEntryId: message.entry.id,
      turnId: view.turnId,
      turnSequence,
    });
    setFeedbackSentiment('positive');
    setFeedbackComment('');
    setFeedbackError(null);
    setFeedbackIntentExpectation('none');
    setFeedbackSkillExpectation('none');
    setFeedbackLocationExpectation('none');
    setFeedbackInventoryExpectation('none');
    setFeedbackSkillNotes('');
    setFeedbackLocationNotes('');
    setFeedbackInventoryNotes('');
  };

  const handleSubmitFeedback = async () => {
    if (feedbackTarget === null || !chronicleId || !playerId) {
      return;
    }
    setIsSubmittingFeedback(true);
    setFeedbackError(null);
    const expectedIntentType =
      feedbackIntentExpectation === 'none' ? undefined : feedbackIntentExpectation;
    const resolveBoolean = (value: FeedbackBooleanChoice): boolean | undefined => {
      if (value === 'none') {
        return undefined;
      }
      return value === 'true';
    };
    const expectedSkillCheck = resolveBoolean(feedbackSkillExpectation);
    const expectedLocationChange = resolveBoolean(feedbackLocationExpectation);
    const expectedInventoryDelta = resolveBoolean(feedbackInventoryExpectation);
    const expectedSkillNotes =
      feedbackSkillExpectation === 'true' ? feedbackSkillNotes.trim() || undefined : undefined;
    const expectedLocationNotes =
      feedbackLocationExpectation === 'true'
        ? feedbackLocationNotes.trim() || undefined
        : undefined;
    const expectedInventoryNotes =
      feedbackInventoryExpectation === 'true'
        ? feedbackInventoryNotes.trim() || undefined
        : undefined;
    try {
      await promptClient.submitPlayerFeedback.mutate({
        auditId: feedbackTarget.auditId,
        chronicleId,
        comment: feedbackComment.trim() || undefined,
        expectedIntentType,
        expectedInventoryDelta,
        expectedInventoryNotes,
        expectedLocationChange,
        expectedLocationNotes,
        expectedSkillCheck,
        expectedSkillNotes,
        gmEntryId: feedbackTarget.gmEntryId,
        playerId,
        sentiment: feedbackSentiment,
        turnId: feedbackTarget.turnId,
        turnSequence: feedbackTarget.turnSequence,
      });
      markFeedbackSubmitted(feedbackTarget.auditId);
      closeFeedbackModal();
    } catch (error: unknown) {
      setFeedbackError(error instanceof Error ? error.message : 'Unable to submit feedback.');
      setIsSubmittingFeedback(false);
    }
  };

  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (messages.length === 0) {
      resetExpandedMessages();
      return;
    }

    const playerEntries = messages.filter((msg) => msg.entry.role === 'player');
    const gmEntries = messages.filter((msg) => msg.entry.role === 'gm');

    setExpandedMessages((prev) => {
      const next = { ...prev };

      const applyRules = (entries: typeof messages) => {
        const ids = entries.map((msg) => msg.entry.id).filter(Boolean);
        const latestId = ids[ids.length - 1];
        const penultimateId = ids[ids.length - 2];

        ids.forEach((id) => {
          if (id && !(id in next)) {
            next[id] = false;
          }
        });

        if (penultimateId) {
          next[penultimateId] = false;
        }
        if (latestId) {
          next[latestId] = true;
        }
      };

      applyRules(playerEntries);
      applyRules(gmEntries);

      return next;
    });
  }, [messages, resetExpandedMessages, setExpandedMessages]);

  const isExpanded = (entryId: string) => expandedMessages[entryId] ?? false;

  return (
    <section className="chat-canvas" aria-label="Narrative transcript" data-testid="chat-canvas">
      <div
        ref={streamRef}
        className="chat-stream"
        role="log"
        aria-live="polite"
        tabIndex={0}
        data-testid="chat-log"
      >
        {!hasChronicle ? (
          <p className="chat-empty" data-testid="chat-empty">
            Select or create a chronicle to begin storytelling.
          </p>
        ) : messages.length === 0 ? (
          <p className="chat-empty" data-testid="chat-empty">
            Awaiting the first story beat. Share an intent to begin.
          </p>
        ) : (
          messages.map((chatMessage, index) => {
            const { entry } = chatMessage;
            const view = chatMessage.turnKey !== null
              ? turnViews[chatMessage.turnKey] ?? null
              : null;
            const {
              attributeKey = null,
              playerIntent = null,
              skillCheckPlan = null,
              skillCheckResult = null,
              skillKey = null,
              skillProgress = null,
            } = view ?? {};
            const auditId = view?.gmTrace?.auditId ?? null;
            const hasSubmitted = auditId ? feedbackCache[auditId] === true : false;
            const hasTurnSequence = typeof view?.turnSequence === 'number';
            const isFinalEntryForTurn =
              chatMessage.turnKey !== null &&
              finalEntryIdByTurn.get(chatMessage.turnKey) === entry.id;
            const canBranchHere =
              chronicleStatus === 'open' &&
              view?.canBranch === true &&
              hasTurnSequence &&
              isFinalEntryForTurn;
            const canSubmitFeedback =
              auditId !== null &&
              Boolean(view?.turnId) &&
              hasTurnSequence &&
              Boolean(chronicleId) &&
              Boolean(playerId) &&
              !hasSubmitted;
            const timestamp =
              typeof entry.metadata?.timestamp === 'number'
                ? new Date(entry.metadata.timestamp)
                : new Date();
            const sceneContext = view?.sceneContext ?? null;
            const displayRole =
              entry.role === 'player'
                ? 'Player'
                : entry.role === 'gm'
                  ? sceneContext?.type === 'dialog'
                    ? sceneContext.subject
                    : 'GM'
                  : 'System';
            const beatTracker = view?.beatTracker ?? null;
            const beatTrackerEffectLabel =
              entry.role === 'gm' && showNarrative && hasBeatTrackerDetails(beatTracker)
                ? describeBeatTurnEffect(beatTracker)
                : null;
            const playerBeatLabel =
              entry.role === 'player'
                ? describePlayerBeatLabel(readPlayerBeatDirective(playerIntent))
                : null;
            const playerIntentLabel = formatIntentBadgeLabel(playerIntent?.intentType ?? null);
            const timelineLabel = describeTimelineBadge(view?.advancesTimeline ?? null);
            const sceneLabel =
              sceneContext === null ? null : `${sceneContext.type} · ${sceneContext.subject}`;
            const entityReferences = (view?.entityReferences ?? []).filter(
              (reference) => reference.transcriptEntryId === entry.id
            );
            const encyclopediaMentions = (view?.referenceMentions ?? []).filter(
              (mention) => mention.transcriptEntryId === entry.id
            );
            const entityRoster = view?.entityRoster ?? [];
            const entityById = new Map(entityRoster.map((entity) => [entity.id, entity]));
            const encyclopediaBySlug = new Map(
              encyclopediaMentions.map((mention) => [mention.slug, mention])
            );
            const proseAlternates = entry.role === 'gm' ? (view?.proseAlternates ?? []) : [];
            const responseCount = 1 + proseAlternates.length;
            const selectedResponse = Math.min(
              responseIndexByEntry[entry.id] ?? 0,
              responseCount - 1
            );
            const displayedContent =
              selectedResponse === 0
                ? (entry.content ?? '')
                : (proseAlternates[selectedResponse - 1]?.prose ?? '');
            const responseModelLabel =
              selectedResponse === 0
                ? 'current narrator'
                : (proseAlternates[selectedResponse - 1]?.modelId ?? '');
            const responseCostUsd =
              selectedResponse === 0
                ? (view?.proseCostUsd ?? null)
                : (proseAlternates[selectedResponse - 1]?.costUsd ?? null);
            const responseCostLabel =
              responseCostUsd === null ? '' : ` · $${responseCostUsd.toFixed(4)}`;
            const cycleResponse = (direction: number) => {
              setResponseIndexByEntry((prev) => ({
                ...prev,
                [entry.id]: (selectedResponse + direction + responseCount) % responseCount,
              }));
            };

            return (
              <article
                key={entry.id || index}
                className={`chat-entry chat-entry-${entry.role}`}
                data-turn={index}
              >
                <header className="chat-entry-header">
                  <div className="chat-entry-heading">
                    <span className="chat-entry-role" aria-hidden="true">
                      {displayRole}
                    </span>
                    <span className="chat-entry-meta">
                      {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="chat-entry-aside">
                    {entry.role === 'player' && showNarrative && playerIntent?.tone ? (
                      <span className="chat-entry-tone">{playerIntent.tone}</span>
                    ) : null}
                    {entry.role === 'player' && showNarrative && playerIntentLabel ? (
                      <span className="chat-entry-intent-tag" title="Detected intent type">
                        {playerIntentLabel}
                      </span>
                    ) : null}
                    {entry.role === 'player' && showNarrative && playerIntent?.creativeSpark ? (
                      <span className="chat-entry-spark" title="Creative Spark awarded">
                        ★
                      </span>
                    ) : null}
                    {entry.role === 'player' && showNarrative && playerBeatLabel ? (
                      <BeatTag
                        label={playerBeatLabel}
                        directive={readPlayerBeatDirective(playerIntent)}
                        beatLookup={beatLookup}
                      />
                    ) : null}
                    {entry.role === 'gm' && beatTrackerEffectLabel ? (
                      <span className="chat-entry-beat-effect">{beatTrackerEffectLabel}</span>
                    ) : null}
                    {entry.role === 'gm' ? (
                      <>
                        {showNarrative && sceneLabel ? (
                          <span className="chat-entry-scene-tag">{sceneLabel}</span>
                        ) : null}
                        {showAll && timelineLabel ? (
                          <span className="chat-entry-timeline-tag">{timelineLabel}</span>
                        ) : null}
                        {showBadges ? (
                          <>
                            <SkillCheckBadge
                              plan={skillCheckPlan}
                              result={skillCheckResult}
                              skillKey={skillKey}
                              attributeKey={attributeKey}
                            />
                            {beatTracker === null ? null : (
                              <BeatTrackerBadge beatLookup={beatLookup} tracker={beatTracker} />
                            )}
                            <InventoryDeltaBadge delta={view?.inventoryDelta ?? null} />
                          </>
                        ) : null}
                        {hasSubmitted ? (
                          <span className="chat-entry-feedback-status">Feedback sent</span>
                        ) : (
                          <button
                            type="button"
                            className="chat-entry-feedback-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              event.preventDefault();
                              openFeedbackModal(chatMessage, view);
                            }}
                            disabled={!canSubmitFeedback}
                          >
                            Share Feedback
                          </button>
                        )}
                      </>
                    ) : null}
                    {canBranchHere ? (
                      <button
                        type="button"
                        className="chat-entry-branch-button"
                        aria-label={`Resume chronicle from turn ${(view?.turnSequence ?? 0) + 1}`}
                        onClick={() => void handleBranchFromTurn(view?.turnSequence ?? 0)}
                        disabled={isWaitingForGm || branchingTurnSequence !== null}
                      >
                        {branchingTurnSequence === view?.turnSequence
                          ? 'Creating version…'
                          : 'Resume from here'}
                      </button>
                    ) : null}
                  </div>
                </header>
                <div
                  className={`chat-entry-body${
                    entry.role !== 'system' ? ' chat-entry-toggleable' : ''
                  }`}
                  role={entry.role !== 'system' ? 'button' : undefined}
                  aria-expanded={entry.role !== 'system' ? isExpanded(entry.id) : undefined}
                  tabIndex={entry.role !== 'system' ? 0 : undefined}
                  onClick={
                    entry.role !== 'system' ? () => toggleMessageExpansion(entry.id) : undefined
                  }
                  onKeyDown={
                    entry.role !== 'system'
                      ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          toggleMessageExpansion(entry.id);
                        }
                      }
                      : undefined
                  }
                >
                  {entry.role === 'gm' ? (
                    <>
                      {isExpanded(entry.id) ? (
                        <div className="chat-entry-content">
                          {responseCount > 1 ? (
                            <div className="chat-entry-response-pager">
                              <button
                                type="button"
                                className="chat-response-pager-button"
                                aria-label="Previous response"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  cycleResponse(-1);
                                }}
                              >
                                ‹
                              </button>
                              <span>
                                {selectedResponse + 1}/{responseCount} · {responseModelLabel}
                                {responseCostLabel}
                              </span>
                              <button
                                type="button"
                                className="chat-response-pager-button"
                                aria-label="Next response"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  cycleResponse(1);
                                }}
                              >
                                ›
                              </button>
                            </div>
                          ) : null}
                          <ReactMarkdown
                            components={{
                              a: (props) => (
                                <WorldReferenceLink
                                  {...props}
                                  encyclopediaBySlug={encyclopediaBySlug}
                                  entityById={entityById}
                                />
                              ),
                            }}
                            remarkPlugins={[
                              remarkGfm,
                              worldReferenceRemarkPlugin(entityReferences, encyclopediaMentions),
                            ]}
                          >
                            {displayedContent}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <p className="chat-entry-summary">
                          {view?.gmSummary ??
                            playerIntent?.intentSummary ??
                            'GM summary unavailable.'}
                        </p>
                      )}
                      {showBadges && skillProgress?.length ? (
                        <div className="skill-progress-badges" aria-live="polite">
                          {skillProgress.map((badge, badgeIndex) => (
                            <span
                              key={`${entry.id ?? index}-progress-${badge.skill}-${badgeIndex}`}
                              className={`skill-progress-badge skill-progress-badge-${badge.type}`}
                            >
                              {badge.type === 'skill-gain'
                                ? `New Skill · ${badge.skill}${badge.attribute ? ` (${badge.attribute})` : ''}`
                                : badge.tier
                                  ? `Tier Up · ${badge.skill} → ${badge.tier}`
                                  : `Skill Improved · ${badge.skill}`}
                            </span>
                          ))}
                        </div>
                      ) : null}

                      {showAll ? (
                        <WorldPanel
                          content={view?.worldContent ?? null}
                          fronts={view?.worldFronts ?? null}
                        />
                      ) : null}

                      {showAll && view?.executedNodes?.length ? (
                        <p className="chat-entry-node-trace">
                          GM pipeline: {view.executedNodes.join(' → ')}
                        </p>
                      ) : null}
                    </>
                  ) : entry.role === 'player' ? (
                    isExpanded(entry.id) ? (
                      <p
                        className="chat-entry-content"
                        title={playerIntent?.intentSummary ?? undefined}
                      >
                        <AnnotatedEntityText
                          content={entry.content}
                          entities={entityRoster}
                          references={entityReferences}
                        />
                      </p>
                    ) : (
                      <p className="chat-entry-summary">
                        {playerIntent?.intentSummary ?? entry.content}
                      </p>
                    )
                  ) : (
                    <p className="chat-entry-content">{entry.content}</p>
                  )}
                </div>
              </article>
            );
          })
        )}
      </div>
      {isWaitingForGm ? (
        <div className="chat-loading" role="status" aria-live="polite">
          <span className="chat-loading-spinner" aria-hidden="true" />
          <span className="chat-loading-text">
            {turnProgress
              ? `GM is working — ${formatProgressNode(turnProgress.nodeId)} (${turnProgress.step}/${turnProgress.total})`
              : 'GM is composing the next beat…'}
          </span>
        </div>
      ) : null}
      {feedbackTarget ? (
        <div className="chat-feedback-modal" role="dialog" aria-modal="true" aria-label="Narrative feedback form">
          <button
            type="button"
            className="chat-feedback-backdrop"
            aria-label="Dismiss feedback form"
            onClick={closeFeedbackModal}
          />
          <div className="chat-feedback-content">
            <header className="chat-feedback-header">
              <h3>Share Feedback</h3>
              <button
                type="button"
                className="chat-feedback-close"
                aria-label="Close feedback form"
                onClick={closeFeedbackModal}
              >
                ×
              </button>
            </header>
            <p className="chat-feedback-excerpt">
              {feedbackTarget.excerpt.length > 0
                ? feedbackTarget.excerpt
                : 'No preview available for this response.'}
            </p>
            <div className="chat-feedback-options">
              {FEEDBACK_SENTIMENTS.map((value) => (
                <label key={value} className="chat-feedback-option">
                  <input
                    type="radio"
                    name="feedback-sentiment"
                    value={value}
                    checked={feedbackSentiment === value}
                    onChange={() => setFeedbackSentiment(value)}
                  />
                  <span>{FEEDBACK_LABELS[value]}</span>
                </label>
              ))}
            </div>
            <div className="chat-feedback-expectations">
              <label className="chat-feedback-field">
                Expected intent type
                <select
                  value={feedbackIntentExpectation}
                  onChange={(event) =>
                    setFeedbackIntentExpectation(event.target.value as FeedbackIntentChoice)
                  }
                >
                  {FEEDBACK_INTENT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="chat-feedback-boolean-grid">
                <label className="chat-feedback-field">
                  Expected Skill Check
                  <select
                    value={feedbackSkillExpectation}
                    onChange={(event) =>
                      setFeedbackSkillExpectation(event.target.value as FeedbackBooleanChoice)
                    }
                  >
                    {FEEDBACK_BOOLEAN_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {feedbackSkillExpectation === 'true' ? (
                    <textarea
                      className="chat-feedback-note-input"
                      rows={2}
                      maxLength={2000}
                      placeholder="Describe the situation requiring a check"
                      value={feedbackSkillNotes}
                      onChange={(event) => setFeedbackSkillNotes(event.target.value)}
                    />
                  ) : null}
                </label>
                <label className="chat-feedback-field">
                  Expected Location Change
                  <select
                    value={feedbackLocationExpectation}
                    onChange={(event) =>
                      setFeedbackLocationExpectation(event.target.value as FeedbackBooleanChoice)
                    }
                  >
                    {FEEDBACK_BOOLEAN_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {feedbackLocationExpectation === 'true' ? (
                    <textarea
                      className="chat-feedback-note-input"
                      rows={2}
                      maxLength={2000}
                      placeholder="Where should the scene have moved?"
                      value={feedbackLocationNotes}
                      onChange={(event) => setFeedbackLocationNotes(event.target.value)}
                    />
                  ) : null}
                </label>
                <label className="chat-feedback-field">
                  Expected Inventory Delta
                  <select
                    value={feedbackInventoryExpectation}
                    onChange={(event) =>
                      setFeedbackInventoryExpectation(event.target.value as FeedbackBooleanChoice)
                    }
                  >
                    {FEEDBACK_BOOLEAN_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {feedbackInventoryExpectation === 'true' ? (
                    <textarea
                      className="chat-feedback-note-input"
                      rows={2}
                      maxLength={2000}
                      placeholder="What gear change was expected?"
                      value={feedbackInventoryNotes}
                      onChange={(event) => setFeedbackInventoryNotes(event.target.value)}
                    />
                  ) : null}
                </label>
              </div>
            </div>
            <label className="chat-feedback-comment">
              <span>Optional details</span>
              <textarea
                rows={3}
                maxLength={2000}
                value={feedbackComment}
                placeholder="What stood out or what felt off?"
                onChange={(event) => setFeedbackComment(event.target.value)}
              />
            </label>
            {feedbackError ? <p className="chat-feedback-error">{feedbackError}</p> : null}
            <div className="chat-feedback-actions">
              <button type="button" className="chat-feedback-cancel" onClick={closeFeedbackModal}>
                Cancel
              </button>
              <button
                type="button"
                className="chat-feedback-submit"
                onClick={handleSubmitFeedback}
                disabled={isSubmittingFeedback}
              >
                {isSubmittingFeedback ? 'Sending…' : 'Send Feedback'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
type BeatTagProps = {
  beatLookup: Map<string, string>;
  directive: PlayerBeatDirective | null;
  label: string;
};

const BeatTag = ({ beatLookup, directive, label }: BeatTagProps) => {
  if (!directive) {
    return null;
  }
  const isHoverable = directive.kind === 'new' || directive.kind === 'existing';
  const resolvedTitle =
    directive.kind === 'existing' && directive.targetBeatId
      ? beatLookup.get(directive.targetBeatId) ?? TRACKED_BEAT_LABEL
      : directive.summary ?? TRACKED_BEAT_LABEL;
  const resolvedDescription =
    directive.kind === 'existing' && directive.targetBeatId
      ? beatLookup.get(directive.targetBeatId) ?? directive.summary ?? null
      : directive.summary ?? null;

  return (
    <span className={`chat-entry-beat-tag${isHoverable ? ' chat-entry-beat-tag-hoverable' : ''}`}>
      {label}
      {isHoverable ? (
        <span className="chat-entry-beat-tooltip">
          <span className="chat-entry-beat-tooltip-label">Beat Details</span>
          <p className="chat-entry-beat-tooltip-title">
            {resolvedTitle ?? directive.summary ?? 'Tracked beat'}
          </p>
          {resolvedDescription ? (
            <p className="chat-entry-beat-tooltip-description">{resolvedDescription}</p>
          ) : null}
        </span>
      ) : null}
    </span>
  );
};
