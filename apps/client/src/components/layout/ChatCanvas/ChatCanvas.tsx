import type { PlayerFeedbackSentiment, Intent } from '@glass-frontier/dto';
import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { promptClient } from '../../../lib/promptClient';
import type { ChatMessage } from '../../../state/chronicleState';
import { useChronicleStore } from '../../../stores/chronicleStore';
import { useUiStore } from '../../../stores/uiStore';
import { InventoryDeltaBadge } from '../../badges/InventoryDeltaBadge/InventoryDeltaBadge';
import { SkillCheckBadge } from '../../badges/SkillCheckBadge/SkillCheckBadge';
import './ChatCanvas.css';

type FeedbackTarget = {
  auditId: string;
  gmEntryId: string;
  turnId: string;
  turnSequence: number;
  excerpt: string;
};

const FEEDBACK_CACHE_KEY = 'chat-feedback-cache';
const FEEDBACK_SENTIMENTS: PlayerFeedbackSentiment[] = ['positive', 'neutral', 'negative'];
const FEEDBACK_LABELS: Record<PlayerFeedbackSentiment, string> = {
  negative: 'Needs work',
  neutral: 'It was okay',
  positive: 'Loved it',
};

const describeBeatDirectiveTag = (
  directive: Intent['beatDirective'] | null | undefined,
  lookup: Map<string, string>
): string | null => {
  if (!directive) {
    return null;
  }
  if (directive.kind === 'existing') {
    const title = directive.targetBeatId ? lookup.get(directive.targetBeatId) : null;
    return `Beat · ${title ?? 'Tracked goal'}`;
  }
  if (directive.kind === 'new') {
    return 'Beat · New thread';
  }
  return 'Beat · Independent';
};

const formatIntentBadgeLabel = (intentType: ChatMessage['intentType']): string | null => {
  if (!intentType) {
    return null;
  }
  return intentType.replace(/^\w/, (char) => char.toUpperCase());
};

const describeTimelineBadge = (advancesTimeline: ChatMessage['advancesTimeline']): string | null => {
  if (typeof advancesTimeline !== 'boolean') {
    return null;
  }
  return advancesTimeline ? 'Advances timeline' : 'Holds moment';
};

