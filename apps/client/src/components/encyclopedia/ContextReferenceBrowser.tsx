import type { EncyclopediaEntrySummary } from '@glass-frontier/dto';
import React, { useEffect, useMemo, useState } from 'react';

import { worldAtlasClient } from '../../lib/worldAtlasClient';
import { WorldReferenceButton } from './WorldReferenceButton';
import './ContextReferenceBrowser.css';

type ContextReferenceBrowserProps = {
  attachable?: boolean;
  locationId?: string | null;
  locationName?: string | null;
};

const PREVALENCE_ORDER = ['common', 'uncommon', 'rare'] as const;

const label = (value: string): string =>
  value.replaceAll('_', ' ').replace(/\b\w/gu, (letter) => letter.toUpperCase());

export function ContextReferenceBrowser({
  attachable = false,
  locationId = null,
  locationName = null,
}: ContextReferenceBrowserProps): React.JSX.Element | null {
  const contextKey = locationId === null
    ? locationName === null ? null : `name:${locationName}`
    : `id:${locationId}`;
  const [loadState, setLoadState] = useState<{
    contextKey: string | null;
    entries: EncyclopediaEntrySummary[];
    error: string | null;
  }>({ contextKey: null, entries: [], error: null });
  useEffect(() => {
    if (contextKey === null) {
      return undefined;
    }
    let active = true;
    void worldAtlasClient.listApplicableEncyclopediaEntries({
      locationId: locationId ?? undefined,
      locationName: locationId === null ? locationName ?? undefined : undefined,
    }).then(
      (result) => {
        if (active) {
          setLoadState({ contextKey, entries: result, error: null });
        }
        return undefined;
      },
      (reason: unknown) => {
        if (active) {
          setLoadState({
            contextKey,
            entries: [],
            error: reason instanceof Error ? reason.message : 'Unable to read this context.',
          });
        }
        return undefined;
      }
    );
    return () => {
      active = false;
    };
  }, [contextKey, locationId, locationName]);

  const isCurrent = loadState.contextKey === contextKey;
  const error = isCurrent ? loadState.error : null;
  const isLoading = contextKey !== null && !isCurrent;

  const groups = useMemo(() => {
    const entries = loadState.contextKey === contextKey ? loadState.entries : [];
    const byKind = new Map<string, Map<string, EncyclopediaEntrySummary[]>>();
    for (const entry of entries) {
      const byPrevalence = byKind.get(entry.kind)
        ?? new Map<string, EncyclopediaEntrySummary[]>();
      byPrevalence.set(entry.prevalence, [
        ...(byPrevalence.get(entry.prevalence) ?? []),
        entry,
      ]);
      byKind.set(entry.kind, byPrevalence);
    }
    return [...byKind.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([kind, byPrevalence]) => ({ byPrevalence, kind }));
  }, [contextKey, loadState]);

  if (locationId === null && locationName === null) {
    return null;
  }

  return (
    <section className="context-reference-browser" aria-labelledby="common-here-title">
      <header>
        <h2 id="common-here-title">Common here</h2>
        <p>Known examples, not a limit on what may exist.</p>
      </header>
      {isLoading ? <p className="context-reference-state">Reading the local field guide…</p> : null}
      {error ? <p className="context-reference-state" role="alert">{error}</p> : null}
      {!isLoading && error === null && groups.length === 0 ? (
        <p className="context-reference-state">No local entries are recorded. New ones remain possible.</p>
      ) : null}
      <div className="context-reference-tree">
        {groups.map(({ byPrevalence, kind }) => (
          <details key={kind} open>
            <summary>{label(kind)} <span>{[...byPrevalence.values()].flat().length}</span></summary>
            <div className="context-reference-branch">
              {PREVALENCE_ORDER.filter((rarity) => byPrevalence.has(rarity)).map((rarity) => {
                const rarityEntries = [...(byPrevalence.get(rarity) ?? [])]
                  .sort((left, right) => left.title.localeCompare(right.title));
                return (
                  <details key={rarity}>
                    <summary>{label(rarity)} <span>{rarityEntries.length}</span></summary>
                    <ul>
                      {rarityEntries.map((entry) => (
                        <li key={entry.slug}>
                          <WorldReferenceButton
                            attachable={attachable}
                            reference={{ kind: entry.kind, slug: entry.slug, title: entry.title }}
                          >
                            <span>{entry.title}</span>
                            <small>{label(entry.subkind)}</small>
                          </WorldReferenceButton>
                        </li>
                      ))}
                    </ul>
                  </details>
                );
              })}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
