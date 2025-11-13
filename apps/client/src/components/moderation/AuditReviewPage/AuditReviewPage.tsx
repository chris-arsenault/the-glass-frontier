import {
  AUDIT_REVIEW_TAGS,
  PROMPT_TEMPLATE_DESCRIPTORS,
  PromptTemplateIds,
  type AuditQueueItem,
  type AuditReviewStatus,
  type PromptTemplateId,
} from '@glass-frontier/dto';
import { useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';

import { useCanModerate } from '../../../hooks/useUserRole';
import { useAuditReviewStore, type AuditFilters } from '../../../stores/auditReviewStore';
import { useChronicleStore } from '../../../stores/chronicleStore';
import './AuditReviewPage.css';

type JsonValue = Record<string, unknown> | null | undefined;

const STATUS_LABELS: Record<string, string> = {
  completed: 'Completed',
  in_progress: 'In Progress',
  unreviewed: 'Unreviewed',
};

const formatTag = (tag: string): string =>
  tag
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');

const formatDate = (timestamp: number | string): string => {
  const date = typeof timestamp === 'number' ? new Date(timestamp) : new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }
  return date.toLocaleString();
};

const coerceString = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
};

const extractSegmentText = (segment: unknown): string | null => {
  const direct = coerceString(segment);
  if (direct !== null) {
    return direct;
  }
  if (
    segment !== null &&
    typeof segment === 'object' &&
    'text' in (segment as Record<string, unknown>)
  ) {
    return coerceString((segment as { text?: unknown }).text);
  }
  return null;
};

const extractMessageContent = (value: unknown): string | null => {
  const direct = coerceString(value);
  if (direct !== null) {
    return direct;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const text = extractSegmentText(entry);
      if (text !== null) {
        return text;
      }
    }
  }
  return null;
};

const extractRequestPreview = (request: JsonValue): string | null => {
  if (request === null || typeof request !== 'object') {
    return null;
  }
  const messages = Array.isArray((request as { messages?: unknown }).messages)
    ? ((request as { messages?: unknown }).messages as Array<{ content?: unknown }>)
    : [];
  const first = messages.at(0);
  return extractMessageContent(first?.content ?? null);
};

const extractResponsePreview = (response: unknown): string | null => {
  if (response === null || typeof response !== 'object') {
    return null;
  }
  const choices = Array.isArray((response as { choices?: unknown }).choices)
    ? ((response as { choices?: unknown }).choices as Array<{ message?: { content?: unknown } }>)
    : [];
  const first = choices.at(0);
  return extractMessageContent(first?.message?.content ?? null);
};

type QueueFiltersProps = {
  filters: AuditFilters;
  isBusy: boolean;
  onApply: () => void;
  onChange: (updates: Partial<AuditFilters>) => void;
};

