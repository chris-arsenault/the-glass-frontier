import type { HardState, HardStateLink, LoreFragment } from '@glass-frontier/dto';
import { WORLD_KINDS, getRelationshipType, getWorldKind } from '@glass-frontier/dto';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { worldAtlasClient } from '../../lib/worldAtlasClient';
import { useChronicleStartStore } from '../../stores/chronicleStartWizardStore';
import { AtlasBodyMap } from './AtlasBodyMap';
import type { AtlasGraph } from './atlasGraph';
import { breadcrumbIds, buildAtlasGraph, descendantCount } from './atlasGraph';
import { AtlasLocationBrowser } from './AtlasLocationBrowser';
import { AtlasSystemMap } from './AtlasSystemMap';
import './WorldAtlasPage.css';

type WorldData = {
  all: HardState[];
  byId: Map<string, HardState>;
  graph: AtlasGraph;
};

/** In-links that mean "this entity is present at the place being viewed". */
const PRESENCE_RELATIONSHIPS = new Set([
  'born_in',
  'founded_in',
  'headquartered_in',
  'inhabits',
  'located_in',
  'manifests_at',
  'operates_in',
]);

const RELATION_CATEGORY_ORDER = [
  'spatial',
  'organizational',
  'social',
  'causal',
  'technical',
  'narrative',
] as const;

const RELATION_CATEGORY_LABELS: Record<(typeof RELATION_CATEGORY_ORDER)[number], string> = {
  causal: 'History',
  narrative: 'Resonance',
  organizational: 'Authority & ownership',
  social: 'People & practice',
  spatial: 'Geography',
  technical: 'Craft & dependency',
};

const CHILD_GROUPS: Array<{ key: 'orbit' | 'surface' | 'within'; title: string }> = [
  { key: 'orbit', title: 'In orbit' },
  { key: 'surface', title: 'On the surface' },
  { key: 'within', title: 'Within' },
];

const kindLabel = (kind: string): string => getWorldKind(kind)?.displayName ?? kind;

const loreSnippet = (prose: string): string => {
  const words = prose.replace(/\s+/g, ' ').trim().split(' ');
  return `${words.slice(0, 7).join(' ')}${words.length > 7 ? '…' : ''}`;
};

const findLinkedEntity = async (
  entity: HardState,
  predicate: (candidate: HardState) => boolean
): Promise<HardState | null> => {
  const targetIds = entity.links.map((link) => link.targetId);
  if (targetIds.length === 0) {
    return null;
  }
  const linked = await worldAtlasClient.batchGetEntities(targetIds.slice(0, 100));
  return linked.find(predicate) ?? null;
};

/**
 * The World Atlas: a reader over materialized canon, arranged as an actual
 * atlas. The index is the star system; each body opens onto what orbits it,
 * what sits on its surface, and what has been charted inside, down to a
 * single entity's fact card, lore, and relationships. Canon is written by
 * ingest batches and corrected by reverting one, so nothing here edits.
 */
