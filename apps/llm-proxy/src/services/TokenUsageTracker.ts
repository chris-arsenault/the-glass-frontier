import { DynamoDBClient, UpdateItemCommand, type AttributeValue } from '@aws-sdk/client-dynamodb';
import { log, resolveAwsEndpoint, resolveAwsRegion } from '@glass-frontier/utils';

type UsageRecord = Map<string, number>;

class TokenUsageTracker {
  readonly #tableName: string;
  readonly #client: DynamoDBClient;

  private constructor(tableName: string, client?: DynamoDBClient) {
    this.#tableName = tableName;
    if (client !== undefined) {
      this.#client = client;
      return;
    }
    const region = resolveAwsRegion();
    const endpoint = resolveAwsEndpoint('dynamodb');
    this.#client = new DynamoDBClient({
      endpoint,
      region,
    });
  }

  static fromEnv(): TokenUsageTracker | null {
    const rawTableName = process.env.LLM_PROXY_USAGE_TABLE;
    if (typeof rawTableName !== 'string') {
      return null;
    }
    const tableName = rawTableName.trim();
    if (tableName.length === 0) {
      return null;
    }
    return new TokenUsageTracker(tableName);
  }

  async record(
    playerId: string | undefined,
    usage: unknown,
    timestamp = new Date()
  ): Promise<void> {
    const normalizedPlayerId = this.#normalizePlayerId(playerId);
    if (normalizedPlayerId === null) {
      return;
    }
    const summary = this.#flattenUsage(usage);
    if (summary.size === 0) {
      return;
    }

    const period = this.#usagePeriod(timestamp);
    const { expression, names, values } = this.#buildUpdateComponents(summary, timestamp);

    await this.#client.send(
      new UpdateItemCommand({
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        Key: {
          player_id: { S: normalizedPlayerId },
          usage_period: { S: period },
        },
        TableName: this.#tableName,
        UpdateExpression: expression,
      })
    );
    log('info', `Updated ${normalizedPlayerId} usage data.`);
  }

  #usagePeriod(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  #flattenUsage(candidate: unknown): UsageRecord {
    if (candidate === null || typeof candidate !== 'object') {
      return new Map();
    }
    const summary: UsageRecord = new Map();
    this.#walkUsage(candidate as Record<string, unknown>, summary, []);
    return summary;
  }

  #walkUsage(value: unknown, summary: UsageRecord, path: string[]): void {
    if (typeof value === 'number' && Number.isFinite(value)) {
      const key = path.join('_');
      if (key.length > 0) {
        const current = summary.get(key) ?? 0;
        summary.set(key, current + value);
      }
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((entry, index) => {
        this.#walkUsage(entry, summary, [...path, String(index)]);
      });
      return;
    }

    if (value !== null && typeof value === 'object') {
      for (const [key, nested] of Object.entries(value)) {
        this.#walkUsage(nested, summary, [...path, key]);
      }
    }
  }

  #metricAttributeName(raw: string): string {
    const safe = raw.replace(/[^A-Za-z0-9_]+/g, '_').slice(0, 80);
    return `metric_${safe.length > 0 ? safe : 'unknown'}`;
  }

  #normalizePlayerId(playerId: string | undefined): string | null {
    if (typeof playerId !== 'string') {
      return null;
    }
    const trimmed = playerId.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  #buildUpdateComponents(
    summary: UsageRecord,
    timestamp: Date
  ): {
    expression: string;
    names: Record<string, string>;
    values: Record<string, AttributeValue>;
  } {
    const names = new Map<string, string>([
      ['#requestTotal', 'total_requests'],
      ['#updatedAt', 'updated_at'],
    ]);
    const values = new Map<string, AttributeValue>([
      [':one', { N: '1' }],
      [':updated_at', { S: timestamp.toISOString() }],
      [':zero', { N: '0' }],
    ]);

    const setParts = [
      '#updatedAt = :updated_at',
      '#requestTotal = if_not_exists(#requestTotal, :zero) + :one',
    ];
    const addParts: string[] = [];

    let index = 0;
    for (const [metric, value] of summary.entries()) {
      index += 1;
      const attrAlias = `#metric${index}`;
      const valueAlias = `:metric${index}`;
      names.set(attrAlias, this.#metricAttributeName(metric));
      values.set(valueAlias, { N: value.toString() });
      addParts.push(`${attrAlias} ${valueAlias}`);
    }

    const expressionSegments = [`SET ${setParts.join(', ')}`];
    if (addParts.length > 0) {
      expressionSegments.push(`ADD ${addParts.join(', ')}`);
    }

    return {
      expression: expressionSegments.join(' '),
      names: Object.fromEntries(names),
      values: Object.fromEntries(values),
    };
  }
}

export { TokenUsageTracker };
