import { getWorldKind, type ChronicleActivity, type EntityActivityFeed } from '@glass-frontier/dto';
import React, { useEffect, useMemo, useState } from 'react';

import changelogEntries from '../../../data/changelog.json';
import { trpcClient } from '../../../lib/trpcClient';
import { worldAtlasClient } from '../../../lib/worldAtlasClient';
import { useUiStore } from '../../../stores/uiStore';
import type { ChangelogEntry } from '../../../types/changelog';
import { AtlasLink } from '../../atlas/AtlasLink';
import './LandingPage.css';

const formatDate = (value: string, options?: Intl.DateTimeFormatOptions): string => {
  const parsed = Number.isNaN(Date.parse(value)) ? Date.now() : Date.parse(value);
  return new Intl.DateTimeFormat('en-US', options ?? { day: 'numeric', month: 'short' }).format(
    parsed
  );
};

const kindLabel = (kind: string): string => getWorldKind(kind)?.displayName ?? kind;

export function LandingPage(): React.JSX.Element {
  const openChangelogModal = useUiStore((state) => state.openChangelogModal);
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

  const featureHighlights = useMemo(() => {
    return (changelogEntries as ChangelogEntry[])
      .filter((entry) => entry.type === 'feature')
      .slice(-5)
      .reverse();
  }, []);

  return (
    <div className="landing-page">
      <header className="landing-header">
        <div className="landing-header-copy">
          <h1>Welcome back</h1>
          <p className="landing-tagline">
            See what has changed across the frontier and what shipped lately.
          </p>
        </div>
      </header>

      <div className="landing-grid">
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
                    <AtlasLink className="landing-entity-name" slug={item.slug}>
                      {item.name}
                    </AtlasLink>
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
                    <AtlasLink className="landing-entity-name" slug={item.slug}>
                      {item.name}
                    </AtlasLink>
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
