import type { ChronicleBeat } from '@glass-frontier/dto';
import React from 'react';

import { useChronicleStore } from '../../../stores/chronicleStore';
import { useUiStore } from '../../../stores/uiStore';
import { AvailableEntitiesPanel } from '../../entities/AvailableEntitiesPanel/AvailableEntitiesPanel';
import './ChronicleNavigation.css';

const formatBeatStatus = (status: ChronicleBeat['status']): string => {
  switch (status) {
  case 'succeeded':
    return 'Succeeded';
  case 'failed':
    return 'Failed';
  case 'superseded':
    return 'Superseded';
  case 'abandoned':
    return 'Abandoned';
  default:
    return 'In progress';
  }
};

export function ChronicleNavigation(): React.JSX.Element {
  const chronicle = useChronicleStore((state) => state.chronicleRecord);
  const character = useChronicleStore((state) => state.character);
  const beats = useChronicleStore((state) => state.beats);
  const focusedBeatId = useChronicleStore((state) => state.focusedBeatId);
  const isCharacterDrawerOpen = useUiStore((state) => state.isCharacterDrawerOpen);
  const isChronicleDrawerOpen = useUiStore((state) => state.isChronicleDrawerOpen);
  const toggleCharacterDrawer = useUiStore((state) => state.toggleCharacterDrawer);
  const toggleChronicleDrawer = useUiStore((state) => state.toggleChronicleDrawer);

  return (
    <nav className="chronicle-navigation" aria-label="Chronicle">
      <header className="chronicle-navigation-header">
        <p className="chronicle-navigation-eyebrow">Chronicle</p>
        <p className="chronicle-navigation-title">{chronicle?.title ?? 'Loading…'}</p>
        <div className="chronicle-navigation-controls">
          {character === null || character === undefined ? null : (
            <button
              type="button"
              className={isCharacterDrawerOpen ? 'is-active' : undefined}
              aria-pressed={isCharacterDrawerOpen}
              onClick={toggleCharacterDrawer}
            >
              {character.name}
            </button>
          )}
          <button
            type="button"
            className={isChronicleDrawerOpen ? 'is-active' : undefined}
            aria-pressed={isChronicleDrawerOpen}
            onClick={toggleChronicleDrawer}
            disabled={chronicle === null}
          >
            Details
          </button>
        </div>
      </header>

      <section className="chronicle-navigation-section" aria-labelledby="chronicle-beats-title">
        <h2 id="chronicle-beats-title">Beats</h2>
        {beats.length === 0 ? (
          <p className="chronicle-navigation-empty">
            No beats yet — the story&apos;s goals appear here.
          </p>
        ) : (
          <ul className="chronicle-beat-list">
            {beats.map((beat) => (
              <li
                key={beat.id}
                className={`chronicle-beat${beat.id === focusedBeatId ? ' is-focused' : ''}`}
                data-status={beat.status}
                tabIndex={0}
              >
                <div className="chronicle-beat-heading">
                  <span className="chronicle-beat-title">{beat.title}</span>
                  <span className="chronicle-beat-status">{formatBeatStatus(beat.status)}</span>
                </div>
                <div className="chronicle-beat-detail" role="note" aria-hidden="true">
                  <p>{beat.description}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AvailableEntitiesPanel />
    </nav>
  );
}
