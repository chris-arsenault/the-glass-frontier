import { DynamoDBClient, type WriteRequest } from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { log } from '@glass-frontier/utils';

import { websocketConfig } from './env';

const connectionKey = (id: string) => `CONNECTION#${id}`;
const jobKey = (id: string) => `JOB#${id}`;

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

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
    if (!meta) {
      throw new Error('Connection not registered');
    }
    const ttl = this.ttlFromNow(this.subscriptionTtlSeconds);
    const writes: WriteRequest[] = [
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

  async listTargets(jobId: string): Promise<JobTarget[]> {
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
      const connectionId = typeof item.connectionId === 'string' ? item.connectionId : null;
      const domainName = typeof item.domainName === 'string' ? item.domainName : null;
      const stage = typeof item.stage === 'string' ? item.stage : null;
      if (!connectionId || !domainName || !stage) {
        continue;
      }
      deduped.set(connectionId, { connectionId, domainName, stage });
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
    const deletes: WriteRequest[] = [];

    if (items.length === 0) {
      deletes.push({ DeleteRequest: { Key: { pk, sk: 'META' } } });
    }

    for (const item of items) {
      const sk = typeof item.sk === 'string' ? item.sk : undefined;
      if (!sk) {
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

    if (!result.Item) {
      return null;
    }

    const { domainName, stage, userId } = result.Item;
    if (typeof userId !== 'string' || typeof domainName !== 'string' || typeof stage !== 'string') {
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

  private async batchWrite(requests: WriteRequest[]): Promise<void> {
    if (requests.length === 0) {
      return;
    }

    for (let i = 0; i < requests.length; i += 25) {
      let pending: Record<string, WriteRequest[]> | undefined = {
        [this.tableName]: requests.slice(i, i + 25),
      };

      while (pending && Object.keys(pending).length > 0) {
        const response = await client.send(
          new BatchWriteCommand({
            RequestItems: pending,
          })
        );

        const unprocessedItems: WriteRequest[] =
          response.UnprocessedItems?.[this.tableName] ?? [];
        pending =
          unprocessedItems.length > 0 ? { [this.tableName]: unprocessedItems } : undefined;
      }
    }
  }
}
