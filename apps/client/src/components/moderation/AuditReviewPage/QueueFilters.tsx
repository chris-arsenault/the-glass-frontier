import type { AuditReviewStatus, PromptTemplateId } from '@glass-frontier/dto';
import { PROMPT_TEMPLATE_DESCRIPTORS, PromptTemplateIds } from '@glass-frontier/dto';

import type { AuditFilters } from '../../../stores/auditReviewStore';
import { STATUS_LABELS } from './utils';

type QueueFiltersProps = {
  filters: AuditFilters;
  isBusy: boolean;
  onApply: () => void;
  onChange: (updates: Partial<AuditFilters>) => void;
};

const TEXT_FILTERS = [
  {
    id: 'audit-filter-player',
    label: 'Player ID',
    placeholder: 'player-id',
    valueKey: 'playerId' as const,
  },
  {
    id: 'audit-filter-search',
    label: 'Search',
    placeholder: 'context id, metadata…',
    valueKey: 'search' as const,
  },
];

export const QueueFilters = ({ filters, isBusy, onApply, onChange }: QueueFiltersProps) => (
  <div className="audit-filters">
    {TEXT_FILTERS.map((config) => (
      <FilterInput
        key={config.id}
        config={config}
        value={filters[config.valueKey]}
        onChange={onChange}
      />
    ))}
    <DateRangeFilters endDate={filters.endDate} startDate={filters.startDate} onChange={onChange} />
    <TemplateFilter templateId={filters.templateId} onChange={onChange} />
    <StatusFilters selected={filters.status} onChange={onChange} />
    <button type="button" className="audit-filter-apply" onClick={onApply} disabled={isBusy}>
      {isBusy ? 'Applying…' : 'Apply Filters'}
    </button>
  </div>
);

type FilterInputProps = {
  config: (typeof TEXT_FILTERS)[number];
  value: string;
  onChange: (updates: Partial<AuditFilters>) => void;
};

const FilterInput = ({ config, onChange, value }: FilterInputProps) => (
  <div className="audit-filter-group">
    <label htmlFor={config.id}>{config.label}</label>
    <input
      id={config.id}
      type="text"
      placeholder={config.placeholder}
      value={value}
      onChange={(event) => onChange({ [config.valueKey]: event.target.value })}
    />
  </div>
);

type DateRangeFiltersProps = {
  endDate: string | null;
  startDate: string | null;
  onChange: (updates: Partial<AuditFilters>) => void;
};

const DateRangeFilters = ({ endDate, onChange, startDate }: DateRangeFiltersProps) => (
  <div className="audit-filter-row">
    <label className="audit-filter-group" htmlFor="audit-filter-start">
      Start Date
      <input
        id="audit-filter-start"
        type="date"
        value={startDate ?? ''}
        onChange={(event) => onChange({ startDate: event.target.value || null })}
      />
    </label>
    <label className="audit-filter-group" htmlFor="audit-filter-end">
      End Date
      <input
        id="audit-filter-end"
        type="date"
        value={endDate ?? ''}
        onChange={(event) => onChange({ endDate: event.target.value || null })}
      />
    </label>
  </div>
);

type TemplateFilterProps = {
  onChange: (updates: Partial<AuditFilters>) => void;
  templateId: PromptTemplateId | null;
};

const TemplateFilter = ({ onChange, templateId }: TemplateFilterProps) => (
  <div className="audit-filter-group">
    <label htmlFor="audit-filter-template">Prompt Template</label>
    <select
      id="audit-filter-template"
      value={templateId ?? ''}
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
      {PromptTemplateIds.map((id) => (
        <option key={id} value={id}>
          {PROMPT_TEMPLATE_DESCRIPTORS[id].label}
        </option>
      ))}
    </select>
  </div>
);

type StatusFiltersProps = {
  onChange: (updates: Partial<AuditFilters>) => void;
  selected: AuditReviewStatus[];
};

const StatusFilters = ({ onChange, selected }: StatusFiltersProps) => {
  const toggle = (status: AuditReviewStatus) => {
    const next = selected.includes(status)
      ? selected.filter((entry) => entry !== status)
      : [...selected, status];
    onChange({ status: next });
  };
  return (
    <div className="audit-filter-group">
      <span>Status</span>
      <div className="audit-filter-status-options">
        {Object.entries(STATUS_LABELS).map(([status, label]) => (
          <label key={status} className="audit-filter-checkbox">
            <input
              type="checkbox"
              checked={selected.includes(status as AuditReviewStatus)}
              onChange={() => toggle(status as AuditReviewStatus)}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </div>
  );
};
