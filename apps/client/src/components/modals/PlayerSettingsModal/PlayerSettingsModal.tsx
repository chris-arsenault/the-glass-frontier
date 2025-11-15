import React, { useMemo } from 'react';

import type { PlayerSettings } from '../../../state/chronicleState';
import { useChronicleStore } from '../../../stores/chronicleStore';
import { useUiStore } from '../../../stores/uiStore';
import '../shared/modalBase.css';
import './PlayerSettingsModal.css';

const VISIBILITY_LEVELS: Array<{
  description: string;
  label: string;
  value: PlayerSettings['feedbackVisibility'];
}> = [
  {
    description: 'Hide every system tag, badge, and GM pipeline trace from the chat.',
    label: 'None',
    value: 'none',
  },
  {
    description: 'Show only skill check and inventory change badges on GM replies.',
    label: 'Badges',
    value: 'badges',
  },
  {
    description:
      'Reveal tone detections, creative spark markers, and beat tags on player turns in addition to badges.',
    label: 'Narrative',
    value: 'narrative',
  },
  {
    description:
      'Display every internal signal: badges, tone cues, timeline markers, world deltas, and pipeline traces.',
    label: 'All',
    value: 'all',
  },
];

const levelIndex = (value: PlayerSettings['feedbackVisibility']) =>
  Math.max(
    0,
    VISIBILITY_LEVELS.findIndex((entry) => entry.value === value)
  );

export function PlayerSettingsModal(): JSX.Element | null {
  const isOpen = useUiStore((state) => state.isPlayerSettingsModalOpen);
  const close = useUiStore((state) => state.closePlayerSettingsModal);
  const playerSettings = useChronicleStore((state) => state.playerSettings);
  const playerSettingsStatus = useChronicleStore((state) => state.playerSettingsStatus);
  const isSaving = useChronicleStore((state) => state.isUpdatingPlayerSettings);
  const playerSettingsError = useChronicleStore((state) => state.playerSettingsError);
  const updatePlayerSettings = useChronicleStore((state) => state.updatePlayerSettings);
  const sliderValue = levelIndex(playerSettings.feedbackVisibility);
  const currentLevel = useMemo(
    () => VISIBILITY_LEVELS[sliderValue] ?? VISIBILITY_LEVELS[0],
    [sliderValue]
  );

  if (!isOpen) {
    return null;
  }

  const handleChange = (nextIndex: number) => {
    if (!Number.isFinite(nextIndex)) {
      return;
    }
    const clamped = Math.min(Math.max(nextIndex, 0), VISIBILITY_LEVELS.length - 1);
    const nextLevel = VISIBILITY_LEVELS[clamped];
    if (nextLevel.value !== playerSettings.feedbackVisibility) {
      void updatePlayerSettings({ feedbackVisibility: nextLevel.value }).catch(() => {
        // error state handled via store
      });
    }
  };

  return (
    <>
      <div className="modal-backdrop open" onClick={close} aria-hidden="true" />
      <div className="modal open player-settings-modal" role="dialog" aria-modal="true" aria-label="Player settings">
        <header className="modal-header">
          <div className="modal-header-title">
            <p className="modal-overline">Player Settings</p>
            <h2>Game Internals Feedback</h2>
          </div>
          <button type="button" className="modal-close" onClick={close} aria-label="Close player settings">
            ×
          </button>
        </header>
        <div className="modal-body player-settings-body">
          <p className="player-settings-description">
            Choose how much system metadata appears inside the chat transcript. This only affects your account.
          </p>
          <div className="player-settings-slider-row">
            <input
              type="range"
              min={0}
              max={VISIBILITY_LEVELS.length - 1}
              step={1}
              value={sliderValue}
              onChange={(event) => handleChange(Number(event.target.value))}
              className="player-settings-slider"
              aria-label="Game internals visibility"
            />
            <div className="player-settings-slider-labels">
              {VISIBILITY_LEVELS.map((level) => (
                <span key={level.value}>{level.label}</span>
              ))}
            </div>
          </div>
          <div className="player-settings-level">
            <h3>{currentLevel.label}</h3>
            <p>{currentLevel.description}</p>
          </div>
          {playerSettingsStatus === 'loading' ? (
            <p className="player-settings-status">Loading preferences…</p>
          ) : null}
          {isSaving ? <p className="player-settings-status">Saving…</p> : null}
          {playerSettingsError ? (
            <p className="player-settings-error" role="alert">
              {playerSettingsError.message}
            </p>
          ) : null}
          <button type="button" className="player-settings-close" onClick={close}>
            Close
          </button>
        </div>
      </div>
    </>
  );
}
