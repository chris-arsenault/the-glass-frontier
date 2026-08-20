import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  type BatchWriteCommandInput,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { resolveAwsEndpoint, resolveAwsRegion } from '@glass-frontier/node-utils';
import { log } from '@glass-frontier/utils';

import { websocketConfig } from './env';

const connectionKey = (id: string): string => `CONNECTION#${id}`;
const jobKey = (id: string): string => `JOB#${id}`;

const dynamoRegion = resolveAwsRegion();
const dynamoEndpoint = resolveAwsEndpoint('dynamodb');
const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    endpoint: dynamoEndpoint,
    region: dynamoRegion,
  })
);
const hasText = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;
type DocumentWriteRequest = NonNullable<BatchWriteCommandInput['RequestItems']>[string][number];

export type ConnectionMetadata = {
  connectionId: string;
  userId: string;
  domainName: string;
  stage: string;
}

export type JobTarget = {
  connectionId: string;
  domainName: string;
  stage: string;
}

const toJobTarget = (item: Record<string, unknown>, userId: string): JobTarget | null => {
  const connectionId = hasText(item.connectionId) ? item.connectionId : null;
  const domainName = hasText(item.domainName) ? item.domainName : null;
  const stage = hasText(item.stage) ? item.stage : null;
  const subscriberId = hasText(item.userId) ? item.userId : null;
  if (
    connectionId === null ||
    domainName === null ||
    stage === null ||
    subscriberId !== userId
  ) {
    return null;
  }
  return { connectionId, domainName, stage };
};

export class ConnectionRepository {
  private readonly tableName = websocketConfig.tableName;
  private readonly connectionTtlSeconds = websocketConfig.connectionTtlSeconds;
  private readonly subscriptionTtlSeconds = websocketConfig.subscriptionTtlSeconds;

  async rememberConnection(metadata: ConnectionMetadata): Promise<void> {
    await client.send(
      new PutCommand({
        Item: {
          pk: connectionKey(metadata.connectionId),
          sk: 'META',
          ...metadata,
          ttl: this.ttlFromNow(this.connectionTtlSeconds),
        },
        TableName: this.tableName,
      })
    );
  }

  async subscribe(jobId: string, connectionId: string): Promise<void> {
    const meta = await this.getConnection(connectionId);
    if (meta === null) {
      throw new Error('Connection not registered');
    }
    const ttl = this.ttlFromNow(this.subscriptionTtlSeconds);
    const writes: DocumentWriteRequest[] = [
      {
        PutRequest: {
          Item: {
            connectionId,
            domainName: meta.domainName,
            jobId,
            pk: jobKey(jobId),
            sk: connectionKey(connectionId),
            stage: meta.stage,
            ttl,
            userId: meta.userId,
          },
        },
      },
      {
        PutRequest: {
          Item: {
            connectionId,
            jobId,
            pk: connectionKey(connectionId),
            sk: jobKey(jobId),
            ttl,
          },
        },
      },
    ];

    await this.batchWrite(writes);
  }

  async listTargets(jobId: string, userId: string): Promise<JobTarget[]> {
    const response = await client.send(
      new QueryCommand({
        ConsistentRead: true,
        ExpressionAttributeValues: {
          ':pk': jobKey(jobId),
        },
        KeyConditionExpression: 'pk = :pk',
        TableName: this.tableName,
      })
    );

    const items = response.Items ?? [];
    const deduped = new Map<string, JobTarget>();
    for (const item of items) {
      const target = toJobTarget(item, userId);
      if (target === null) {
        continue;
      }
      deduped.set(target.connectionId, target);
    }

    return Array.from(deduped.values());
  }

  async purgeConnection(connectionId: string): Promise<void> {
    const pk = connectionKey(connectionId);
    const response = await client.send(
      new QueryCommand({
        ExpressionAttributeValues: { ':pk': pk },
        KeyConditionExpression: 'pk = :pk',
        TableName: this.tableName,
      })
    );

    const items = response.Items ?? [];
    const deletes: DocumentWriteRequest[] = [];

    if (items.length === 0) {
      deletes.push({ DeleteRequest: { Key: { pk, sk: 'META' } } });
    }

    for (const item of items) {
      const sk = hasText(item.sk) ? item.sk : null;
      if (sk === null) {
        continue;
      }
      deletes.push({ DeleteRequest: { Key: { pk, sk } } });
      if (sk.startsWith('JOB#')) {
        deletes.push({ DeleteRequest: { Key: { pk: sk, sk: pk } } });
      }
    }

    await this.batchWrite(deletes);
  }

  private async getConnection(connectionId: string): Promise<ConnectionMetadata | null> {
    const result = await client.send(
      new GetCommand({
        Key: { pk: connectionKey(connectionId), sk: 'META' },
        TableName: this.tableName,
      })
    );

    if (result.Item === undefined) {
      return null;
    }

    const { domainName, stage, userId } = result.Item;
    if (!hasText(userId) || !hasText(domainName) || !hasText(stage)) {
      log('warn', 'Connection metadata missing fields', { connectionId });
      return null;
    }

    return {
      connectionId,
      domainName,
      stage,
      userId,
    };
  }

  private ttlFromNow(seconds: number): number {
    return Math.floor(Date.now() / 1000) + seconds;
  }

  private async batchWrite(requests: DocumentWriteRequest[]): Promise<void> {
    if (requests.length === 0) {
      return;
    }

    let sequence = Promise.resolve();
    for (let i = 0; i < requests.length; i += 25) {
      const batch = requests.slice(i, i + 25);
      sequence = sequence.then(() => this.#writeChunk(batch));
    }
    await sequence;
  }

  async #writeChunk(batch: DocumentWriteRequest[]): Promise<void> {
    if (batch.length === 0) {
      return;
    }
    const pending: NonNullable<BatchWriteCommandInput['RequestItems']> = {
      [this.tableName]: batch,
    };
    await this.#processBatch(pending);
  }

  async #processBatch(
    pending: NonNullable<BatchWriteCommandInput['RequestItems']>
  ): Promise<void> {
    const response = await client.send(
      new BatchWriteCommand({
        RequestItems: pending,
      })
    );
    const unprocessed = response.UnprocessedItems?.[this.tableName] ?? [];
    if (unprocessed.length > 0) {
      await this.#processBatch({ [this.tableName]: unprocessed });
    }
  }
}
