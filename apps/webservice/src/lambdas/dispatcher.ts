import type { SQSHandler } from 'aws-lambda';
import { ApiGatewayManagementApi, GoneException } from '@aws-sdk/client-apigatewaymanagementapi';
import { log } from '@glass-frontier/utils';
import { TurnProgressEventSchema } from '@glass-frontier/dto';
import { ConnectionRepository } from '../services/ConnectionRepository';

const repository = new ConnectionRepository();
const clientCache = new Map<string, ApiGatewayManagementApi>();

const resolveClient = (endpoint: string): ApiGatewayManagementApi => {
  const cached = clientCache.get(endpoint);
  if (cached) {
    return cached;
  }
  const next = new ApiGatewayManagementApi({ endpoint });
  clientCache.set(endpoint, next);
  return next;
};

const serialize = (value: unknown): Uint8Array =>
  typeof value === 'string' ? Buffer.from(value) : Buffer.from(JSON.stringify(value));

export const handler: SQSHandler = async (event) => {
  for (const record of event.Records) {
    let payload: unknown;
    try {
      payload = JSON.parse(record.body || '{}');
    } catch {
      log('error', 'Progress event payload is not JSON', { messageId: record.messageId });
      continue;
    }

    const parsed = TurnProgressEventSchema.safeParse(payload);
    if (!parsed.success) {
      log('error', 'Progress event failed validation', {
        messageId: record.messageId,
        reason: parsed.error.message,
      });
      continue;
    }

    const eventPayload = parsed.data;
    const targets = await repository.listTargets(eventPayload.jobId);
    if (targets.length === 0) {
      continue;
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
        } catch (error) {
          if (error instanceof GoneException || (error as any)?.name === 'GoneException') {
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
  }
};
