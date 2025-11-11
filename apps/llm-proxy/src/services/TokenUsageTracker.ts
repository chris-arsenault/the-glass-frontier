import { DynamoDBClient, UpdateItemCommand, type AttributeValue } from '@aws-sdk/client-dynamodb';

type UsageRecord = Record<string, number>;

class TokenUsageTracker {
  #tableName: string;
  #client: DynamoDBClient;

  private constructor(tableName: string, client?: DynamoDBClient) {
    this.#tableName = tableName;
    this.#client = client ?? new DynamoDBClient({});
  }

  static fromEnv(): TokenUsageTracker | null {
    const tableName = process.env.LLM_PROXY_USAGE_TABLE;
    if (!tableName) {
      return null;
    }
    return new TokenUsageTracker(tableName);
  }

  async record(
    playerId: string | undefined,
    usage: unknown,
    timestamp = new Date()
  ): Promise<void> {
    if (!playerId) {
      return;
    }
    const summary = this.#flattenUsage(usage);
    if (Object.keys(summary).length === 0) {
      return;
    }

    const period = this.#usagePeriod(timestamp);
    const setParts = [
      '#updatedAt = :updated_at',
      '#requestTotal = if_not_exists(#requestTotal, :zero) + :one',
    ];

    const names: Record<string, string> = {
      '#updatedAt': 'updated_at',
      '#requestTotal': 'total_requests',
    };

    const values: Record<string, AttributeValue> = {
      ':updated_at': { S: timestamp.toISOString() },
      ':zero': { N: '0' },
      ':one': { N: '1' },
    };

    const addParts: string[] = [];
    let index = 0;
    for (const [metric, value] of Object.entries(summary)) {
      index += 1;
      const attrAlias = `#metric${index}`;
      const valueAlias = `:metric${index}`;
      names[attrAlias] = this.#metricAttributeName(metric);
      values[valueAlias] = { N: value.toString() };
      addParts.push(`${attrAlias} ${valueAlias}`);
    }

    const expressionSegments = [`SET ${setParts.join(', ')}`];
    if (addParts.length > 0) {
      expressionSegments.push(`ADD ${addParts.join(', ')}`);
    }

    await this.#client.send(
      new UpdateItemCommand({
        TableName: this.#tableName,
        Key: {
          player_id: { S: playerId },
          usage_period: { S: period },
        },
        UpdateExpression: expressionSegments.join(' '),
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      })
    );
  }

  #usagePeriod(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  #flattenUsage(candidate: unknown): UsageRecord {
    if (!candidate || typeof candidate !== 'object') {
      return {};
    }
    const summary: UsageRecord = {};
    this.#walkUsage(candidate as Record<string, unknown>, summary, []);
    return summary;
  }

  #walkUsage(value: unknown, summary: UsageRecord, path: string[]): void {
    if (typeof value === 'number' && Number.isFinite(value)) {
      const key = path.join('_');
      if (key) {
        summary[key] = (summary[key] ?? 0) + value;
      }
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((entry, index) => {
        this.#walkUsage(entry, summary, [...path, String(index)]);
      });
      return;
    }

    if (value && typeof value === 'object') {
      for (const [key, nested] of Object.entries(value)) {
        this.#walkUsage(nested, summary, [...path, key]);
      }
    }
  }

  #metricAttributeName(raw: string): string {
    const safe = raw.replace(/[^A-Za-z0-9_]+/g, '_').slice(0, 80);
    return `metric_${safe || 'unknown'}`;
  }
}

export { TokenUsageTracker };
