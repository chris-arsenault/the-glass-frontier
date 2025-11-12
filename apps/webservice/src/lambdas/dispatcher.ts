import { ApiGatewayManagementApi, GoneException } from '@aws-sdk/client-apigatewaymanagementapi';
import { TurnProgressEventSchema } from '@glass-frontier/dto';
import { log } from '@glass-frontier/utils';
import type { SQSHandler, SQSRecord } from 'aws-lambda';

import { ConnectionRepository } from '../services/ConnectionRepository';

const repository = new ConnectionRepository();
const clientCache = new Map<string, ApiGatewayManagementApi>();

const isGoneError = (error: unknown): boolean => {
  if (error instanceof GoneException) {
    return true;
  }
  if (typeof error === 'object' && error !== null && 'name' in error) {
    const name = (error as { name?: unknown }).name;
    return name === 'GoneException';
  }
  return false;
};

const resolveClient = (endpoint: string): ApiGatewayManagementApi => {
  const cached = clientCache.get(endpoint);
  if (cached !== undefined) {
    return cached;
  }
  const next = new ApiGatewayManagementApi({ endpoint });
  clientCache.set(endpoint, next);
  return next;
};

const serialize = (value: unknown): Uint8Array =>
  typeof value === 'string' ? Buffer.from(value) : Buffer.from(JSON.stringify(value));

const processRecord = async (record: SQSRecord): Promise<void> => {
  let payload: unknown;
  try {
    const body = typeof record.body === 'string' && record.body.length > 0 ? record.body : '{}';
    payload = JSON.parse(body);
  } catch {
    log('error', 'Progress event payload is not JSON', { messageId: record.messageId });
    return;
  }

  const parsed = TurnProgressEventSchema.safeParse(payload);
  if (!parsed.success) {
    log('error', 'Progress event failed validation', {
      messageId: record.messageId,
      reason: parsed.error.message,
    });
    return;
  }

  const eventPayload = parsed.data;
  const targets = await repository.listTargets(eventPayload.jobId);
  if (targets.length === 0) {
    return;
  }

  const data = serialize(eventPayload);

  await Promise.all(
    targets.map(async (target) => {
      const endpoint = `https://${target.domainName}/${target.stage}`;
      const client = resolveClient(endpoint);
      try {
        await client.postToConnection({
          ConnectionId: target.connectionId,
          Data: data,
        });
      } catch (error: unknown) {
        if (isGoneError(error)) {
          await repository.purgeConnection(target.connectionId);
          return;
        }
        log('error', 'Failed to push progress event', {
          connectionId: target.connectionId,
          reason: error instanceof Error ? error.message : 'unknown',
        });
      }
    })
  );
};

export const handler: SQSHandler = async (event) => {
  let sequence = Promise.resolve();
  for (const record of event.Records) {
    sequence = sequence.then(() => processRecord(record));
  }
  await sequence;
};
