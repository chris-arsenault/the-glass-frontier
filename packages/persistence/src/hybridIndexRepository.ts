import {
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
  type AttributeValue,
} from '@aws-sdk/client-dynamodb';

export interface HybridIndexRepositoryOptions {
  tableName: string;
  client?: DynamoDBClient;
  region?: string;
}

export abstract class HybridIndexRepository {
  readonly #client: DynamoDBClient;
  readonly #tableName: string;

  constructor(options: HybridIndexRepositoryOptions) {
    if (!options.tableName) {
      throw new Error('HybridIndexRepository requires a table name.');
    }

    this.#tableName = options.tableName;
    this.#client =
      options.client ??
      new DynamoDBClient({
        region:
          options.region ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'us-east-1',
      });
  }

  protected async put(
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
          ...attributes,
        },
      })
    );
  }

  protected async query(pk: string) {
    const result = await this.#client.send(
      new QueryCommand({
        TableName: this.#tableName,
        KeyConditionExpression: '#pk = :pk',
        ExpressionAttributeNames: { '#pk': 'pk' },
        ExpressionAttributeValues: { ':pk': { S: pk } },
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
      .filter((item) => item.sk?.S?.startsWith(prefix))
      .map(decoder)
      .filter((entry): entry is T => Boolean(entry));
    return options?.sort ? output.sort(options.sort) : output;
  }
}
