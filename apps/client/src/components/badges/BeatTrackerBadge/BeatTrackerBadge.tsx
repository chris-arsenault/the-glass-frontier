import type { BeatTracker } from '@glass-frontier/dto';
import React from 'react';

import { describeBeatTrackerEffect } from '../beatTrackerPresentation';
import './BeatTrackerBadge.css';

type BeatTrackerBadgeProps = {
  beatLookup: Map<string, string>;
  tracker: BeatTracker;
};

const formatStatus = (status?: BeatTracker['updates'][number]['status']): string | null => {
  if (status === null || status === undefined) {
    return null;
  }
  if (status === 'succeeded') {
    return 'Succeeded';
  }
  if (status === 'failed') {
    return 'Failed';
  }
  if (status === 'superseded') {
    return 'Superseded';
  }
  if (status === 'abandoned') {
    return 'Abandoned';
  }
  return 'In Progress';
};

export function BeatTrackerBadge({ beatLookup, tracker }: BeatTrackerBadgeProps): React.JSX.Element | null {
  const effectLabel = describeBeatTrackerEffect(tracker) ?? 'Beat Update';
  const focusName = tracker.focusBeatId === null
    ? 'Independent'
    : beatLookup.get(tracker.focusBeatId) ?? tracker.focusBeatId;
  const updates = tracker.updates;
  const hasDetails = tracker.newBeat !== null
    || updates.length > 0
    || tracker.focusBeatId !== null;

  if (!hasDetails) {
    return null;
  }

  return (
    <div className="beat-tracker-badge" tabIndex={0} aria-label={`Beat tracker changes: ${effectLabel}`}>
      <span className="badge-icon" aria-hidden="true">
        ⚑
      </span>
      <span className="beat-tracker-label">{effectLabel}</span>
      <div className="beat-tracker-tooltip" role="presentation">
        <p className="beat-tracker-title">Beat Updates</p>
        <p className="beat-tracker-focus">Focus · {focusName}</p>
        {tracker.newBeat !== null ? (
          <div className="beat-tracker-new">
            <p className="beat-tracker-new-title">{tracker.newBeat.title}</p>
            <p className="beat-tracker-new-description">{tracker.newBeat.description}</p>
          </div>
        ) : null}
        {updates.length > 0 ? (
          <ul className="beat-tracker-update-list">
            {updates.map((update, index) => {
              const title = beatLookup.get(update.beatId) ?? update.beatId;
              const statusLabel = formatStatus(update.status);
              return (
                <li key={`${update.beatId}-${index}`} className="beat-tracker-update">
                  <div className="beat-tracker-update-heading">
                    <span className="beat-tracker-update-title">{title}</span>
                    <span className={`beat-tracker-update-kind beat-tracker-update-kind-${update.changeKind}`}>
                      {update.changeKind === 'advance' ? 'Advanced' : 'Resolved'}
                    </span>
                    {statusLabel === null
                      ? null
                      : <span className="beat-tracker-update-status">{statusLabel}</span>}
                  </div>
                  {update.description === null || update.description === undefined ? null : (
                    <p className="beat-tracker-update-description">{update.description}</p>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