const QueueFilters = ({ filters, isBusy, onApply, onChange }: QueueFiltersProps) => {
  const handleStatusToggle = (status: AuditReviewStatus) => {
    const next = filters.status.includes(status)
      ? filters.status.filter((entry) => entry !== status)
      : [...filters.status, status];
    onChange({ status: next });
  };

  return (
    <div className="audit-filters">
      <div className="audit-filter-group">
        <label htmlFor="audit-filter-player">Player ID</label>
        <input
          id="audit-filter-player"
          type="text"
          value={filters.playerId}
          onChange={(event) => onChange({ playerId: event.target.value })}
          placeholder="player-login-id"
        />
      </div>
      <div className="audit-filter-group">
        <label htmlFor="audit-filter-search">Search</label>
        <input
          id="audit-filter-search"
          type="text"
          value={filters.search}
          onChange={(event) => onChange({ search: event.target.value })}
          placeholder="context id, metadata…"
        />
      </div>
      <div className="audit-filter-row">
        <div className="audit-filter-group">
          <label htmlFor="audit-filter-start">Start Date</label>
          <input
            id="audit-filter-start"
            type="date"
            value={filters.startDate ?? ''}
            onChange={(event) => onChange({ startDate: event.target.value || null })}
          />
        </div>
        <div className="audit-filter-group">
          <label htmlFor="audit-filter-end">End Date</label>
          <input
            id="audit-filter-end"
            type="date"
            value={filters.endDate ?? ''}
            onChange={(event) => onChange({ endDate: event.target.value || null })}
          />
        </div>
      </div>
      <div className="audit-filter-group">
        <label htmlFor="audit-filter-template">Prompt Template</label>
        <select
          id="audit-filter-template"
          value={filters.templateId ?? ''}
          onChange={(event) =>
            onChange({
              templateId:
                (event.target.value as PromptTemplateId | '') === ''
                  ? null
                  : (event.target.value as PromptTemplateId),
            })
          }
        >
          <option value="">All templates</option>
          {PromptTemplateIds.map((templateId) => (
            <option key={templateId} value={templateId}>
              {PROMPT_TEMPLATE_DESCRIPTORS[templateId].label}
            </option>
          ))}
        </select>
      </div>
      <div className="audit-filter-group">
        <span>Status</span>
        <div className="audit-filter-status-options">
          {Object.entries(STATUS_LABELS).map(([status, label]) => (
            <label key={status} className="audit-filter-checkbox">
              <input
                type="checkbox"
                checked={filters.status.includes(status as AuditReviewStatus)}
                onChange={() => handleStatusToggle(status as AuditReviewStatus)}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </div>
      <button type="button" className="audit-filter-apply" onClick={onApply} disabled={isBusy}>
        {isBusy ? 'Applying…' : 'Apply Filters'}
      </button>
    </div>
  );
};

type QueueListProps = {
  items: AuditQueueItem[];
  onSelect: (storageKey: string) => void;
  selectedKey: string | null;
};

const QueueList = ({ items, onSelect, selectedKey }: QueueListProps) => {
  if (items.length === 0) {
    return <p className="audit-queue-empty">No audit records match the current filters.</p>;
  }
  return (
    <ul className="audit-queue-list horizontal">
      {items.map((item) => (
        <li key={item.storageKey}>
          <button
            type="button"
            className={`audit-queue-item${selectedKey === item.storageKey ? ' selected' : ''}`}
            onClick={() => onSelect(item.storageKey)}
          >
            <div className="audit-queue-item-head">
              <span className={`audit-chip status-${item.status}`}>{STATUS_LABELS[item.status]}</span>
              <span className="audit-queue-item-date">{formatDate(item.createdAt)}</span>
            </div>
            <div className="audit-queue-item-body">
              <p className="audit-queue-item-title">
                {item.templateId
                  ? PROMPT_TEMPLATE_DESCRIPTORS[item.templateId].label
                  : item.nodeId ?? 'Unknown node'}
              </p>
              <p className="audit-queue-item-meta">
                Player {item.playerId ?? 'n/a'} · Provider {item.providerId ?? 'n/a'}
              </p>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
};

export function AuditReviewPage(): JSX.Element {
  const canModerate = useCanModerate();
  const loginId = useChronicleStore((state) => state.loginId);
  const navigate = useNavigate();
  const {
    cursor,
    detail,
    draft,
    error,
    filters,
    generateProposals,
    isLoading,
    isLoadingMore,
    items,
    loadMore,
    loadQueue,
    proposalGenerating,
    proposalLoading,
    proposals,
    refreshProposals,
    review,
    saveReview,
    selectedItem,
    selectedKey,
    selectItem,
    setFilters,
    updateDraft,
  } = useAuditReviewStore(
    useShallow((state) => ({
      cursor: state.cursor,
      detail: state.detail,
      draft: state.draft,
      error: state.error,
      filters: state.filters,
      generateProposals: state.generateProposals,
      isLoading: state.isLoading,
      isLoadingMore: state.isLoadingMore,
      items: state.items,
      loadMore: state.loadMore,
      loadQueue: state.loadQueue,
      proposalGenerating: state.proposalGenerating,
      proposalLoading: state.proposalLoading,
      proposals: state.proposals,
      refreshProposals: state.refreshProposals,
      review: state.review,
      saveReview: state.saveReview,
      selectedItem: state.selectedItem,
      selectedKey: state.selectedKey,
      selectItem: state.selectItem,
      setFilters: state.setFilters,
      updateDraft: state.updateDraft,
    }))
  );

  useEffect(() => {
    if (!canModerate) {
      return;
    }
    void loadQueue();
    void refreshProposals();
  }, [canModerate, loadQueue, refreshProposals]);

  if (!canModerate) {
    return <Navigate to="/" replace />;
  }

  const handleSaveDraft = () => {
    if (!loginId) {
      return;
    }
    void saveReview(loginId, 'in_progress');
  };

  const handleComplete = () => {
    if (!loginId) {
      return;
    }
    void saveReview(loginId, 'completed');
  };

  const detailTemplateLabel = selectedItem?.templateId
    ? PROMPT_TEMPLATE_DESCRIPTORS[selectedItem.templateId].label
    : selectedItem?.nodeId ?? 'Unknown';

  return (
    <div className="audit-page">
      <header className="audit-page-header">
        <div>
          <h1>LLM Audit Review</h1>
          <p>Browse archived requests, capture moderator reviews, and inspect template proposals.</p>
        </div>
        <div className="audit-header-actions">
          <button type="button" onClick={() => navigate('/')}>
            Back to Chronicle
          </button>
          <button type="button" onClick={() => void loadQueue()} disabled={isLoading}>
            {isLoading ? 'Refreshing…' : 'Refresh Queue'}
          </button>
          <button
            type="button"
            onClick={() => void generateProposals()}
            disabled={proposalGenerating}
          >
            {proposalGenerating ? 'Generating…' : 'Generate Proposals'}
          </button>
        </div>
      </header>
      {error ? <p className="audit-error">{error}</p> : null}
      <div className="audit-layout">
        <section className="audit-panel audit-queue-panel">
          <div className="audit-panel-header">
            <h2>Review Queue</h2>
            <span className="audit-count">{items.length} items</span>
          </div>
          <QueueFilters
            filters={filters}
            onChange={setFilters}
            onApply={() => void loadQueue()}
            isBusy={isLoading}
          />
          <QueueList items={items} onSelect={(key) => void selectItem(key)} selectedKey={selectedKey} />
          <div className="audit-panel-footer">
            <button type="button" onClick={() => void loadMore()} disabled={!cursor || isLoadingMore}>
              {isLoadingMore ? 'Loading…' : cursor ? 'Load More' : 'End of Queue'}
            </button>
          </div>
        </section>
        <section className="audit-panel audit-workspace-panel">
          <div className="audit-panel-header">
            <h2>Review Workspace</h2>
            {detail ? (
              <span className={`audit-chip status-${review?.status ?? 'unreviewed'}`}>
                {STATUS_LABELS[review?.status ?? 'unreviewed']}
              </span>
            ) : null}
          </div>
          {detail ? (
            <div className="audit-workspace">
              <div className="audit-context">
                <div>
                  <p className="audit-context-label">Template</p>
                  <p className="audit-context-value">{detailTemplateLabel}</p>
                </div>
                <div>
                  <p className="audit-context-label">Player</p>
                  <p className="audit-context-value">{detail.playerId ?? 'n/a'}</p>
                </div>
                <div>
                  <p className="audit-context-label">Provider</p>
                  <p className="audit-context-value">{detail.providerId ?? 'n/a'}</p>
                </div>
                <div>
                  <p className="audit-context-label">Request Context</p>
                  <p className="audit-context-value">{detail.requestContextId ?? 'n/a'}</p>
                </div>
              </div>
              <div className="audit-body">
                <div>
                  <h3>Request Payload</h3>
                  <pre className="audit-blob">
                    {extractRequestPreview(detail.request) ?? 'No message content available.'}
                  </pre>
                </div>
                <div>
                  <h3>Response Payload</h3>
                  <pre className="audit-blob">
                    {extractResponsePreview(detail.response) ?? 'No message content available.'}
                  </pre>
                </div>
              </div>
              <form
                className="audit-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  handleComplete();
                }}
              >
                <label>
                  Notes
                  <textarea
                    rows={4}
                    value={draft.notes}
                    onChange={(event) => updateDraft({ notes: event.target.value })}
                  />
                </label>
                <div className="audit-tags">
                  <p>Tags</p>
                  <div className="audit-tag-grid">
                    {AUDIT_REVIEW_TAGS.map((tag) => (
                      <label key={tag} className="audit-filter-checkbox">
                        <input
                          type="checkbox"
                          checked={draft.tags.includes(tag)}
                          onChange={(event) => {
                            const next = event.target.checked
                              ? [...draft.tags, tag]
                              : draft.tags.filter((entry) => entry !== tag);
                            updateDraft({ tags: next });
                          }}
                        />
                        <span>{formatTag(tag)}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="audit-form-actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={handleSaveDraft}
                    disabled={!loginId || isLoading}
                  >
                    {isLoading ? 'Saving…' : 'Save Draft'}
                  </button>
                  <button type="submit" className="primary" disabled={!loginId || isLoading}>
                    {isLoading ? 'Saving…' : 'Complete Review'}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <p className="audit-placeholder">Select an audit record from the queue to begin.</p>
          )}
        </section>
        <aside className="audit-panel audit-proposals-panel">
          <div className="audit-panel-header">
            <h2>Template Proposals</h2>
            <button type="button" onClick={() => void refreshProposals()} disabled={proposalLoading}>
              {proposalLoading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
          {proposals.length === 0 ? (
            <p className="audit-placeholder">No proposals generated yet.</p>
          ) : (
            <ul className="audit-proposal-list">
              {proposals.map((proposal) => (
                <li key={proposal.id} className="audit-proposal-item">
                  <div className="audit-proposal-head">
                    <p className="audit-proposal-title">
                      {PROMPT_TEMPLATE_DESCRIPTORS[proposal.templateId].label}
                    </p>
                    <span className={`audit-chip severity-${proposal.severity}`}>
                      {proposal.severity}
                    </span>
                  </div>
                  <p className="audit-proposal-summary">{proposal.summary}</p>
                  <p className="audit-proposal-meta">
                    {formatDate(proposal.createdAt)} · {proposal.reviewCount} reviews ·{' '}
                    {(proposal.confidence * 100).toFixed(0)}% confidence
                  </p>
                  {proposal.tags.length > 0 ? (
                    <div className="audit-proposal-tags">
                      {proposal.tags.map((tag) => (
                        <span key={tag} className="audit-chip tag-chip">
                          {formatTag(tag)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
