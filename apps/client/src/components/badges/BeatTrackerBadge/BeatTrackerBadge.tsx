import type { BeatTracker } from '@glass-frontier/dto';
import React from 'react';

import './BeatTrackerBadge.css';

const EFFECT_LABELS: Record<BeatTracker['turnEffect'], string> = {
  advance_and_spawn: 'Advanced & Spawned',
  advance_existing: 'Advanced Beat',
  no_change: 'No Beat Change',
  resolve_and_spawn: 'Resolved & Spawned',
  resolve_existing: 'Resolved Beat',
  spawn_new: 'Spawned Beat',
};

type BeatTrackerBadgeProps = {
  beatLookup: Map<string, string>;
  tracker: BeatTracker;
};

const formatStatus = (status?: BeatTracker['updates'][number]['status']): string | null => {
  if (!status) {
    return null;
  }
  if (status === 'succeeded') {
    return 'Succeeded';
  }
  if (status === 'failed') {
    return 'Failed';
  }
  return 'In Progress';
};

export function BeatTrackerBadge({ beatLookup, tracker }: BeatTrackerBadgeProps): JSX.Element | null {
  if (!tracker) {
    return null;
  }
  const effectLabel = EFFECT_LABELS[tracker.turnEffect] ?? 'Beat Update';
  const focusName = tracker.focusBeatId ? beatLookup.get(tracker.focusBeatId) ?? tracker.focusBeatId : 'Independent';
  const updates = tracker.updates ?? [];
  const hasDetails = Boolean(tracker.newBeat || updates.length > 0 || tracker.focusBeatId);

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
        {tracker.newBeat ? (
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
                    {statusLabel ? <span className="beat-tracker-update-status">{statusLabel}</span> : null}
                  </div>
                  {update.description ? (
                    <p className="beat-tracker-update-description">{update.description}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
