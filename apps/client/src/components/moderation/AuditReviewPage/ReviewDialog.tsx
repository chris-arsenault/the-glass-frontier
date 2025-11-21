import {
  AUDIT_REVIEW_TAGS,
  type AuditLogEntry,
  type AuditReviewTag,
  type PlayerFeedbackRecord,
} from '@glass-frontier/dto';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';

import {
  extractRequestPreview,
  extractResponsePreview,
  formatFeedbackTimestamp,
  formatTag,
} from './utils';

type ReviewDraft = { notes: string; tags: AuditReviewTag[] };

type ReviewDialogProps = {
  detail: AuditLogEntry | null;
  draft: ReviewDraft;
  isOpen: boolean;
  isSaving: boolean;
  playerId: string | null;
  onCancel: () => void;
  onComplete: () => void;
  onSaveDraft: () => void;
  templateLabel: string;
  updateDraft: (updates: Partial<ReviewDraft>) => void;
};

export const ReviewDialog = ({
  detail,
  draft,
  isOpen,
  isSaving,
  playerId,
  onCancel,
  onComplete,
  onSaveDraft,
  templateLabel,
  updateDraft,
}: ReviewDialogProps) => {
  if (!detail) {
    return (
      <Dialog open={isOpen} onClose={onCancel} fullWidth maxWidth="md">
        <DialogTitle>Review</DialogTitle>
        <DialogContent>
          <p className="audit-placeholder">Loading record…</p>
        </DialogContent>
        <DialogActions>
          <Button onClick={onCancel}>Close</Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onClose={onCancel} fullWidth maxWidth="md">
      <DialogTitle>Review · {templateLabel}</DialogTitle>
      <DialogContent className="audit-dialog-content">
        <ReviewDialogContent detail={detail} draft={draft} updateDraft={updateDraft} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Close</Button>
        <Button onClick={onSaveDraft} disabled={!playerId || isSaving}>
          {isSaving ? 'Saving…' : 'Save Draft'}
        </Button>
        <Button onClick={onComplete} variant="contained" disabled={!playerId || isSaving}>
          {isSaving ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

type ReviewDialogContentProps = {
  detail: AuditLogEntry;
  draft: ReviewDraft;
  updateDraft: (updates: Partial<ReviewDraft>) => void;
};

const ReviewDialogContent = ({ detail, draft, updateDraft }: ReviewDialogContentProps) => (
  <>
    <PayloadSection detail={detail} />
    <PlayerFeedbackSection feedback={detail.playerFeedback ?? []} />
    <NotesField value={draft.notes} onChange={(value) => updateDraft({ notes: value })} />
    <TagSelector
      selected={draft.tags}
      onToggle={(next) => updateDraft({ tags: next })}
    />
  </>
);

const PayloadSection = ({ detail }: { detail: AuditLogEntry }) => (
  <div className="audit-body">
    <PayloadPreview
      label="Request Payload"
      content={extractRequestPreview(detail.request) ?? 'No message content available.'}
    />
    <PayloadPreview
      label="Response Payload"
      content={extractResponsePreview(detail.response) ?? 'No message content available.'}
    />
  </div>
);

type PayloadPreviewProps = {
  content: string;
  label: string;
};

const PayloadPreview = ({ content, label }: PayloadPreviewProps) => (
  <div>
    <h3>{label}</h3>
    <pre className="audit-blob">{content}</pre>
  </div>
);

type PlayerFeedbackSectionProps = {
  feedback: PlayerFeedbackRecord[];
};

const PlayerFeedbackSection = ({ feedback }: PlayerFeedbackSectionProps) => (
  <section className="audit-feedback-panel">
    <div className="audit-feedback-header">
      <h3>Player Feedback</h3>
      <span className="audit-feedback-count">
        {feedback.length > 0 ? `${feedback.length} submission${feedback.length === 1 ? '' : 's'}` : 'None yet'}
      </span>
    </div>
    {feedback.length === 0 ? (
      <p className="audit-placeholder">No player feedback has been recorded for this response.</p>
    ) : (
      <ul className="audit-feedback-list">
        {feedback.map((entry) => (
          <FeedbackItem key={entry.id} entry={entry} />
        ))}
      </ul>
    )}
  </section>
);

const FeedbackItem = ({ entry }: { entry: PlayerFeedbackRecord }) => {
  const expectationBlocks = buildExpectationBlocks(entry);
  return (
    <li className="audit-feedback-item">
      <div className="audit-feedback-meta">
        <span className={`audit-chip sentiment-${entry.sentiment}`}>{entry.sentiment}</span>
        <span>{entry.playerId ?? 'Unknown player'}</span>
        <span>{formatFeedbackTimestamp(entry.createdAt)}</span>
      </div>
      {expectationBlocks.length > 0 ? (
        <div className="audit-feedback-expectations">
          {expectationBlocks.map((block) => (
            <ExpectationRow key={block.label} {...block} />
          ))}
        </div>
      ) : null}
      <p className="audit-feedback-comment">
        {entry.comment?.trim().length ? entry.comment : 'No additional context provided.'}
      </p>
    </li>
  );
};

type ExpectationRowProps = {
  label: string;
  value: string;
  note?: string | null;
};

const ExpectationRow = ({ label, note, value }: ExpectationRowProps) => (
  <div className="audit-feedback-expectation-row">
    <span>{label}</span>
    <strong>{value}</strong>
    {note ? <p className="audit-feedback-note">{note}</p> : null}
  </div>
);

const buildExpectationBlocks = (entry: PlayerFeedbackRecord): ExpectationRowProps[] => {
  const blocks: ExpectationRowProps[] = [];
  if (entry.expectedIntentType) {
    blocks.push({ label: 'Expected intent type', value: entry.expectedIntentType });
  }
  addBooleanExpectation(blocks, 'Expected skill check', entry.expectedSkillCheck, entry.expectedSkillNotes);
  addBooleanExpectation(
    blocks,
    'Expected location change',
    entry.expectedLocationChange,
    entry.expectedLocationNotes
  );
  addBooleanExpectation(
    blocks,
    'Expected inventory delta',
    entry.expectedInventoryDelta,
    entry.expectedInventoryNotes
  );
  return blocks;
};

const addBooleanExpectation = (
  blocks: ExpectationRowProps[],
  label: string,
  flag: boolean | null | undefined,
  note?: string | null
) => {
  if (flag === null || flag === undefined) {
    return;
  }
  blocks.push({ label, note, value: flag ? 'True' : 'False' });
};

type NotesFieldProps = {
  onChange: (value: string) => void;
  value: string;
};

const NotesField = ({ onChange, value }: NotesFieldProps) => (
  <label className="audit-dialog-notes">
    Notes
    <textarea rows={4} value={value} onChange={(event) => onChange(event.target.value)} />
  </label>
);

type TagSelectorProps = {
  onToggle: (next: AuditReviewTag[]) => void;
  selected: AuditReviewTag[];
};

const TagSelector = ({ onToggle, selected }: TagSelectorProps) => {
  const toggle = (tag: AuditReviewTag, enabled: boolean) => {
    const next = enabled ? [...selected, tag] : selected.filter((entry) => entry !== tag);
    onToggle(next);
  };
  return (
    <div className="audit-dialog-tags">
      <p>Tags</p>
      <div className="audit-tag-grid">
        {AUDIT_REVIEW_TAGS.map((tag) => (
          <label key={tag} className="audit-filter-checkbox">
            <input
              type="checkbox"
              checked={selected.includes(tag)}
              onChange={(event) => toggle(tag, event.target.checked)}
            />
            <span>{formatTag(tag)}</span>
          </label>
        ))}
      </div>
    </div>
  );
};
