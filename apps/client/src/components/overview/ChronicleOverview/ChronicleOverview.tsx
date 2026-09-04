import type { Chronicle, LocalContinuity, NarrativeThread } from '@glass-frontier/dto';
import React, { useMemo, useState, useEffect } from 'react';

import { worldAtlasClient } from '../../../lib/worldAtlasClient';
import type { TurnView } from '../../../state/chronicleState';
import { useChronicleStore } from '../../../stores/chronicleStore';
import './ChronicleOverview.css';

type ChronicleHeaderProps = {
  chronicle: Chronicle;
  turnSequence: number;
};

const ChronicleHeader = ({ chronicle, turnSequence }: ChronicleHeaderProps): React.JSX.Element => (
  <header className="session-panel-header">
    <div>
      <h2 id="chronicle-panel-title">{chronicle.title}</h2>
      <p className="session-panel-subtitle">
        Turn {turnSequence} · {chronicle.status}
      </p>
    </div>
  </header>
);

type AnchorEntityData = {
  id: string;
  name: string;
  kind: string;
  slug: string;
};

type RemoteAnchor = {
  anchorId: string;
  entity: AnchorEntityData;
};

/** Turn views ordered newest-first, for scanning recent turns. */
const sortTurnViews = (turnViews: Record<string, TurnView>): TurnView[] =>
  [...Object.values(turnViews)].sort(
    (a, b) => (b.turnSequence ?? 0) - (a.turnSequence ?? 0)
  );

const findAnchorInViews = (
  views: TurnView[],
  anchorId: string | undefined
): AnchorEntityData | null => {
  if (anchorId === undefined) {
    return null;
  }
  for (const view of views) {
    const found = view.entityRoster?.find((entity) => entity.id === anchorId);
    if (found !== undefined) {
      return { id: found.id, kind: found.kind, name: found.name, slug: found.slug };
    }
  }
  return null;
};

type AnchorEntityPanelProps = {
  anchorEntity: AnchorEntityData | null;
};

const AnchorEntityPanel = ({ anchorEntity }: AnchorEntityPanelProps): React.JSX.Element | null => {
  if (!anchorEntity) {
    return null;
  }

  const isUnresolved = anchorEntity.kind === 'Unknown';

  return (
    <div>
      <h3 className="panel-label">Anchor Entity</h3>
      <div className="anchor-entity-card">
        <span className="anchor-entity-name">{anchorEntity.name}</span>
        <span className="anchor-entity-meta">{anchorEntity.kind} · {anchorEntity.slug}</span>
        {isUnresolved && (
          <p className="entity-unresolved-hint">Entity details will load after next turn</p>
        )}
      </div>
    </div>
  );
};

type ThreadsPanelProps = {
  focusedThreadId: string | null;
  threads: NarrativeThread[];
};

