import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import changelogEntries from '../../../data/changelog.json';
import {
  landingNews,
  recentChronicleFeed,
  systemsUpdates,
  updateSnippets,
} from '../../../data/landingFeed';
import { useChronicleStore } from '../../../stores/chronicleStore';
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
      .slice(-3)
      .reverse();
  }, []);

  const recentOtherUpdates = useMemo(() => {
    return (changelogEntries as ChangelogEntry[])
      .filter((entry) => entry.type !== 'feature')
      .slice(-3)
      .reverse();
  }, []);

  const quickChronicles = useMemo(() => availableChronicles.slice(0, 3), [availableChronicles]);

  const handleQuickLoad = async (chronicleId: string) => {
    if (!chronicleId) {
      return;
    }
    setChronicleError(null);
    setLoadingChronicleId(chronicleId);
    try {
      await hydrateChronicle(chronicleId);
      void navigate(`/chronicle/${chronicleId}`);
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
              <p>{entry.details}</p>
              <span className="landing-feature-pill">Feature</span>
            </article>
          ))}
        </div>
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

      <section className="landing-panel landing-news">
        <header className="landing-panel-header">
          <div>
            <p className="landing-eyebrow">News</p>
            <h2>Latest dispatches</h2>
          </div>
          <p>Pulse checks from the Chronicle network.</p>
        </header>
        <ul className="landing-news-list">
          {landingNews.map((item) => (
            <li key={item.id}>
              <p className="landing-news-meta">
                <span>{item.category}</span>
                <span>{formatDate(item.publishedAt, { day: 'numeric', month: 'short' })}</span>
              </p>
              <h3>{item.headline}</h3>
              <p>{item.summary}</p>
            </li>
          ))}
        </ul>
      </section>

      <div className="landing-split-grid">
        <section className="landing-panel">
          <header className="landing-panel-header">
            <div>
              <p className="landing-eyebrow">Chronicles</p>
              <h2>Recently completed</h2>
            </div>
            <p>Signals gathered from global runs.</p>
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

      <section className="landing-panel">
        <header className="landing-panel-header">
          <div>
            <p className="landing-eyebrow">Systems</p>
            <h2>Roadmap snapshots</h2>
          </div>
        </header>
        <div className="landing-status-grid">
          {systemsUpdates.map((item) => (
            <article key={item.id} className="landing-status-card">
              <p className="landing-status-meta">
                <span>{item.status.replace('-', ' ')}</span>
                <span>{formatDate(item.updatedAt)}</span>
              </p>
              <h3>{item.label}</h3>
              <p>{item.summary}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="landing-split-grid">
        <section className="landing-panel">
          <header className="landing-panel-header">
            <div>
              <p className="landing-eyebrow">Updates</p>
              <h2>Improvements & fixes</h2>
            </div>
          </header>
          <ul className="landing-update-list">
            {recentOtherUpdates.map((entry) => (
              <li key={entry.id}>
                <p className="landing-update-date">{formatDate(entry.releasedAt)}</p>
                <div>
                  <h3>{entry.summary}</h3>
                  <p>{entry.details}</p>
                  <span className={`landing-update-pill landing-update-pill-${entry.type}`}>
                    {entry.type}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="landing-panel">
          <header className="landing-panel-header">
            <div>
              <p className="landing-eyebrow">Signals</p>
              <h2>Update stream</h2>
            </div>
          </header>
          <ul className="landing-snippet-list">
            {updateSnippets.map((snippet) => (
              <li key={snippet.id}>
                <p className="landing-snippet-meta">
                  <span>{snippet.tag}</span>
                  <span>{formatDate(snippet.updatedAt)}</span>
                </p>
                <h3>{snippet.title}</h3>
                <p>{snippet.description}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
