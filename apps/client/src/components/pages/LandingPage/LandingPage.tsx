import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import changelogEntries from '../../../data/changelog.json';
import {
  recentChronicleFeed,
} from '../../../data/landingFeed';
import { useChronicleStore } from '../../../stores/chronicleStore';
import { useUiStore } from '../../../stores/uiStore';
import type { ChangelogEntry } from '../../../types/changelog';
import './LandingPage.css';

const formatDate = (value: string, options?: Intl.DateTimeFormatOptions): string => {
  const parsed = Number.isNaN(Date.parse(value)) ? Date.now() : Date.parse(value);
  return new Intl.DateTimeFormat('en-US', options ?? { day: 'numeric', month: 'short' }).format(
    parsed
  );
};

export function LandingPage(): JSX.Element {
  const navigate = useNavigate();
  const availableChronicles = useChronicleStore((state) => state.availableChronicles);
  const availableCharacters = useChronicleStore((state) => state.availableCharacters);
  const directoryStatus = useChronicleStore((state) => state.directoryStatus);
  const hydrateChronicle = useChronicleStore((state) => state.hydrateChronicle);
  const refreshDirectory = useChronicleStore((state) => state.refreshLoginResources);
  const preferredCharacterId = useChronicleStore((state) => state.preferredCharacterId);
  const setPreferredCharacterId = useChronicleStore((state) => state.setPreferredCharacterId);
  const currentChronicleId = useChronicleStore((state) => state.chronicleId);
  const chronicleCharacterId = useChronicleStore((state) => state.character?.id ?? null);
  const openCreateCharacterModal = useUiStore((state) => state.openCreateCharacterModal);
  const [loadingChronicleId, setLoadingChronicleId] = useState<string | null>(null);
  const [chronicleError, setChronicleError] = useState<string | null>(null);

  const characterNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const character of availableCharacters) {
      map.set(character.id, character.name);
    }
    return map;
  }, [availableCharacters]);

  const featureHighlights = useMemo(() => {
    return (changelogEntries as ChangelogEntry[])
      .filter((entry) => entry.type === 'feature')
      .slice(-4)
      .reverse();
  }, []);

  const quickCharacters = useMemo(() => availableCharacters.slice(0, 3), [availableCharacters]);
  const quickChronicles = useMemo(() => availableChronicles.slice(0, 3), [availableChronicles]);
  const hasActiveChronicle = Boolean(currentChronicleId);

  const handleQuickLoad = async (chronicleId: string) => {
    if (!chronicleId) {
      return;
    }
    setChronicleError(null);
    setLoadingChronicleId(chronicleId);
    try {
      await hydrateChronicle(chronicleId);
      void navigate(`/chron/${chronicleId}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to load chronicle. Try again.';
      setChronicleError(message);
    } finally {
      setLoadingChronicleId(null);
    }
  };

  const directoryLabel =
    directoryStatus === 'loading'
      ? 'Syncing…'
      : directoryStatus === 'ready'
        ? 'Ready'
        : directoryStatus === 'error'
          ? 'Error'
          : 'Idle';

  return (
    <div className="landing-page">
      <section className="landing-hero">
        <div className="landing-hero-copy">
          <p className="landing-eyebrow">Welcome back</p>
          <h1>Stay briefed before you dive into your next chronicle.</h1>
          <p className="landing-tagline">
            Here&apos;s what shipped lately, who wrapped their runs, and the signals coming from the
            broader Glass Frontier network.
          </p>
        </div>
        <div className="landing-feature-grid">
          {featureHighlights.map((entry) => (
            <article key={entry.id} className="landing-feature-card">
              <p className="landing-feature-date">{formatDate(entry.releasedAt)}</p>
              <h3>{entry.summary}</h3>
              <div
                className="landing-feature-details-wrapper"
                tabIndex={0}
                aria-describedby={`feature-tooltip-${entry.id}`}
              >
                <p className="landing-feature-details">{entry.details}</p>
                <div
                  className="landing-feature-tooltip"
                  role="tooltip"
                  id={`feature-tooltip-${entry.id}`}
                >
                  {entry.details}
                </div>
              </div>
              <span className="landing-feature-pill">Feature</span>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-panel landing-chronicle-panel">
        <header className="landing-panel-header">
          <div>
            <p className="landing-eyebrow">Roster</p>
            <h2>Your characters</h2>
          </div>
          <div className="landing-chronicle-header-meta">
            <span className={`landing-status-chip status-${directoryStatus}`}>{directoryLabel}</span>
            <div className="landing-chronicle-actions">
              <button
                type="button"
                className="landing-link-button"
                onClick={() => {
                  void refreshDirectory().catch(() => undefined);
                }}
                disabled={directoryStatus === 'loading'}
              >
                {directoryStatus === 'loading' ? 'Refreshing…' : 'Refresh'}
              </button>
              <button
                type="button"
                className="landing-link-button"
                onClick={openCreateCharacterModal}
              >
                Create new
              </button>
            </div>
          </div>
        </header>
        {quickCharacters.length === 0 ? (
          <p className="landing-empty-copy">
            No characters yet. Use <strong>Create new</strong> to draft your first profile.
          </p>
        ) : (
          <ul className="landing-my-characters">
            {quickCharacters.map((character) => {
              const isChronicleCharacter = chronicleCharacterId === character.id;
              const isPreferred = preferredCharacterId === character.id;
              const isLocked = hasActiveChronicle && !isChronicleCharacter;
              const buttonLabel = isLocked
                ? 'Locked'
                : isChronicleCharacter
                  ? 'Active'
                  : isPreferred
                    ? 'Selected'
                    : 'Select';
              return (
                <li key={character.id}>
                  <div>
                    <p className="landing-my-character-title">{character.name}</p>
                    <p className="landing-my-character-meta">
                      {character.archetype} · {character.pronouns}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="landing-link-button"
                    onClick={() => setPreferredCharacterId(character.id)}
                    disabled={isLocked || isPreferred || directoryStatus === 'loading'}
                  >
                    {buttonLabel}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="landing-panel landing-chronicle-panel">
        <header className="landing-panel-header">
          <div>
            <p className="landing-eyebrow">Continue</p>
            <h2>Your chronicles</h2>
          </div>
          <div className="landing-chronicle-header-meta">
            <span className={`landing-status-chip status-${directoryStatus}`}>{directoryLabel}</span>
            <div className="landing-chronicle-actions">
              <button
                type="button"
                className="landing-link-button"
                onClick={() => {
                  void refreshDirectory().catch(() => undefined);
                }}
                disabled={directoryStatus === 'loading'}
              >
                {directoryStatus === 'loading' ? 'Refreshing…' : 'Refresh'}
              </button>
              <button
                type="button"
                className="landing-link-button"
                onClick={() => {
                  void navigate('/chronicles/start');
                }}
              >
                Start new
              </button>
            </div>
          </div>
        </header>
        {chronicleError ? <p className="landing-error">{chronicleError}</p> : null}
        {quickChronicles.length === 0 ? (
          <p className="landing-empty-copy">
            No chronicles yet. Use <strong>Start new</strong> to launch a fresh run.
          </p>
        ) : (
          <ul className="landing-my-chronicles">
            {quickChronicles.map((chronicle) => (
              <li key={chronicle.id}>
                <div>
                  <p className="landing-my-chronicle-title">{chronicle.title}</p>
                  <p className="landing-my-chronicle-meta">
                    {chronicle.status === 'closed' ? 'Completed' : 'In progress'} ·{' '}
                    {chronicle.characterId
                      ? characterNameById.get(chronicle.characterId) ?? 'Unassigned'
                      : 'Unassigned'}
                  </p>
                </div>
                <button
                  type="button"
                  className="landing-link-button"
                  onClick={() => handleQuickLoad(chronicle.id)}
                  disabled={Boolean(loadingChronicleId)}
                >
                  {loadingChronicleId === chronicle.id ? 'Loading…' : 'Resume'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="landing-split-grid">
        <section className="landing-panel">
          <header className="landing-panel-header">
            <div>
              <p className="landing-eyebrow">Chronicles</p>
              <h2>Recently completed</h2>
            </div>
            <div className="landing-panel-header-note">
              <p className="landing-coming-soon">In development</p>
              <p>Signals gathered from global runs.</p>
            </div>
          </header>
          <ul className="landing-chronicle-list">
            {recentChronicleFeed.map((item) => (
              <li key={item.id}>
                <div>
                  <p className="landing-chronicle-date">
                    Completed · {formatDate(item.completedAt, { day: 'numeric', month: 'short' })}
                  </p>
                  <h3>{item.title}</h3>
                  <p className="landing-chronicle-meta">{item.location}</p>
                  <p className="landing-chronicle-character">Character: {item.character}</p>
                  <p className="landing-chronicle-hook">{item.hook}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="landing-panel">
          <header className="landing-panel-header">
            <div>
              <p className="landing-eyebrow">Presence</p>
              <h2>Online players</h2>
            </div>
            <p className="landing-coming-soon">In development</p>
          </header>
          <div className="landing-placeholder">
            <p>
              A live roster of ready players will appear here once the presence service ships. For
              now, coordinate with your GM in Discord or ping a moderator to sync up.
            </p>
            <button type="button" disabled className="landing-disabled-button">
              Realtime roster coming soon
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
