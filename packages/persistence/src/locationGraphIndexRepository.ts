import type { AttributeValue, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import type { LocationEdgeKind } from '@glass-frontier/dto';
import { HybridIndexRepository } from './hybridIndexRepository';

const pkLocation = (locationId: string) => `LOCATION#${locationId}`;
const pkPlace = (placeId: string) => `PLACE#${placeId}`;

const skPlace = (placeId: string) => `PLACE#${placeId}`;
const skEdge = (src: string, kind: LocationEdgeKind, dst: string) => `EDGE#${src}#${kind}#${dst}`;

const decodePlaceId = (value: string | undefined): string | null => {
  if (!value || !value.startsWith('PLACE#')) {
    return null;
  }
  return value.slice('PLACE#'.length);
};

const decodeEdge = (
  value: string | undefined
): { src: string; kind: LocationEdgeKind; dst: string } | null => {
  if (!value || !value.startsWith('EDGE#')) {
    return null;
  }
  const [, src, kind, dst] = value.split('#');
  if (!src || !kind || !dst) {
    return null;
  }
  return { src, kind: kind as LocationEdgeKind, dst };
};

export class LocationGraphIndexRepository extends HybridIndexRepository {
  constructor(options: { client: DynamoDBClient; tableName: string }) {
    super({ tableName: options.tableName, client: options.client });
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
      entityType: { S: 'edge' },
      src: { S: edge.src },
      dst: { S: edge.dst },
      kind: { S: edge.kind },
    };
    await Promise.all([
      this.put(pkLocation(locationId), skEdge(edge.src, edge.kind, edge.dst), attributes),
      this.put(pkPlace(edge.src), skEdge(edge.src, edge.kind, edge.dst), attributes),
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
