import type { ChronicleBeat, Chronicle } from '@glass-frontier/dto';
import React, { useMemo, useState, useEffect } from 'react';

import { worldAtlasClient } from '../../../lib/worldAtlasClient';
import type { ChatMessage } from '../../../state/chronicleState';
import { useChronicleStore } from '../../../stores/chronicleStore';
import './ChronicleOverview.css';

const formatBeatStatus = (status: ChronicleBeat['status']): string => {
  switch (status) {
  case 'succeeded':
    return 'Succeeded';
  case 'failed':
    return 'Failed';
  default:
    return 'In Progress';
  }
};

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

type EntityUsage = NonNullable<ChatMessage['entityUsage']>[number];

const countUsageTags = (counts: Map<string, number>, usage: EntityUsage): void => {
  for (const tag of usage.tags) {
    counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  for (const tag of usage.emergentTags ?? []) {
    counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
};

const findAnchorInMessages = (
  messages: ChatMessage[],
  anchorId: string | undefined
): AnchorEntityData | null => {
  if (anchorId === undefined) {
    return null;
  }
  for (const message of messages.slice().reverse()) {
    const found = message.entityOffered?.find((entity) => entity.id === anchorId);
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

type EntityWithScore = {
  id: string;
  name: string;
  slug: string;
  kind: string;
  score: number;
};

type EntityFocusPanelProps = {
  entities: EntityWithScore[];
  tags: Array<{ tag: string; score: number }>;
};

const EntityFocusPanel = ({ entities, tags }: EntityFocusPanelProps): React.JSX.Element => {
  const hasEntities = entities.length > 0;
  const hasTags = tags.length > 0;

  if (!hasEntities && !hasTags) {
    return (
      <div>
        <h3 className="panel-label">Entity Focus</h3>
        <p className="session-panel-empty">
          Entity tracking starts after your first turn. The system will identify and track entities that are central to your story.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="panel-label">Entity Focus</h3>
      {hasEntities && (
        <div className="entity-focus-section">
          <h4 className="entity-focus-sublabel">Tracked Entities</h4>
          <ul className="entity-focus-list">
            {entities.map((entity) => (
              <li key={entity.id} className="entity-focus-item">
                <div className="entity-focus-details">
                  <span className="entity-focus-name">{entity.name}</span>
                  <span className="entity-focus-meta">{entity.kind} · {entity.slug}</span>
                </div>
                <span className="entity-focus-score">{entity.score.toFixed(1)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {hasTags && (
        <div className="entity-focus-section">
          <h4 className="entity-focus-sublabel">Tracked Tags</h4>
          <div className="panel-tags">
            {tags.map(({ score, tag }) => (
              <span key={tag} className="session-chip chip-muted" title={`Score: ${score.toFixed(1)}`}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

type BeatsPanelProps = {
  beats: ChronicleBeat[];
  focusedBeatId: string | null;
  beatsEnabled: boolean;
};

const BeatsPanel = ({ beats, beatsEnabled, focusedBeatId }: BeatsPanelProps): React.JSX.Element => {
  if (!beatsEnabled) {
    return (
      <div>
        <h3 className="panel-label">Chronicle Beats</h3>
        <p className="session-panel-empty">Beats are disabled for this chronicle.</p>
      </div>
    );
  }

  if (beats.length === 0) {
    return (
      <div>
        <h3 className="panel-label">Chronicle Beats</h3>
        <p className="session-panel-empty">
          The GM will establish the opening beat after the first turn.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="panel-label">Chronicle Beats</h3>
      <ul className="beat-list">
        {beats.map((beat) => (
          <li
            key={beat.id}
            className={`beat-item${beat.id === focusedBeatId ? ' beat-item-focused' : ''}`}
            data-status={beat.status}
          >
            <div className="beat-header">
              <span className="beat-title">{beat.title}</span>
              <span className="beat-status">{formatBeatStatus(beat.status)}</span>
            </div>
            <p className="beat-description">{beat.description}</p>
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

type RecentEntityUsage = {
  entityName: string;
  entitySlug: string;
  entityKind: string;
  usage: 'unused' | 'mentioned' | 'central';
  tags: string[];
  emergentTags: string[] | null;
  turnSequence: number;
};

type RecentEntityUsagePanelProps = {
  recentUsage: RecentEntityUsage[];
};

const RecentEntityUsagePanel = ({ recentUsage }: RecentEntityUsagePanelProps): React.JSX.Element => {
  if (recentUsage.length === 0) {
    return (
      <div>
        <h3 className="panel-label">Recent Entity Usage</h3>
        <p className="session-panel-empty">
          After taking turns, this section shows which entities were central, mentioned, or unused in recent narrative responses.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="panel-label">Recent Entity Usage</h3>
      <p className="entity-usage-hint">Entities from the last 5 turns</p>
      <ul className="entity-usage-list">
        {recentUsage.map((usage, index) => (
          <li key={`${usage.entitySlug}-${usage.turnSequence}-${index}`} className="entity-usage-item" data-usage={usage.usage}>
            <div className="entity-usage-header">
              <span className="entity-usage-name">{usage.entityName}</span>
              <span className={`entity-usage-badge entity-usage-${usage.usage}`}>
                {usage.usage}
              </span>
            </div>
            <div className="entity-usage-meta">
              {usage.entityKind} · {usage.entitySlug} · Turn {usage.turnSequence}
            </div>
            {usage.tags.length > 0 && (
              <div className="entity-usage-tags">
                {usage.tags.map((tag) => (
                  <span key={tag} className="session-chip chip-muted">{tag}</span>
                ))}
              </div>
            )}
            {usage.emergentTags && usage.emergentTags.length > 0 && (
              <div className="entity-usage-tags">
                <span className="entity-usage-emergent-label">Emergent:</span>
                {usage.emergentTags.map((tag) => (
                  <span key={tag} className="session-chip chip-muted">{tag}</span>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
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
  const beats = useChronicleStore((state) => state.beats);
  const beatsEnabled = useChronicleStore((state) => state.beatsEnabled);
  const focusedBeatId = useChronicleStore((state) => state.focusedBeatId);
  const turnSequence = useChronicleStore((state) => state.turnSequence);
  const messages = useChronicleStore((state) => state.messages);

  const [remoteAnchor, setRemoteAnchor] = useState<RemoteAnchor | null>(null);
  const anchorEntityFromMessages = findAnchorInMessages(
    messages,
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

  // Extract entity focus with names from recent turns
  const focusedEntities = useMemo((): EntityWithScore[] => {
    // Build a map of entity ID to entity data from recent messages
    const entityMap = new Map<string, { name: string; slug: string; kind: string }>();
    const entityScores = new Map<string, number>();

    for (let i = messages.length - 1; i >= Math.max(0, messages.length - 20); i--) {
      const message = messages[i];

      // Build entity name/slug/kind map from entityOffered
      if (message.entityOffered) {
        for (const entity of message.entityOffered) {
          if (!entityMap.has(entity.id)) {
            entityMap.set(entity.id, {
              kind: entity.kind,
              name: entity.name,
              slug: entity.slug,
            });
          }
        }
      }

      // Compute scores from entityUsage (central=3, mentioned=1, unused=0)
      if (message.entry.role === 'gm' && message.entityUsage) {
        for (const usage of message.entityUsage) {
          if (!usage.entityId) {continue;}

          const currentScore = entityScores.get(usage.entityId) ?? 0;
          const points = usage.usage === 'central' ? 3 : usage.usage === 'mentioned' ? 1 : 0;
          entityScores.set(usage.entityId, currentScore + points);
        }
      }
    }

    // Sort by score and take top 10
    const sortedEntityIds = Array.from(entityScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    // Return entities with resolved names
    return sortedEntityIds.map(([entityId, score]) => {
      const entityData = entityMap.get(entityId);
      return {
        id: entityId,
        kind: entityData?.kind ?? 'unknown',
        name: entityData?.name ?? entityId.substring(0, 8),
        score,
        slug: entityData?.slug ?? entityId.substring(0, 8),
      };
    });
  }, [messages]);

  // Extract tag focus
  const focusedTags = useMemo(() => {
    const tagCounts = new Map<string, number>();

    for (let i = messages.length - 1; i >= Math.max(0, messages.length - 20); i--) {
      const message = messages[i];

      // Aggregate tags from entityUsage
      if (message.entry.role === 'gm' && message.entityUsage) {
        for (const usage of message.entityUsage) {
          countUsageTags(tagCounts, usage);
        }
      }
    }

    return Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([tag, score]) => ({ score, tag }));
  }, [messages]);

  // Extract recent entity usage from recent turns
  const recentEntityUsage = useMemo((): RecentEntityUsage[] => {
    const usage: RecentEntityUsage[] = [];

    // Build entity map from recent messages
    const entityMap = new Map<string, { name: string; kind: string }>();
    for (let i = messages.length - 1; i >= Math.max(0, messages.length - 20); i--) {
      const message = messages[i];
      if (message.entityOffered) {
        for (const entity of message.entityOffered) {
          if (!entityMap.has(entity.id)) {
            entityMap.set(entity.id, { kind: entity.kind, name: entity.name });
          }
        }
      }
    }

    // Collect entity usage from recent turns (GM responses only)
    const seenEntities = new Set<string>();
    for (let i = messages.length - 1; i >= Math.max(0, messages.length - 10); i--) {
      const message = messages[i];
      if (message.entry.role === 'gm' && message.entityUsage && message.turnSequence) {
        for (const entityUsageEntry of message.entityUsage) {
          // Skip if we've already seen this entity in a more recent turn
          if (!entityUsageEntry.entityId || seenEntities.has(entityUsageEntry.entityId)) {
            continue;
          }
          seenEntities.add(entityUsageEntry.entityId);

          const entityData = entityMap.get(entityUsageEntry.entityId);
          usage.push({
            emergentTags: entityUsageEntry.emergentTags,
            entityKind: entityData?.kind ?? 'unknown',
            entityName: entityData?.name ?? entityUsageEntry.entitySlug,
            entitySlug: entityUsageEntry.entitySlug,
            tags: entityUsageEntry.tags,
            turnSequence: message.turnSequence,
            usage: entityUsageEntry.usage,
          });

          // Limit to 15 entities total
          if (usage.length >= 15) {
            return usage;
          }
        }
      }
    }

    return usage;
  }, [messages]);

  if (!chronicle) {
    return showEmptyState ? <ChronicleEmptyState /> : null;
  }

  return (
    <section className="session-panel" aria-labelledby="chronicle-panel-title">
      <ChronicleHeader chronicle={chronicle} turnSequence={turnSequence} />

      <SeedTextPanel seedText={chronicle.seedText} />

      <AnchorEntityPanel anchorEntity={anchorEntity} />

      <EntityFocusPanel entities={focusedEntities} tags={focusedTags} />

      <RecentEntityUsagePanel recentUsage={recentEntityUsage} />

      <BeatsPanel beats={beats} focusedBeatId={focusedBeatId} beatsEnabled={beatsEnabled} />

      <WrapTargetPanel targetEndTurn={chronicle.targetEndTurn} currentTurn={turnSequence} />
    </section>
  );
}