export function WorldAtlasPage(): React.JSX.Element {
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();
  const [world, setWorld] = useState<WorldData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      WORLD_KINDS.map((kind) => worldAtlasClient.listEntities({ kind: kind.id }))
    ).then(
      (lists) => {
        if (cancelled) {
          return;
        }
        const byId = new Map<string, HardState>();
        for (const entity of lists.flat()) {
          byId.set(entity.id, entity);
        }
        const all = [...byId.values()];
        setWorld({
          all,
          byId,
          graph: buildAtlasGraph(all.filter((entity) => entity.isLocation)),
        });
        setError(null);
        setIsLoading(false);
        return;
      },
      (reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : 'Failed to load the atlas');
          setIsLoading(false);
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const openSlug = useCallback(
    (target: string) => {
      void navigate(`/atlas/${target}`);
    },
    [navigate]
  );

  return (
    <div className="atlas-page">
      {slug === undefined ? (
        <header className="atlas-header">
          <div>
            <h1>World Atlas</h1>
            <p>The charted system, from the sun down to a single dockside archive.</p>
          </div>
          <div className="atlas-actions">
            <button
              type="button"
              className="atlas-refresh"
              onClick={() => {
                setIsLoading(true);
                setReloadToken((token) => token + 1);
              }}
              disabled={isLoading}
            >
              {isLoading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </header>
      ) : null}
      {error ? (
        <div className="atlas-alert" role="alert">
          {error}
        </div>
      ) : null}
      {slug === undefined ? (
        world === null ? (
          <div className="atlas-empty">{isLoading ? 'Charting the system…' : 'No canon loaded.'}</div>
        ) : (
          <AtlasIndex world={world} onSelect={openSlug} />
        )
      ) : (
        <AtlasEntity key={slug} slug={slug} world={world} onSelect={openSlug} />
      )}
    </div>
  );
}

type AtlasIndexProps = {
  world: WorldData;
  onSelect: (slug: string) => void;
};

function AtlasIndex({ onSelect, world }: AtlasIndexProps): React.JSX.Element {
  const registry = useMemo(() => {
    const groups = new Map<string, HardState[]>();
    for (const entity of world.all) {
      groups.set(entity.kind, [...(groups.get(entity.kind) ?? []), entity]);
    }
    return WORLD_KINDS.filter((kind) => groups.has(kind.id)).map((kind) => ({
      entities: (groups.get(kind.id) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
      kind,
    }));
  }, [world]);

  return (
    <div className="atlas-index">
      <AtlasLocationBrowser
        graph={world.graph}
        byId={world.byId}
        onOpen={(entity) => onSelect(entity.slug)}
        sidePanel={
          <section className="atlas-panel" aria-label="Registry of entities">
            <h2 className="atlas-panel-heading">Registry</h2>
            <div className="atlas-registry">
              {registry.map(({ entities, kind }) => (
                <details key={kind.id} className="atlas-registry-group" open={entities.length <= 12}>
                  <summary>
                    <span className="atlas-kind-dot" data-kind={kind.id} aria-hidden="true" />
                    {kind.displayName}
                    <span className="atlas-registry-count">{entities.length}</span>
                  </summary>
                  <ul>
                    {entities.map((entity) => (
                      <li key={entity.id}>
                        <button type="button" onClick={() => onSelect(entity.slug)}>
                          <span className="atlas-row-name">{entity.name}</span>
                          {entity.subkind ? (
                            <span className="atlas-row-sub">{entity.subkind.replace(/_/g, ' ')}</span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          </section>
        }
      />
    </div>
  );
}

type AtlasEntityProps = {
  slug: string;
  world: WorldData | null;
  onSelect: (slug: string) => void;
};

function AtlasEntity({ onSelect, slug, world }: AtlasEntityProps): React.JSX.Element {
  const navigate = useNavigate();
  const initFromAtlas = useChronicleStartStore((state) => state.initFromAtlas);
  const [entity, setEntity] = useState<HardState | null>(null);
  const [fragments, setFragments] = useState<LoreFragment[]>([]);
  const [linkedById, setLinkedById] = useState<Map<string, HardState>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void worldAtlasClient.getEntity(slug).then(
      (view) => {
        if (!cancelled) {
          setEntity(view.entity);
          setFragments(view.fragments);
          setError(null);
          setIsLoading(false);
        }
        return;
      },
      (reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : 'Failed to load entity');
          setIsLoading(false);
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Resolve link targets the world snapshot does not already know.
  useEffect(() => {
    if (entity === null) {
      return undefined;
    }
    const known = world?.byId ?? new Map<string, HardState>();
    const missing = [
      ...new Set(
        entity.links
          .map((link) => link.targetId)
          .filter((id) => !known.has(id))
      ),
    ].slice(0, 100);
    if (missing.length === 0) {
      // Component remounts per slug, so a stale map cannot linger here.
      return undefined;
    }
    let cancelled = false;
    void worldAtlasClient.batchGetEntities(missing).then(
      (list) => {
        if (!cancelled) {
          setLinkedById(new Map(list.map((item) => [item.id, item])));
        }
        return;
      },
      () => undefined
    );
    return () => {
      cancelled = true;
    };
  }, [entity, world]);

  const resolve = useCallback(
    (id: string): HardState | undefined => world?.byId.get(id) ?? linkedById.get(id),
    [linkedById, world]
  );

  const crumbs = useMemo(() => {
    if (entity === null || world === null) {
      return [];
    }
    if (world.graph.nodes.has(entity.id)) {
      return breadcrumbIds(world.graph, entity.id)
        .slice(0, -1)
        .map((id) => world.byId.get(id))
        .filter((item): item is HardState => Boolean(item));
    }
    const anchor = entity.links.find(
      (link) =>
        link.direction === 'out' &&
        PRESENCE_RELATIONSHIPS.has(link.relationship) &&
        world.graph.nodes.has(link.targetId)
    );
    if (!anchor) {
      return [];
    }
    return breadcrumbIds(world.graph, anchor.targetId)
      .map((id) => world.byId.get(id))
      .filter((item): item is HardState => Boolean(item));
  }, [entity, world]);

  const node = entity !== null && world !== null ? world.graph.nodes.get(entity.id) ?? null : null;

  const presence = useMemo(() => {
    if (entity === null) {
      return [];
    }
    const here = entity.links.filter(
      (link) =>
        link.direction === 'in' &&
        PRESENCE_RELATIONSHIPS.has(link.relationship) &&
        !(world?.graph.nodes.has(link.targetId) ?? false)
    );
    const groups = new Map<string, HardState[]>();
    for (const link of here) {
      const target = resolve(link.targetId);
      if (!target) {
        continue;
      }
      groups.set(target.kind, [...(groups.get(target.kind) ?? []), target]);
    }
    return WORLD_KINDS.filter((kind) => groups.has(kind.id)).map((kind) => ({
      entities: [...new Map((groups.get(kind.id) ?? []).map((item) => [item.id, item])).values()].sort(
        (a, b) => a.name.localeCompare(b.name)
      ),
      kind,
    }));
  }, [entity, resolve, world]);

  const relationGroups = useMemo(() => {
    if (entity === null) {
      return [];
    }
    // Everything already surfaced structurally stays out of this list: the
    // parent chain (breadcrumbs), charted children (tiles and charts), and
    // presence links (the Present-here section).
    const node = world?.graph.nodes.get(entity.id);
    const structuralIds = new Set<string>();
    if (node) {
      if (node.parentId !== null) {
        structuralIds.add(node.parentId);
      }
      for (const childId of [
        ...node.children.orbit,
        ...node.children.surface,
        ...node.children.within,
      ]) {
        structuralIds.add(childId);
      }
    }
    const CONTAINMENT = new Set([
      'on_surface_of',
      'in_orbit_of',
      'orbits',
      'located_in',
      'part_of',
    ]);
    const groups = new Map<string, HardStateLink[]>();
    for (const link of entity.links) {
      const type = getRelationshipType(link.relationship);
      const category = type?.category ?? 'spatial';
      if (category === 'dm' || category === 'banned') {
        continue;
      }
      if (CONTAINMENT.has(link.relationship) && structuralIds.has(link.targetId)) {
        continue;
      }
      if (
        link.direction === 'in' &&
        PRESENCE_RELATIONSHIPS.has(link.relationship) &&
        !(world?.graph.nodes.has(link.targetId) ?? false)
      ) {
        continue; // rendered in Present here
      }
      groups.set(category, [...(groups.get(category) ?? []), link]);
    }
    return RELATION_CATEGORY_ORDER.filter((category) => groups.has(category)).map((category) => ({
      category,
      links: groups.get(category) ?? [],
    }));
  }, [entity, world]);

  const handleStartChronicle = async () => {
    if (!entity) {
      return;
    }
    setIsStarting(true);
    setError(null);
    try {
      const [location, anchor] = await Promise.all([
        entity.isLocation
          ? Promise.resolve(entity)
          : findLinkedEntity(entity, (candidate) => candidate.isLocation),
        entity.isLocation
          ? findLinkedEntity(entity, (candidate) => !candidate.isLocation)
          : Promise.resolve(entity),
      ]);
      if (location === null) {
        setError(
          'Could not find a location for this entity. Please select a location entity or one linked to a location.'
        );
        return;
      }
      initFromAtlas({
        anchor:
          anchor === null
            ? null
            : {
              description: anchor.description ?? undefined,
              id: anchor.id,
              kind: anchor.kind,
              name: anchor.name,
              slug: anchor.slug,
              subkind: anchor.subkind ?? undefined,
            },
        location: {
          description: location.description ?? undefined,
          id: location.id,
          name: location.name,
          slug: location.slug,
          status: location.status ?? undefined,
          subkind: location.subkind ?? undefined,
        },
      });
      void navigate('/chron/start');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to prepare chronicle');
    } finally {
      setIsStarting(false);
    }
  };

  if (entity === null) {
    return <div className="atlas-empty">{isLoading ? 'Loading…' : 'Entity not found.'}</div>;
  }

  const facts = Object.entries(entity.facts);

  // Source summaries are truncated excerpts of the lead lore passage; when
  // that passage is present below, showing both is pure duplication.
  const descriptionPrefix = (entity.description ?? '')
    .replace(/[.…]+\s*$/u, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  const descriptionInLore =
    descriptionPrefix.length > 20 &&
    fragments.some((fragment) =>
      fragment.prose.replace(/\s+/g, ' ').trim().startsWith(descriptionPrefix)
    );

  // Fragment tags are stamped per entity by the source, so one shared row
  // says everything; per-fragment repeats are noise.
  const loreTags = [...new Set(fragments.flatMap((fragment) => fragment.tags ?? []))];
  const loreTitleCounts = new Map<string, number>();
  for (const fragment of fragments) {
    loreTitleCounts.set(fragment.title, (loreTitleCounts.get(fragment.title) ?? 0) + 1);
  }

  return (
    <div className="atlas-entity">
      {error ? (
        <div className="atlas-alert" role="alert">
          {error}
        </div>
      ) : null}
      <nav className="atlas-breadcrumbs" aria-label="Atlas position">
        <Link to="/atlas">World Atlas</Link>
        {crumbs.map((crumb) => (
          <React.Fragment key={crumb.id}>
            <span className="atlas-breadcrumb-sep" aria-hidden="true">
              /
            </span>
            <Link to={`/atlas/${crumb.slug}`}>{crumb.name}</Link>
          </React.Fragment>
        ))}
      </nav>

      <header className="atlas-entity-head">
        <div className="atlas-entity-title">
          <h1>{entity.name}</h1>
          <div className="atlas-chip-row">
            <span className="atlas-chip" data-kind={entity.kind}>
              {kindLabel(entity.kind)}
            </span>
            {entity.subkind ? (
              <span className="atlas-chip">{entity.subkind.replace(/_/g, ' ')}</span>
            ) : null}
            {entity.status ? <span className="atlas-chip">{entity.status}</span> : null}
            <span className="atlas-chip atlas-chip-prominence" data-prominence={entity.prominence}>
              {entity.prominence}
            </span>
          </div>
        </div>
        <button
          type="button"
          className="atlas-start-button"
          onClick={() => void handleStartChronicle()}
          disabled={isStarting}
        >
          {isStarting ? 'Preparing…' : 'Start chronicle'}
        </button>
      </header>

      {entity.description && !descriptionInLore ? (
        <p className="atlas-description">{entity.description}</p>
      ) : null}

      {facts.length > 0 ? (
        <dl className="atlas-facts">
          {facts.map(([key, value]) => (
            <div key={key} className="atlas-fact">
              <dt>{key.replace(/_/g, ' ')}</dt>
              <dd>{String(value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {entity.subkind === 'star_system' && world !== null ? (
        <section className="atlas-section atlas-bodymap-panel">
          <h3>System chart</h3>
          <AtlasSystemMap graph={world.graph} onSelect={onSelect} />
        </section>
      ) : null}

      {entity.subkind !== 'star_system' &&
      node !== null &&
      world !== null &&
      node.children.orbit.length > 0 ? (
          <section className="atlas-section atlas-bodymap-panel">
            <h3>Orbit &amp; surface</h3>
            <AtlasBodyMap
              graph={world.graph}
              body={node}
              resolve={resolve}
              onOpen={(target) => onSelect(target)}
            />
          </section>
        ) : null}

      {node !== null && world !== null
        ? CHILD_GROUPS.map(({ key, title }) =>
          node.children[key].length > 0 ? (
            <section key={key} className="atlas-section">
              <h3>{title}</h3>
              <div className="atlas-tile-grid">
                {node.children[key].map((childId) => {
                  const child = world.byId.get(childId);
                  if (!child) {
                    return null;
                  }
                  const charted = descendantCount(world.graph, childId);
                  return (
                    <button
                      key={childId}
                      type="button"
                      className="atlas-tile"
                      onClick={() => onSelect(child.slug)}
                    >
                      <span className="atlas-tile-name">{child.name}</span>
                      <span className="atlas-tile-meta">
                        {child.subkind?.replace(/_/g, ' ') ?? child.kind}
                        {child.status ? ` · ${child.status}` : ''}
                      </span>
                      {child.description ? (
                        <span className="atlas-tile-desc">{child.description}</span>
                      ) : null}
                      {charted > 0 ? (
                        <span className="atlas-tile-count">
                          {charted} charted {charted === 1 ? 'place' : 'places'}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null
        )
        : null}

      {presence.length > 0 ? (
        <section className="atlas-section">
          <h3>Present here</h3>
          <div className="atlas-presence">
            {presence.map(({ entities, kind }) => (
              <div key={kind.id} className="atlas-presence-group">
                <p className="atlas-presence-kind">
                  <span className="atlas-kind-dot" data-kind={kind.id} aria-hidden="true" />
                  {kind.displayName}
                </p>
                <div className="atlas-presence-chips">
                  {entities.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="atlas-presence-chip"
                      onClick={() => onSelect(item.slug)}
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {relationGroups.length > 0 ? (
        <section className="atlas-section">
          <h3>Relationships</h3>
          {relationGroups.map(({ category, links }) => (
            <div key={category} className="atlas-links-group">
              <p className="atlas-links-category">{RELATION_CATEGORY_LABELS[category]}</p>
              <div className="atlas-links">
                {links.map((link) => {
                  const target = resolve(link.targetId);
                  const targetName = target?.name ?? link.targetId;
                  return (
                    <div
                      key={`${link.relationship}-${link.targetId}-${link.direction}`}
                      className="atlas-link-row"
                    >
                      <div className="atlas-link-pill">{link.relationship.replace(/_/g, ' ')}</div>
                      <div className="atlas-link-body">
                        <span aria-hidden="true">{link.direction === 'in' ? '←' : '→'}</span>
                        {target ? (
                          <Link to={`/atlas/${target.slug}`} className="atlas-link-target">
                            {targetName}
                          </Link>
                        ) : (
                          <span className="atlas-link-target">{targetName}</span>
                        )}
                        {link.since !== undefined ? (
                          <span className="atlas-link-era">
                            {link.since}
                            {link.until !== undefined ? `–${link.until}` : ''}
                          </span>
                        ) : null}
                        {link.strength !== undefined ? (
                          <span
                            className="atlas-link-strength"
                            title="Strength: 0.0 (weak/spatial) to 1.0 (strong/narrative)"
                          >
                            {link.strength.toFixed(2)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {fragments.length > 0 ? (
        <section className="atlas-section">
          <h3>
            Lore
            <span className="atlas-section-count">{fragments.length}</span>
            {loreTags.length > 0 ? (
              <span className="atlas-fragment-tags">{loreTags.join(' · ')}</span>
            ) : null}
          </h3>
          <div className="atlas-fragments">
            {fragments.map((fragment, index) => (
              <details key={fragment.id} className="atlas-fragment" open={index === 0}>
                <summary>
                  <span className="atlas-fragment-title">{fragment.title}</span>
                  {(loreTitleCounts.get(fragment.title) ?? 0) > 1 ? (
                    <span className="atlas-fragment-snippet">{loreSnippet(fragment.prose)}</span>
                  ) : null}
                </summary>
                <p className="atlas-fragment-body">{fragment.prose}</p>
              </details>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
