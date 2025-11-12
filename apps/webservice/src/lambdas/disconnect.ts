import { log } from '@glass-frontier/utils';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';

import { ConnectionRepository } from '../services/ConnectionRepository';

const repository = new ConnectionRepository();

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const connectionId = event.requestContext.connectionId;
  if (!connectionId) {
    return { body: 'ok', statusCode: 200 };
  }

  try {
    await repository.purgeConnection(connectionId);
  } catch (error) {
    log('warn', 'Failed to cleanup WebSocket connection', {
      connectionId,
      reason: error instanceof Error ? error.message : 'unknown',
    });
  }

  return { body: 'ok', statusCode: 200 };
};
