import { getWorldKind, type ChronicleActivity, type EntityActivityFeed } from '@glass-frontier/dto';
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import changelogEntries from '../../../data/changelog.json';
import { trpcClient } from '../../../lib/trpcClient';
import { worldAtlasClient } from '../../../lib/worldAtlasClient';
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

const kindLabel = (kind: string): string => getWorldKind(kind)?.displayName ?? kind;

export function LandingPage(): React.JSX.Element {
  const navigate = useNavigate();
  const availableChronicles = useChronicleStore((state) => state.availableChronicles);
  const availableCharacters = useChronicleStore((state) => state.availableCharacters);
  const directoryStatus = useChronicleStore((state) => state.directoryStatus);
  const hydrateChronicle = useChronicleStore((state) => state.hydrateChronicle);
  const refreshDirectory = useChronicleStore((state) => state.refreshPlayerResources);
  const preferredCharacterId = useChronicleStore((state) => state.preferredCharacterId);
  const setPreferredCharacterId = useChronicleStore((state) => state.setPreferredCharacterId);
  const currentChronicleId = useChronicleStore((state) => state.chronicleId);
  const chronicleCharacterId = useChronicleStore((state) => state.character?.id ?? null);
  const openChangelogModal = useUiStore((state) => state.openChangelogModal);
  const [loadingChronicleId, setLoadingChronicleId] = useState<string | null>(null);
  const [chronicleError, setChronicleError] = useState<string | null>(null);
  const [chronicleActivity, setChronicleActivity] = useState<ChronicleActivity[]>([]);
  const [chronicleActivityError, setChronicleActivityError] = useState(false);
  const [entityActivity, setEntityActivity] = useState<EntityActivityFeed | null>(null);
  const [entityActivityError, setEntityActivityError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const activity = await trpcClient.listChronicleActivity.query();
        if (!cancelled) {
          setChronicleActivity(activity);
          setChronicleActivityError(false);
        }
      } catch {
        if (!cancelled) {
          setChronicleActivityError(true);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const activity = await worldAtlasClient.getEntityActivity();
        if (!cancelled) {
          setEntityActivity(activity);
          setEntityActivityError(false);
        }
      } catch {
        if (!cancelled) {
          setEntityActivityError(true);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

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
      .slice(-5)
      .reverse();
  }, []);

  const quickCharacters = useMemo(() => availableCharacters.slice(0, 5), [availableCharacters]);
  const quickChronicles = useMemo(() => availableChronicles.slice(0, 5), [availableChronicles]);
  const hasActiveChronicle = Boolean(currentChronicleId);

  const handleQuickLoad = async (
    chronicleId: string,
    chronicleStatus: 'open' | 'closed'
  ) => {
    if (!chronicleId || chronicleStatus === 'closed') {
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
      <header className="landing-header">
        <div className="landing-header-copy">
          <h1>Welcome back</h1>
          <p className="landing-tagline">
            Pick up a chronicle, ready a character, and see what shipped lately.
          </p>
        </div>
        <span className={`landing-status-chip status-${directoryStatus}`}>{directoryLabel}</span>
      </header>

      <div className="landing-grid">
        <section className="landing-panel landing-chronicle-panel">
          <header className="landing-panel-header">
            <h2>Your characters</h2>
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
                className="landing-link-button landing-link-button-primary"
                onClick={() => void navigate('/character/new')}
              >
                Create new
              </button>
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
                    <div className="landing-row-copy">
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
            <h2>Your chronicles</h2>
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
                className="landing-link-button landing-link-button-primary"
                onClick={() => {
                  void navigate('/chron/start');
                }}
              >
                Start new
              </button>
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
                  <div className="landing-row-copy">
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
                    onClick={() => handleQuickLoad(chronicle.id, chronicle.status)}
                    disabled={chronicle.status === 'closed' || Boolean(loadingChronicleId)}
                  >
                    {chronicle.status === 'closed'
                      ? 'Completed'
                      : loadingChronicleId === chronicle.id
                        ? 'Loading…'
                        : 'Resume'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="landing-panel">
          <header className="landing-panel-header">
            <h2>What&apos;s new</h2>
            <button
              type="button"
              className="landing-link-button"
              onClick={openChangelogModal}
            >
              Full changelog
            </button>
          </header>
          <ul className="landing-feature-list">
            {featureHighlights.map((entry) => (
              <li key={entry.id} className="landing-feature-row">
                <span className="landing-feature-date">{formatDate(entry.releasedAt)}</span>
                <div
                  className="landing-feature-details-wrapper"
                  tabIndex={0}
                  aria-describedby={`feature-tooltip-${entry.id}`}
                >
                  <p className="landing-feature-summary">{entry.summary}</p>
                  <div
                    className="landing-feature-tooltip"
                    role="tooltip"
                    id={`feature-tooltip-${entry.id}`}
                  >
                    {entry.details}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="landing-panel">
          <header className="landing-panel-header">
            <h2>Around the frontier</h2>
          </header>
          {chronicleActivityError ? (
            <p className="landing-error">Chronicle activity is unavailable.</p>
          ) : chronicleActivity.length === 0 ? (
            <p className="landing-empty-copy">
              No chronicle activity yet. Stories from across the frontier will appear here.
            </p>
          ) : (
            <ul className="landing-chronicle-list">
              {chronicleActivity.map((item) => (
                <li key={item.id} className="landing-feed-row">
                  <div className="landing-row-copy">
                    <p className="landing-chronicle-title-row">
                      <span className="landing-chronicle-name">{item.title}</span>
                      <span className="landing-chronicle-state">
                        <span className={`landing-chronicle-status status-${item.status}`}>
                          {item.status === 'open' ? 'Active' : 'Closed'}
                        </span>
                        <span className="landing-chronicle-date">
                          {formatDate(new Date(item.activityAt).toISOString(), {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </span>
                      </span>
                    </p>
                    <p className="landing-chronicle-meta">
                      {item.characterName ?? 'Unknown wanderer'} · {item.locationName}
                    </p>
                    {item.hook !== null ? (
                      <p className="landing-chronicle-hook">{item.hook}</p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="landing-presence-note">
            Live player presence is on the way — coordinate in Discord until the roster ships.
          </p>
        </section>

        <section className="landing-panel">
          <header className="landing-panel-header">
            <h2>New lore</h2>
          </header>
          {entityActivityError ? (
            <p className="landing-error">Recent lore is unavailable.</p>
          ) : entityActivity === null ? (
            <p className="landing-empty-copy">Reading the latest lore…</p>
          ) : entityActivity.loreUpdated.length === 0 ? (
            <p className="landing-empty-copy">No entities have received new lore yet.</p>
          ) : (
            <ul className="landing-entity-list">
              {entityActivity.loreUpdated.map((item) => (
                <li key={item.id} className="landing-feed-row">
                  <p className="landing-entity-title-row">
                    <Link className="landing-entity-name" to={`/atlas/${item.slug}`}>
                      {item.name}
                    </Link>
                    <span className="landing-entity-date">
                      {formatDate(new Date(item.activityAt).toISOString())}
                    </span>
                  </p>
                  <p className="landing-entity-meta">
                    {kindLabel(item.kind)}
                    {item.subkind === null ? '' : ` · ${item.subkind.replace(/_/g, ' ')}`}
                  </p>
                  <p className="landing-entity-update-title">{item.loreTitle}</p>
                  {item.summary === null ? null : (
                    <p className="landing-entity-summary">{item.summary}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="landing-panel">
          <header className="landing-panel-header">
            <h2>New entities</h2>
          </header>
          {entityActivityError ? (
            <p className="landing-error">New entities are unavailable.</p>
          ) : entityActivity === null ? (
            <p className="landing-empty-copy">Reading the latest entities…</p>
          ) : entityActivity.created.length === 0 ? (
            <p className="landing-empty-copy">No entities have entered the world yet.</p>
          ) : (
            <ul className="landing-entity-list">
              {entityActivity.created.map((item) => (
                <li key={item.id} className="landing-feed-row">
                  <p className="landing-entity-title-row">
                    <Link className="landing-entity-name" to={`/atlas/${item.slug}`}>
                      {item.name}
                    </Link>
                    <span className="landing-entity-date">
                      {formatDate(new Date(item.activityAt).toISOString())}
                    </span>
                  </p>
                  <p className="landing-entity-meta">
                    {kindLabel(item.kind)}
                    {item.subkind === null ? '' : ` · ${item.subkind.replace(/_/g, ' ')}`}
                  </p>
                  {item.summary === null ? null : (
                    <p className="landing-entity-summary">{item.summary}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
