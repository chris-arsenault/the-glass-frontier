import type { EncyclopediaEntrySummary, PlayerEncyclopediaEntry } from '@glass-frontier/dto';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { useNavigate, useParams } from 'react-router-dom';
import remarkGfm from 'remark-gfm';

import { worldAtlasClient } from '../../lib/worldAtlasClient';
import { AtlasLink } from '../atlas/AtlasLink';
import './WorldEncyclopediaPage.css';

type EncyclopediaDetail = {
  classifications: Array<{
    atlasSlug: string;
    atlasTitle: string;
    role: 'type' | 'membership';
  }>;
  entry: PlayerEncyclopediaEntry;
};

const label = (value: string): string =>
  value.replaceAll('_', ' ').replace(/\b\w/gu, (letter) => letter.toUpperCase());

type WorldEncyclopediaViewProps = {
  onSelect: (qualifiedSlug: string) => void;
  slug?: string;
};

export function WorldEncyclopediaView({
  onSelect,
  slug,
}: WorldEncyclopediaViewProps): React.JSX.Element {
  return slug === undefined
    ? <EncyclopediaIndex onSelect={onSelect} />
    : <EncyclopediaDetailView key={slug} slug={slug} />;
}

export function WorldEncyclopediaPage(): React.JSX.Element {
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();
  const openSlug = useCallback(
    (qualifiedSlug: string) => {
      const bareSlug = qualifiedSlug.replace(/^encyclopedia:/u, '');
      void navigate(`/encyclopedia/${encodeURIComponent(bareSlug)}`);
    },
    [navigate]
  );
  return <WorldEncyclopediaView slug={slug} onSelect={openSlug} />;
}

