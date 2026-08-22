import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  type QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { TurnProgressEventSchema, type TurnProgressEvent } from '@glass-frontier/dto';
import { resolveAwsEndpoint, resolveAwsRegion } from '@glass-frontier/node-utils';

import { resolveProgressConfig } from './env';

const statusOrder: Record<TurnProgressEvent['status'], number> = {
  error: 2,
  start: 0,
  success: 1,
};

const jobKey = (jobId: string): string => `JOB#${jobId}`;

const eventIdentity = (event: TurnProgressEvent): string =>
  `${event.turnSequence}#${event.step}#${event.nodeId}#${event.status}`;

const eventKey = (event: TurnProgressEvent, messageId: string): string => {
  const turn = event.turnSequence.toString().padStart(10, '0');
  const step = event.step.toString().padStart(4, '0');
  const status = statusOrder[event.status].toString();
  return `EVENT#${turn}#${step}#${status}#${event.nodeId}#${messageId}`;
};

const sortEvents = (left: TurnProgressEvent, right: TurnProgressEvent): number => {
  const comparisons = [
    left.turnSequence - right.turnSequence,
    left.step - right.step,
    statusOrder[left.status] - statusOrder[right.status],
    left.nodeId.localeCompare(right.nodeId),
  ];
  return comparisons.find((comparison) => comparison !== 0) ?? 0;
};

const createClient = (): DynamoDBDocumentClient =>
  DynamoDBDocumentClient.from(
    new DynamoDBClient({
      endpoint: resolveAwsEndpoint('dynamodb'),
      region: resolveAwsRegion(),
    })
  );

export class ProgressRepository {
  private readonly client = createClient();
  private readonly config = resolveProgressConfig();

  async list(jobId: string, playerId: string): Promise<TurnProgressEvent[]> {
    const events = new Map<string, TurnProgressEvent>();
    const items = await this.queryEvents(jobId, playerId);
    for (const item of items) {
      const parsed = TurnProgressEventSchema.safeParse(item.event);
      if (parsed.success) {
        events.set(eventIdentity(parsed.data), parsed.data);
      }
    }

    return Array.from(events.values()).sort(sortEvents);
  }

  async store(messageId: string, event: TurnProgressEvent): Promise<void> {
    await this.client.send(
      new PutCommand({
        Item: {
          event,
          pk: jobKey(event.jobId),
          playerId: event.playerId,
          sk: eventKey(event, messageId),
          ttl: Math.floor(Date.now() / 1000) + this.config.eventTtlSeconds,
        },
        TableName: this.config.tableName,
      })
    );
  }

  private async queryEvents(
    jobId: string,
    playerId: string,
    exclusiveStartKey?: QueryCommandInput['ExclusiveStartKey']
  ): Promise<Array<Record<string, unknown>>> {
    const response = await this.client.send(
      new QueryCommand({
        ConsistentRead: true,
        ExclusiveStartKey: exclusiveStartKey,
        ExpressionAttributeNames: {
          '#playerId': 'playerId',
        },
        ExpressionAttributeValues: {
          ':pk': jobKey(jobId),
          ':playerId': playerId,
        },
        FilterExpression: '#playerId = :playerId',
        KeyConditionExpression: 'pk = :pk',
        TableName: this.config.tableName,
      })
    );
    const items = response.Items ?? [];
    if (response.LastEvaluatedKey === undefined) {
      return items;
    }
    return items.concat(await this.queryEvents(jobId, playerId, response.LastEvaluatedKey));
  }
}
