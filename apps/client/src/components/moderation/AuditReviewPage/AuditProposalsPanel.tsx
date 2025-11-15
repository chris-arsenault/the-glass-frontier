import type { AuditProposalRecord } from '@glass-frontier/dto';
import { PROMPT_TEMPLATE_DESCRIPTORS } from '@glass-frontier/dto';

import { formatDate, formatTag } from './utils';

type AuditProposalsPanelProps = {
  onGenerate: () => void;
  onRefresh: () => void;
  proposalGenerating: boolean;
  proposalLoading: boolean;
  proposals: AuditProposalRecord[];
};

export const AuditProposalsPanel = ({
  onGenerate,
  onRefresh,
  proposalGenerating,
  proposalLoading,
  proposals,
}: AuditProposalsPanelProps) => (
  <aside className="audit-panel audit-proposals-panel">
    <ProposalHeader
      onGenerate={onGenerate}
      onRefresh={onRefresh}
      proposalGenerating={proposalGenerating}
      proposalLoading={proposalLoading}
    />
    {proposals.length === 0 ? (
      <p className="audit-placeholder">No proposals generated yet.</p>
    ) : (
      <AuditProposalList proposals={proposals} />
    )}
  </aside>
);

type ProposalHeaderProps = {
  onGenerate: () => void;
  onRefresh: () => void;
  proposalGenerating: boolean;
  proposalLoading: boolean;
};

const ProposalHeader = ({
  onGenerate,
  onRefresh,
  proposalGenerating,
  proposalLoading,
}: ProposalHeaderProps) => (
  <div className="audit-panel-header">
    <h2>Template Proposals</h2>
    <div className="audit-panel-actions">
      <button type="button" onClick={onGenerate} disabled={proposalGenerating}>
        {proposalGenerating ? 'Generating…' : 'Generate'}
      </button>
      <button type="button" onClick={onRefresh} disabled={proposalLoading}>
        {proposalLoading ? 'Refreshing…' : 'Refresh'}
      </button>
    </div>
  </div>
);

type AuditProposalListProps = {
  proposals: AuditProposalRecord[];
};

const AuditProposalList = ({ proposals }: AuditProposalListProps) => (
  <ul className="audit-proposal-list">
    {proposals.map((proposal) => (
      <li key={proposal.id} className="audit-proposal-item">
        <div className="audit-proposal-head">
          <p className="audit-proposal-title">
            {PROMPT_TEMPLATE_DESCRIPTORS[proposal.templateId].label}
          </p>
          <span className={`audit-chip severity-${proposal.severity}`}>{proposal.severity}</span>
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
);
