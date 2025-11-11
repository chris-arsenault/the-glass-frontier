import {
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
  type AttributeValue
} from "@aws-sdk/client-dynamodb";
import type { LocationEdgeKind } from "@glass-frontier/dto";

const pkChronicle = (chronicleId: string) => `CHRONICLE#${chronicleId}`;
const pkPlace = (placeId: string) => `PLACE#${placeId}`;

const skPlace = (placeId: string) => `PLACE#${placeId}`;
const skEdge = (src: string, kind: LocationEdgeKind, dst: string) =>
  `EDGE#${src}#${kind}#${dst}`;

const decodePlaceId = (value: string | undefined): string | null => {
  if (!value || !value.startsWith("PLACE#")) {
    return null;
  }
  return value.slice("PLACE#".length);
};

const decodeEdge = (
  value: string | undefined
): { src: string; kind: LocationEdgeKind; dst: string } | null => {
  if (!value || !value.startsWith("EDGE#")) {
    return null;
  }
  const [, src, kind, dst] = value.split("#");
  if (!src || !kind || !dst) {
    return null;
  }
  return { src, kind: kind as LocationEdgeKind, dst };
};

export class LocationGraphIndexRepository {
  #client: DynamoDBClient;
  #tableName: string;

  constructor(options: { client: DynamoDBClient; tableName: string }) {
    if (!options.tableName) {
      throw new Error("LocationGraphIndexRepository requires a DynamoDB table name.");
    }
    this.#client = options.client;
    this.#tableName = options.tableName;
  }

  async registerPlace(chronicleId: string, placeId: string): Promise<void> {
    await this.#put(pkChronicle(chronicleId), skPlace(placeId), {
      entityType: { S: "place" },
      placeId: { S: placeId }
    });
  }

  async registerEdge(
    chronicleId: string,
    edge: { src: string; kind: LocationEdgeKind; dst: string }
  ): Promise<void> {
    const attributes: Record<string, AttributeValue> = {
      entityType: { S: "edge" },
      src: { S: edge.src },
      dst: { S: edge.dst },
      kind: { S: edge.kind }
    };
    await Promise.all([
      this.#put(pkChronicle(chronicleId), skEdge(edge.src, edge.kind, edge.dst), attributes),
      this.#put(pkPlace(edge.src), skEdge(edge.src, edge.kind, edge.dst), attributes)
    ]);
  }

  async listChroniclePlaceIds(chronicleId: string): Promise<string[]> {
    const items = await this.#query(pkChronicle(chronicleId));
    return items
      .map((item) => decodePlaceId(item.sk?.S))
      .filter((id): id is string => Boolean(id));
  }

  async listChronicleEdges(
    chronicleId: string
  ): Promise<Array<{ src: string; kind: LocationEdgeKind; dst: string }>> {
    const items = await this.#query(pkChronicle(chronicleId));
    return items
      .map((item) => decodeEdge(item.sk?.S))
      .filter((edge): edge is { src: string; kind: LocationEdgeKind; dst: string } => Boolean(edge));
  }

  async listEdgesFromPlace(
    placeId: string
  ): Promise<Array<{ src: string; kind: LocationEdgeKind; dst: string }>> {
    const items = await this.#query(pkPlace(placeId));
    return items
      .map((item) => decodeEdge(item.sk?.S))
      .filter((edge): edge is { src: string; kind: LocationEdgeKind; dst: string } => Boolean(edge));
  }

  async #put(
    pk: string,
    sk: string,
    attributes: Record<string, AttributeValue>
  ): Promise<void> {
    await this.#client.send(
      new PutItemCommand({
        TableName: this.#tableName,
        Item: {
          pk: { S: pk },
          sk: { S: sk },
          ...attributes
        }
      })
    );
  }

  async #query(pk: string) {
    const result = await this.#client.send(
      new QueryCommand({
        TableName: this.#tableName,
        KeyConditionExpression: "#pk = :pk",
        ExpressionAttributeNames: { "#pk": "pk" },
        ExpressionAttributeValues: { ":pk": { S: pk } }
      })
    );
    return result.Items ?? [];
  }
}