const ThreadsPanel = ({ focusedThreadId, threads }: ThreadsPanelProps): React.JSX.Element => {
  const playerThreads = threads.filter((thread) => thread.perspective === 'player');
  if (playerThreads.length === 0) {
    return (
      <div>
        <h3 className="panel-label">Player Threads</h3>
        <p className="session-panel-empty">No long-horizon goal is recorded.</p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="panel-label">Player Threads</h3>
      <ul className="thread-list">
        {playerThreads.map((thread) => (
          <li
            key={thread.id}
            className={`thread-item${thread.id === focusedThreadId ? ' thread-item-focused' : ''}`}
          >
            <div className="thread-header">
              <span className="thread-title">{thread.title}</span>
              {thread.id === focusedThreadId ? (
                <span className="thread-status">Focused</span>
              ) : null}
            </div>
            <p className="thread-goal">{thread.goal}</p>
            <p className="thread-position">{thread.position}</p>
          </li>
        ))}
      </ul>
    </div>
  );
};

type SeedTextPanelProps = {
  seedText?: string | null;
};

const SeedTextPanel = ({ seedText }: SeedTextPanelProps): React.JSX.Element | null => {
  if (!seedText || seedText.trim().length === 0) {
    return null;
  }

  return (
    <div>
      <h3 className="panel-label">Chronicle Seed</h3>
      <p className="chronicle-seed-text">{seedText}</p>
    </div>
  );
};

type WrapTargetPanelProps = {
  targetEndTurn?: number | null;
  currentTurn: number;
};

const LocalContinuityPanel = ({
  continuity,
}: { continuity: LocalContinuity | null }): React.JSX.Element | null => {
  if (continuity === null) {
    return null;
  }
  return (
    <div>
      <h3 className="panel-label">Current Situation</h3>
      <p className="local-continuity-location">{continuity.locationName}</p>
      <p className="local-continuity-note">{continuity.note}</p>
    </div>
  );
};

const WrapTargetPanel = ({ currentTurn, targetEndTurn }: WrapTargetPanelProps): React.JSX.Element | null => {
  if (!targetEndTurn) {
    return null;
  }

  const turnsLeft = Math.max(0, targetEndTurn - currentTurn);

  return (
    <div className="wrap-target-panel">
      <h3 className="panel-label">Wrap Target</h3>
      <p className="session-chip">
        {turnsLeft} {turnsLeft === 1 ? 'turn' : 'turns'} remaining
      </p>
    </div>
  );
};

const ChronicleEmptyState = (): React.JSX.Element => (
  <section className="session-panel" aria-live="polite">
    <header className="session-panel-header">
      <h2>Chronicle</h2>
    </header>
    <p className="session-panel-empty">No chronicle loaded.</p>
  </section>
);

type ChronicleOverviewProps = {
  showEmptyState?: boolean;
};

export function ChronicleOverview({
  showEmptyState = true,
}: ChronicleOverviewProps): React.JSX.Element | null {
  const chronicle = useChronicleStore((state) => state.chronicleRecord);
  const threads = useChronicleStore((state) => state.threads);
  const focusedThreadId = useChronicleStore((state) => state.focusedThreadId);
  const turnSequence = useChronicleStore((state) => state.turnSequence);
  const turnViews = useChronicleStore((state) => state.turnViews);

  const recentViews = useMemo(() => sortTurnViews(turnViews), [turnViews]);

  const [remoteAnchor, setRemoteAnchor] = useState<RemoteAnchor | null>(null);
  const anchorEntityFromMessages = findAnchorInViews(
    recentViews,
    chronicle?.anchorEntityId
  );

  useEffect(() => {
    const anchorId = chronicle?.anchorEntityId;
    if (anchorId === undefined || anchorEntityFromMessages !== null) {
      return undefined;
    }
    let cancelled = false;
    void worldAtlasClient.getEntity(anchorId).then(
      (result) => {
        if (!cancelled) {
          setRemoteAnchor({
            anchorId,
            entity: {
              id: result.entity.id,
              kind: result.entity.kind,
              name: result.entity.name,
              slug: result.entity.slug,
            },
          });
        }
        return undefined;
      },
      (error: unknown) => {
        console.error('Failed to fetch anchor entity:', error);
        return undefined;
      }
    );
    return () => {
      cancelled = true;
    };
  }, [anchorEntityFromMessages, chronicle?.anchorEntityId]);

  const remoteAnchorEntity = remoteAnchor !== null
    && remoteAnchor.anchorId === chronicle?.anchorEntityId
    ? remoteAnchor.entity
    : null;
  const anchorEntity = anchorEntityFromMessages ?? remoteAnchorEntity;

  if (!chronicle) {
    return showEmptyState ? <ChronicleEmptyState /> : null;
  }

  return (
    <section className="session-panel" aria-labelledby="chronicle-panel-title">
      <ChronicleHeader chronicle={chronicle} turnSequence={turnSequence} />

      <SeedTextPanel seedText={chronicle.seedText} />

      <AnchorEntityPanel anchorEntity={anchorEntity} />

      <ThreadsPanel threads={threads} focusedThreadId={focusedThreadId} />

      <LocalContinuityPanel continuity={chronicle.localContinuity} />

      <WrapTargetPanel targetEndTurn={chronicle.targetEndTurn} currentTurn={turnSequence} />
    </section>
  );
}
