import { useMemo, useState } from 'react';

import changelogEntries from '../data/changelog.json';
import { useUiStore } from '../stores/uiStore';
import type { ChangelogEntry, ChangelogEntryType } from '../types/changelog';

const ENTRY_TYPE_LABELS: Record<ChangelogEntryType, string> = {
  bugfix: 'Bug Fix',
  feature: 'Feature',
  improvement: 'Improvement',
};

const formatDate = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

export function ChangelogModal(): JSX.Element | null {
  const isOpen = useUiStore((state) => state.isChangelogModalOpen);
  const close = useUiStore((state) => state.closeChangelogModal);
  const [showAll, setShowAll] = useState(false);

  const entries = useMemo(
    () => {
      const parsed = (changelogEntries as ChangelogEntry[]).slice();
      const filtered = showAll ? parsed : parsed.filter((entry) => entry.type === 'feature');
      return filtered
        .slice()
        .sort((a, b) => (a.releasedAt > b.releasedAt ? -1 : a.releasedAt < b.releasedAt ? 1 : 0));
    },
    [showAll]
  );

  if (!isOpen) {
    return null;
  }

  return (
    <>
      <div className="modal-backdrop open" onClick={close} aria-hidden="true" />
      <div className="modal open changelog-modal" role="dialog" aria-modal="true" aria-label="App changelog">
        <header className="modal-header">
          <div className="modal-header-title">
            <p className="modal-overline">Release Notes</p>
            <h2>What&apos;s New</h2>
          </div>
          <label className="changelog-toggle">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(event) => setShowAll(event.target.checked)}
              aria-label="Show all change types"
            />
            <span>Show all</span>
          </label>
          <button type="button" className="modal-close" onClick={close} aria-label="Close changelog dialog">
            ×
          </button>
        </header>
        <div className="modal-body changelog-body">
          {entries.length === 0 ? (
            <p className="changelog-empty">No changes recorded yet.</p>
          ) : (
            <ul className="changelog-list">
              {entries.map((entry) => (
                <li key={entry.id} className="changelog-entry" tabIndex={0}>
                  <div className="changelog-entry-main">
                    <span className={`changelog-entry-type changelog-entry-type-${entry.type}`}>
                      {ENTRY_TYPE_LABELS[entry.type]}
                    </span>
                    <div className="changelog-entry-content">
                      <p className="changelog-entry-summary" title={entry.details}>
                        {entry.summary}
                      </p>
                      <dl className="changelog-entry-meta">
                        <dt>Released</dt>
                        <dd>{formatDate(entry.releasedAt)}</dd>
                      </dl>
                    </div>
                  </div>
                  <p className="changelog-entry-details" aria-hidden="true">
                    {entry.details}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
