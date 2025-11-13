import type { AttributeValue, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import type { LocationEdgeKind } from '@glass-frontier/dto';

import { HybridIndexRepository } from './hybridIndexRepository';

const pkLocation = (locationId: string): string => `LOCATION#${locationId}`;
const pkPlace = (placeId: string): string => `PLACE#${placeId}`;

const skPlace = (placeId: string): string => `PLACE#${placeId}`;
const skEdge = (src: string, kind: LocationEdgeKind, dst: string): string =>
  `EDGE#${src}#${kind}#${dst}`;

const decodePlaceId = (value: string | undefined): string | null => {
  if (value === undefined || !value.startsWith('PLACE#')) {
    return null;
  }
  return value.slice('PLACE#'.length);
};

const decodeEdge = (
  value: string | undefined
): { src: string; kind: LocationEdgeKind; dst: string } | null => {
  if (value === undefined || !value.startsWith('EDGE#')) {
    return null;
  }
  const [, src, kind, dst] = value.split('#');
  if (
    src === undefined ||
    src.length === 0 ||
    kind === undefined ||
    kind.length === 0 ||
    dst === undefined ||
    dst.length === 0
  ) {
    return null;
  }
  return { dst, kind: kind as LocationEdgeKind, src };
};

export class LocationGraphIndexRepository extends HybridIndexRepository {
  constructor(options: { client: DynamoDBClient; tableName: string }) {
    super({ client: options.client, tableName: options.tableName });
  }

  async registerPlace(locationId: string, placeId: string): Promise<void> {
    await this.put(pkLocation(locationId), skPlace(placeId), {
      entityType: { S: 'place' },
      placeId: { S: placeId },
    });
  }

  async registerEdge(
    locationId: string,
    edge: { src: string; kind: LocationEdgeKind; dst: string }
  ): Promise<void> {
    const attributes: Record<string, AttributeValue> = {
      dst: { S: edge.dst },
      entityType: { S: 'edge' },
      kind: { S: edge.kind },
      src: { S: edge.src },
    };
    await Promise.all([
      this.put(pkLocation(locationId), skEdge(edge.src, edge.kind, edge.dst), attributes),
      this.put(pkPlace(edge.src), skEdge(edge.src, edge.kind, edge.dst), attributes),
    ]);
  }

  async unregisterEdge(
    locationId: string,
    edge: { src: string; kind: LocationEdgeKind; dst: string }
  ): Promise<void> {
    await Promise.all([
      this.delete(pkLocation(locationId), skEdge(edge.src, edge.kind, edge.dst)),
      this.delete(pkPlace(edge.src), skEdge(edge.src, edge.kind, edge.dst)),
    ]);
  }

  async listLocationPlaceIds(locationId: string): Promise<string[]> {
    return this.listByPrefix(pkLocation(locationId), 'PLACE#', (item) => decodePlaceId(item.sk?.S));
  }

  async listLocationEdges(
    locationId: string
  ): Promise<Array<{ src: string; kind: LocationEdgeKind; dst: string }>> {
    return this.listByPrefix(pkLocation(locationId), 'EDGE#', (item) => decodeEdge(item.sk?.S));
  }

  async listEdgesFromPlace(
    placeId: string
  ): Promise<Array<{ src: string; kind: LocationEdgeKind; dst: string }>> {
    return this.listByPrefix(pkPlace(placeId), 'EDGE#', (item) => decodeEdge(item.sk?.S));
  }
}
