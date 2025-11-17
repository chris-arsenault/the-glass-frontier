import type {
  LocationGraphChunk,
  LocationGraphEdge,
  LocationGraphSnapshot,
} from '@glass-frontier/worldstate/dto';

const EDGE_KEY_PREFIX = 'edge';

const edgeKey = (edge: LocationGraphEdge, fallbackIndex: number): string => {
  if (typeof edge.id === 'string' && edge.id.length > 0) {
    return edge.id;
  }
  return `${EDGE_KEY_PREFIX}:${edge.src}:${edge.dst}:${edge.kind}:${fallbackIndex}`;
};

export const mergeLocationGraphChunks = (
  base: LocationGraphSnapshot | null,
  chunks: LocationGraphChunk[]
): LocationGraphSnapshot => {
  if (chunks.length === 0) {
    return base ?? { locationId: base?.locationId ?? '', places: [], edges: [] };
  }
  const locationId = chunks[0].locationId ?? base?.locationId ?? '';
  const placeMap = new Map<string, LocationGraphSnapshot['places'][number]>();
  const edgeMap = new Map<string, LocationGraphSnapshot['edges'][number]>();
  for (const place of base?.places ?? []) {
    placeMap.set(place.id, place);
  }
  for (const edge of base?.edges ?? []) {
    edgeMap.set(edgeKey(edge, edgeMap.size), edge);
  }
  chunks.forEach((chunk) => {
    chunk.places.forEach((place) => placeMap.set(place.id, place));
    chunk.edges.forEach((edge) => edgeMap.set(edgeKey(edge, edgeMap.size), edge));
  });
  return {
    locationId,
    places: Array.from(placeMap.values()),
    edges: Array.from(edgeMap.values()),
  };
};
