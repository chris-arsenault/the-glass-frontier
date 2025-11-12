import { log } from '@glass-frontier/utils';
import type { APIGatewayProxyResultV2, APIGatewayProxyWebsocketEventV2 } from 'aws-lambda';

import { ConnectionRepository } from '../services/ConnectionRepository';
import { parseSubscribeMessage } from '../types';

const repository = new ConnectionRepository();
const hasText = (value: string | null | undefined): value is string =>
  typeof value === 'string' && value.length > 0;

const badRequest = (message: string): APIGatewayProxyResultV2 => ({
  body: message,
  statusCode: 400,
});

export const handler = async (
  event: APIGatewayProxyWebsocketEventV2
): Promise<APIGatewayProxyResultV2> => {
  const connectionId = event.requestContext.connectionId;
  if (!hasText(connectionId)) {
    return badRequest('missing connection');
  }

  try {
    const payload = typeof event.body === 'string' && event.body.length > 0 ? event.body : '{}';
    const body: unknown = JSON.parse(payload);
    const message = parseSubscribeMessage(body);
    if (!hasText(message?.jobId ?? null)) {
      return badRequest('jobId required');
    }

    await repository.subscribe(message.jobId, connectionId);
    return { body: 'ok', statusCode: 200 };
  } catch (error: unknown) {
    log('error', 'Failed to subscribe connection', {
      connectionId,
      reason: error instanceof Error ? error.message : 'unknown',
    });
    return { body: 'subscription failure', statusCode: 500 };
  }
};