function EncyclopediaIndex({
  onSelect,
}: {
  onSelect: (qualifiedSlug: string) => void;
}): React.JSX.Element {
  const [entries, setEntries] = useState<EncyclopediaEntrySummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [kind, setKind] = useState('');
  const [prevalence, setPrevalence] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let active = true;
    void worldAtlasClient.listEncyclopediaEntries().then(
      (result) => {
        if (active) {
          setEntries(result);
          setError(null);
          setIsLoading(false);
        }
        return undefined;
      },
      (reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : 'Failed to load the Encyclopedia.');
          setIsLoading(false);
        }
        return undefined;
      }
    );
    return () => {
      active = false;
    };
  }, []);

  const kinds = useMemo(
    () => [...new Set(entries.map((entry) => entry.kind))].sort(),
    [entries]
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return entries.filter((entry) =>
      (kind.length === 0 || entry.kind === kind)
      && (prevalence.length === 0 || entry.prevalence === prevalence)
      && (needle.length === 0
        || `${entry.title} ${entry.summary} ${entry.subkind} ${entry.topics.join(' ')}`
          .toLocaleLowerCase()
          .includes(needle))
    );
  }, [entries, kind, prevalence, query]);

  return (
    <div className="encyclopedia-page">
      <header className="encyclopedia-header">
        <div>
          <h1>Encyclopedia</h1>
          <p>Known creatures, materials, practices, vessels, technologies, and cultures.</p>
        </div>
      </header>
      <div className="encyclopedia-filters" role="search">
        <input
          aria-label="Search Encyclopedia"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search the Encyclopedia"
          type="search"
          value={query}
        />
        <select aria-label="Filter by kind" onChange={(event) => setKind(event.target.value)} value={kind}>
          <option value="">All kinds</option>
          {kinds.map((item) => <option key={item} value={item}>{label(item)}</option>)}
        </select>
        <select
          aria-label="Filter by rarity"
          onChange={(event) => setPrevalence(event.target.value)}
          value={prevalence}
        >
          <option value="">All rarities</option>
          <option value="common">Common</option>
          <option value="uncommon">Uncommon</option>
          <option value="rare">Rare</option>
        </select>
      </div>
      {error ? <p className="encyclopedia-alert" role="alert">{error}</p> : null}
      {isLoading ? <p className="encyclopedia-empty">Reading the shelves…</p> : null}
      {!isLoading && filtered.length === 0 ? (
        <p className="encyclopedia-empty">
          Nothing recorded under those terms. The Encyclopedia is not exhaustive.
        </p>
      ) : null}
      <div className="encyclopedia-card-grid">
        {filtered.map((entry) => (
          <button key={entry.slug} type="button" onClick={() => onSelect(entry.slug)}>
            <span className="encyclopedia-card-heading">
              <strong>{entry.title}</strong>
              {entry.status === 'draft' ? <span>Draft</span> : null}
            </span>
            <span className="encyclopedia-card-meta">
              {label(entry.kind)} · {label(entry.subkind)} · {label(entry.prevalence)}
            </span>
            <span className="encyclopedia-card-summary">{entry.summary}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function EncyclopediaDetailView({ slug }: { slug: string }): React.JSX.Element {
  const [detail, setDetail] = useState<EncyclopediaDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void worldAtlasClient.getEncyclopediaEntry(slug).then(
      (result) => {
        if (active) {
          setDetail(result);
          setError(null);
        }
        return undefined;
      },
      (reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : 'Failed to load the entry.');
        }
        return undefined;
      }
    );
    return () => {
      active = false;
    };
  }, [slug]);

  if (detail === null) {
    return <div className="encyclopedia-empty">{error ?? 'Loading…'}</div>;
  }
  const { entry } = detail;
  const facts = Object.entries(entry.facts);
  const identity = Object.entries(entry.descriptiveIdentity);
  const associations = [
    ...entry.instances.map((record) => ({ ...record, role: 'instance' })),
    ...entry.members.map((record) => ({ ...record, role: 'member' })),
  ];

  return (
    <article className="encyclopedia-page encyclopedia-entry">
      <header className="encyclopedia-entry-header">
        <div>
          <p className="encyclopedia-overline">Encyclopedia</p>
          <h1>{entry.title}</h1>
          <div className="encyclopedia-chip-row">
            <span>{label(entry.kind)}</span>
            <span>{label(entry.subkind)}</span>
            {entry.prevalence ? <span>{label(entry.prevalence)}</span> : null}
            {entry.status === 'draft' ? <span>Draft</span> : null}
          </div>
        </div>
      </header>
      {entry.summary ? <p className="encyclopedia-lead">{entry.summary}</p> : null}
      {entry.topics.length > 0 ? (
        <div className="encyclopedia-topics">
          {entry.topics.map((topic) => <span key={topic}>{label(topic)}</span>)}
        </div>
      ) : null}
      {facts.length > 0 ? (
        <dl className="encyclopedia-facts">
          {facts.map(([key, value]) => (
            <div key={key}><dt>{label(key)}</dt><dd>{String(value)}</dd></div>
          ))}
        </dl>
      ) : null}
      {identity.length > 0 ? (
        <section className="encyclopedia-section">
          <h2>Recognizing it</h2>
          <dl className="encyclopedia-identity">
            {identity.map(([key, value]) => (
              <div key={key}><dt>{label(key)}</dt><dd>{value}</dd></div>
            ))}
          </dl>
        </section>
      ) : null}
      {entry.tiers.length > 0 ? (
        <section className="encyclopedia-section">
          <h2>Tiers</h2>
          <dl className="encyclopedia-identity">
            {entry.tiers.map((tier) => (
              <div key={tier.tier}>
                <dt>{tier.tier}</dt>
                <dd>{tier.effect}{tier.cost ? ` Cost: ${tier.cost}` : ''}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
      {entry.sections.map((section) => (
        <section className="encyclopedia-section" key={section.heading}>
          <h2>{section.heading}</h2>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{section.text}</ReactMarkdown>
        </section>
      ))}
      {associations.length > 0 ? (
        <section className="encyclopedia-section">
          <h2>Named examples</h2>
          <ul className="encyclopedia-associations">
            {associations.map((record) => (
              <li key={`${record.role}:${record.slug}`}>
                <AtlasLink slug={record.slug.replace(/^atlas:/u, '')}>{record.title}</AtlasLink>
                <span>{record.role}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
