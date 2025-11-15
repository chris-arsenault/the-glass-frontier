import { DynamoDBClient, QueryCommand, type AttributeValue } from '@aws-sdk/client-dynamodb';
import { resolveAwsEndpoint, resolveAwsRegion } from '@glass-frontier/node-utils';
import type { TokenUsageMetric, TokenUsagePeriod } from '@glass-frontier/dto';
import { TokenUsagePeriodSchema } from '@glass-frontier/dto';

type TokenUsageStoreOptions = {
  tableName: string;
  client?: DynamoDBClient;
  region?: string;
};

type RawItem = Record<string, AttributeValue>;

const RESERVED_KEYS = new Set(['player_id', 'usage_period', 'total_requests', 'updated_at']);

export class TokenUsageStore {
  readonly #tableName: string;
  readonly #client: DynamoDBClient;

  constructor(options: TokenUsageStoreOptions) {
    if (typeof options.tableName !== 'string' || options.tableName.trim().length === 0) {
      throw new Error('TokenUsageStore requires a DynamoDB table name.');
    }
    this.#tableName = options.tableName.trim();
    const region = options.region ?? resolveAwsRegion();
    const endpoint = resolveAwsEndpoint('dynamodb');
    this.#client =
      options.client ??
      new DynamoDBClient({
        endpoint,
        region,
      });
  }

  async listUsage(playerId: string, limit = 6): Promise<TokenUsagePeriod[]> {
    const trimmedPlayer = playerId.trim();
    if (trimmedPlayer.length === 0) {
      return [];
    }
    const result = await this.#client.send(
      new QueryCommand({
        ExpressionAttributeValues: {
          ':player': { S: trimmedPlayer },
        },
        KeyConditionExpression: 'player_id = :player',
        Limit: limit,
        ScanIndexForward: false,
        TableName: this.#tableName,
      })
    );
    const items = result.Items ?? [];
    return items
      .map((item) => this.#mapItem(item))
      .filter((entry): entry is TokenUsagePeriod => entry !== null);
  }

  #mapItem(item: RawItem): TokenUsagePeriod | null {
    const period = item.usage_period?.S;
    if (typeof period !== 'string' || period.trim().length === 0) {
      return null;
    }
    const totalRequests = this.#toNumber(item.total_requests) ?? 0;
    const updatedAt = item.updated_at?.S ?? null;
    const metrics = this.#extractMetrics(item);
    const parsed = TokenUsagePeriodSchema.safeParse({
      metrics,
      period,
      totalRequests,
      updatedAt,
    });
    return parsed.success ? parsed.data : null;
  }

  #extractMetrics(item: RawItem): TokenUsageMetric[] {
    const metrics: TokenUsageMetric[] = [];
    for (const [key, value] of Object.entries(item)) {
      if (RESERVED_KEYS.has(key)) {
        continue;
      }
      const numericValue = this.#toNumber(value);
      if (numericValue === null) {
        continue;
      }
      metrics.push({
        key: this.#normalizeMetricKey(key),
        value: numericValue,
      });
    }
    metrics.sort((a, b) => b.value - a.value);
    return metrics;
  }

  #normalizeMetricKey(key: string): string {
    return key.replace(/^metric[_-]?/, '');
  }

  #toNumber(value?: AttributeValue): number | null {
    if (value === undefined || value === null || !('N' in value) || typeof value.N !== 'string') {
      return null;
    }
    const parsed = Number(value.N);
    return Number.isFinite(parsed) ? parsed : null;
  }
}
