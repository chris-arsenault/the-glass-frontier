import {
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
  DeleteItemCommand,
  type AttributeValue,
} from '@aws-sdk/client-dynamodb';
import { resolveAwsEndpoint, resolveAwsRegion } from '@glass-frontier/utils';

export type HybridIndexRepositoryOptions = {
  tableName: string;
  client?: DynamoDBClient;
  region?: string;
}

export abstract class HybridIndexRepository {
  readonly #client: DynamoDBClient;
  readonly #tableName: string;

  constructor(options: HybridIndexRepositoryOptions) {
    if (typeof options.tableName !== 'string' || options.tableName.trim().length === 0) {
      throw new Error('HybridIndexRepository requires a table name.');
    }

    this.#tableName = options.tableName;
    const region = options.region ?? resolveAwsRegion();
    const endpoint = resolveAwsEndpoint('dynamodb');
    this.#client =
      options.client ??
      new DynamoDBClient({
        endpoint,
        region,
      });
  }

  protected async put(
    pk: string,
    sk: string,
    attributes: Record<string, AttributeValue>
  ): Promise<void> {
    await this.#client.send(
      new PutItemCommand({
        Item: {
          pk: { S: pk },
          sk: { S: sk },
          ...attributes,
        },
        TableName: this.#tableName,
      })
    );
  }

  protected async delete(pk: string, sk: string): Promise<void> {
    await this.#client.send(
      new DeleteItemCommand({
        Key: {
          pk: { S: pk },
          sk: { S: sk },
        },
        TableName: this.#tableName,
      })
    );
  }

  protected async query(pk: string): Promise<Array<Record<string, AttributeValue>>> {
    const result = await this.#client.send(
      new QueryCommand({
        ExpressionAttributeNames: { '#pk': 'pk' },
        ExpressionAttributeValues: { ':pk': { S: pk } },
        KeyConditionExpression: '#pk = :pk',
        TableName: this.#tableName,
      })
    );
    return result.Items ?? [];
  }

  protected async listByPrefix<T>(
    pk: string,
    prefix: string,
    decoder: (item: Record<string, AttributeValue>) => T | null,
    options?: { sort?: (a: T, b: T) => number }
  ): Promise<T[]> {
    const items = await this.query(pk);
    const output = items
      .filter((item) => {
        const sortKey = item.sk?.S ?? null;
        return typeof sortKey === 'string' && sortKey.startsWith(prefix);
      })
      .map(decoder)
      .filter((entry): entry is T => entry !== null);
    if (typeof options?.sort === 'function') {
      return [...output].sort(options.sort);
    }
    return output;
  }
}