const describeWorldDeltaTags = (tags: ChatMessage['worldDeltaTags']): string | null => {
  if (!Array.isArray(tags) || tags.length === 0) {
    return null;
  }
  return tags.join(', ');
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
    const parsed = JSON.parse(raw) as Record<string, true>;
    return parsed !== null && typeof parsed === 'object' ? parsed : {};
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
  const messages = useChronicleStore((state) => state.messages);
  const hasChronicle = useChronicleStore((state) => Boolean(state.chronicleId));
  const chronicleId = useChronicleStore((state) => state.chronicleId);
  const loginId = useChronicleStore((state) => state.loginId);
  const isWaitingForGm = useChronicleStore((state) => state.isSending);
  const beats = useChronicleStore((state) => state.beats);
  const expandedMessages = useUiStore((state) => state.expandedMessages);
  const setExpandedMessages = useUiStore((state) => state.setExpandedMessages);
  const toggleMessageExpansion = useUiStore((state) => state.toggleMessageExpansion);
  const resetExpandedMessages = useUiStore((state) => state.resetExpandedMessages);
  const streamRef = useRef(null);
  const [feedbackCache, setFeedbackCache] = useState<Record<string, true>>(() => readFeedbackCache());
  const [feedbackTarget, setFeedbackTarget] = useState<FeedbackTarget | null>(null);
  const [feedbackSentiment, setFeedbackSentiment] = useState<PlayerFeedbackSentiment>('positive');
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const beatLookup = useMemo(() => {
    const map = new Map<string, string>();
    beats.forEach((beat) => {
      if (beat && typeof beat.id === 'string') {
        map.set(beat.id, beat.title);
      }
    });
    return map;
  }, [beats]);

  const markFeedbackSubmitted = (auditId: string) => {
    setFeedbackCache((prev) => {
      if (prev[auditId]) {
        return prev;
      }
      const next = { ...prev, [auditId]: true };
      writeFeedbackCache(next);
      return next;
    });
  };

  const closeFeedbackModal = () => {
    setFeedbackTarget(null);
    setFeedbackComment('');
    setFeedbackError(null);
    setIsSubmittingFeedback(false);
  };

  const openFeedbackModal = (message: ChatMessage) => {
    const auditId = message.gmTrace?.auditId ?? null;
    const turnSequence = typeof message.turnSequence === 'number' ? message.turnSequence : null;
    if (!auditId || !message.turnId || turnSequence === null) {
      return;
    }
    setFeedbackTarget({
      auditId,
      excerpt: (message.entry.content ?? '').slice(0, 280),
      gmEntryId: message.entry.id,
      turnId: message.turnId,
      turnSequence,
    });
    setFeedbackSentiment('positive');
    setFeedbackComment('');
    setFeedbackError(null);
  };

  const handleSubmitFeedback = async () => {
    if (feedbackTarget === null || !chronicleId || !loginId) {
      return;
    }
    setIsSubmittingFeedback(true);
    setFeedbackError(null);
    try {
      await promptClient.submitPlayerFeedback.mutate({
        auditId: feedbackTarget.auditId,
        chronicleId,
        comment: feedbackComment.trim() || undefined,
        gmEntryId: feedbackTarget.gmEntryId,
        playerLoginId: loginId,
        sentiment: feedbackSentiment,
        turnId: feedbackTarget.turnId,
        turnSequence: feedbackTarget.turnSequence,
      });
      markFeedbackSubmitted(feedbackTarget.auditId);
      closeFeedbackModal();
    } catch (error) {
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
            const {
              attributeKey,
              entry,
              playerIntent,
              skillCheckPlan,
              skillCheckResult,
              skillKey,
              skillProgress,
            } = chatMessage;
            const auditId = chatMessage.gmTrace?.auditId ?? null;
            const hasSubmitted = auditId ? feedbackCache[auditId] === true : false;
            const hasTurnSequence = typeof chatMessage.turnSequence === 'number';
            const canSubmitFeedback =
              auditId !== null &&
              Boolean(chatMessage.turnId) &&
              hasTurnSequence &&
              Boolean(chronicleId) &&
              Boolean(loginId) &&
              !hasSubmitted;
            const timestamp =
              typeof entry.metadata?.timestamp === 'number'
                ? new Date(entry.metadata.timestamp)
                : new Date();
            const displayRole =
              entry.role === 'player' ? 'Player' : entry.role === 'gm' ? 'GM' : 'System';
            const beatDirectiveLabel =
              entry.role === 'player'
                ? describeBeatDirectiveTag(playerIntent?.beatDirective, beatLookup)
                : null;
            const intentLabel = formatIntentBadgeLabel(chatMessage.intentType ?? null);
            const timelineLabel = describeTimelineBadge(chatMessage.advancesTimeline ?? null);
            const deltaLabel = describeWorldDeltaTags(chatMessage.worldDeltaTags ?? null);

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
                    {entry.role === 'player' && playerIntent?.tone ? (
                      <span className="chat-entry-tone">{playerIntent.tone}</span>
                    ) : null}
                    {entry.role === 'player' && playerIntent?.creativeSpark ? (
                      <span className="chat-entry-spark" title="Creative Spark awarded">
                        ★
                      </span>
                    ) : null}
                    {entry.role === 'player' && beatDirectiveLabel ? (
                      <span className="chat-entry-beat-tag">{beatDirectiveLabel}</span>
                    ) : null}
                    {entry.role === 'gm' ? (
                      <>
                        {intentLabel ? (
                          <span className="chat-entry-intent-tag">{intentLabel}</span>
                        ) : null}
                        {timelineLabel ? (
                          <span className="chat-entry-timeline-tag">{timelineLabel}</span>
                        ) : null}
                        <SkillCheckBadge
                          plan={skillCheckPlan}
                          result={skillCheckResult}
                          skillKey={skillKey}
                          attributeKey={attributeKey}
                        />
                        <InventoryDeltaBadge delta={chatMessage.inventoryDelta} />
                        {hasSubmitted ? (
                          <span className="chat-entry-feedback-status">Feedback sent</span>
                        ) : (
                          <button
                            type="button"
                            className="chat-entry-feedback-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              event.preventDefault();
                              openFeedbackModal(chatMessage);
                            }}
                            disabled={!canSubmitFeedback}
                          >
                            Share Feedback
                          </button>
                        )}
                      </>
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
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {entry.content ?? ''}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <p className="chat-entry-summary">
                          {chatMessage.gmSummary ??
                            playerIntent?.intentSummary ??
                            'GM summary unavailable.'}
                        </p>
                      )}
                      {skillProgress?.length ? (
                        <div className="skill-progress-badges" aria-live="polite">
                          {skillProgress.map((badge, badgeIndex) => (
                            <span
                              key={`${entry.id ?? index}-progress-${badge.skill}-${badgeIndex}`}
                              className={`skill-progress-badge skill-progress-badge-${badge.type}`}
                            >
                              {badge.type === 'skill-gain'
                                ? `New Skill · ${badge.skill}${badge.attribute ? ` (${badge.attribute})` : ''}`
                                : `Tier Up · ${badge.skill} → ${badge.tier}`}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {deltaLabel ? (
                        <p className="chat-entry-delta-note">World shifts: {deltaLabel}</p>
                      ) : null}
                      {chatMessage.executedNodes?.length ? (
                        <p className="chat-entry-node-trace">
                          GM pipeline: {chatMessage.executedNodes.join(' → ')}
                        </p>
                      ) : null}
                    </>
                  ) : entry.role === 'player' ? (
                    isExpanded(entry.id) ? (
                      <p
                        className="chat-entry-content"
                        title={playerIntent?.intentSummary ?? undefined}
                      >
                        {entry.content}
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
          <span className="chat-loading-text">GM is composing the next beat…</span>
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
