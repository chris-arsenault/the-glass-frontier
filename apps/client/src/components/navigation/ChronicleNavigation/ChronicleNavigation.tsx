import React from 'react';

import { useChronicleStore } from '../../../stores/chronicleStore';
import { useUiStore } from '../../../stores/uiStore';
import { ContextReferenceBrowser } from '../../encyclopedia/ContextReferenceBrowser';
import { AvailableEntitiesPanel } from '../../entities/AvailableEntitiesPanel/AvailableEntitiesPanel';
import './ChronicleNavigation.css';

export function ChronicleNavigation(): React.JSX.Element {
  const chronicle = useChronicleStore((state) => state.chronicleRecord);
  const character = useChronicleStore((state) => state.character);
  const threads = useChronicleStore((state) => state.threads);
  const focusedThreadId = useChronicleStore((state) => state.focusedThreadId);
  const locationName = useChronicleStore((state) => state.locationName);
  const isCharacterDrawerOpen = useUiStore((state) => state.isCharacterDrawerOpen);
  const isChronicleDrawerOpen = useUiStore((state) => state.isChronicleDrawerOpen);
  const toggleCharacterDrawer = useUiStore((state) => state.toggleCharacterDrawer);
  const toggleChronicleDrawer = useUiStore((state) => state.toggleChronicleDrawer);
  const playerThreads = threads.filter((thread) => thread.perspective === 'player');

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

      <section className="chronicle-navigation-section" aria-labelledby="chronicle-threads-title">
        <h2 id="chronicle-threads-title">Player threads</h2>
        {playerThreads.length === 0 ? (
          <p className="chronicle-navigation-empty">No long-horizon goal is recorded.</p>
        ) : (
          <ul className="chronicle-thread-list">
            {playerThreads.map((thread) => (
              <li
                key={thread.id}
                className={`chronicle-thread${thread.id === focusedThreadId ? ' is-focused' : ''}`}
                tabIndex={0}
              >
                <div className="chronicle-thread-heading">
                  <span className="chronicle-thread-title">{thread.title}</span>
                  {thread.id === focusedThreadId ? (
                    <span className="chronicle-thread-status">Focused</span>
                  ) : null}
                </div>
                <div className="chronicle-thread-detail" role="note" aria-hidden="true">
                  <p>{thread.goal}</p>
                  <p>{thread.position}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AvailableEntitiesPanel />
      <ContextReferenceBrowser attachable locationName={locationName} />
    </nav>
  );
}
