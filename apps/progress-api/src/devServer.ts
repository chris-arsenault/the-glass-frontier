import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import {
  TurnProgressEventSchema,
  TurnProgressResponseSchema,
  type TurnProgressEvent,
} from '@glass-frontier/dto';
import {
  resolveAwsEndpoint,
  resolveAwsRegion,
  verifyAuthorizationHeader,
} from '@glass-frontier/node-utils';
import { log } from '@glass-frontier/utils';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

const queueUrl = process.env.TURN_PROGRESS_QUEUE_URL;
if (typeof queueUrl !== 'string' || queueUrl.trim().length === 0) {
  throw new Error('TURN_PROGRESS_QUEUE_URL must be set to run the local progress API.');
}

const port = Number.parseInt(process.env.PROGRESS_API_PORT ?? '8787', 10);
const sqs = new SQSClient({
  endpoint: resolveAwsEndpoint('sqs'),
  region: resolveAwsRegion(),
});
const eventStore = new Map<string, Map<string, TurnProgressEvent>>();

const eventIdentity = (event: TurnProgressEvent): string =>
  `${event.turnSequence}#${event.step}#${event.nodeId}#${event.status}`;

const rememberEvent = (event: TurnProgressEvent): void => {
  const events = eventStore.get(event.jobId) ?? new Map<string, TurnProgressEvent>();
  events.set(eventIdentity(event), event);
  eventStore.set(event.jobId, events);
};

const respond = (response: ServerResponse, statusCode: number, body: unknown): void => {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(body));
};

const resolveJobId = (requestUrl: string | undefined): string | null => {
  const path = new URL(requestUrl ?? '/', 'http://localhost').pathname;
  const match = /^\/progress\/([^/]+)$/u.exec(path);
  if (match === null) {
    return null;
  }
  try {
    const jobId = decodeURIComponent(match[1]).trim();
    return jobId.length > 0 ? jobId : null;
  } catch {
    return null;
  }
};

const handleRequest = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
  if (request.method === 'GET' && request.url === '/health') {
    respond(response, 200, { status: 'ok' });
    return;
  }
  if (request.method !== 'GET') {
    respond(response, 405, { error: 'method not allowed' });
    return;
  }

  const jobId = resolveJobId(request.url);
  if (jobId === null) {
    respond(response, 404, { error: 'not found' });
    return;
  }

  try {
    const identity = await verifyAuthorizationHeader(request.headers.authorization);
    const events = Array.from(eventStore.get(jobId)?.values() ?? []).filter(
      (event) => event.playerId === identity.sub
    );
    respond(response, 200, TurnProgressResponseSchema.parse({ events }));
  } catch (error: unknown) {
    log('warn', 'Local progress poll failed', {
      reason: error instanceof Error ? error.message : 'unknown',
    });
    respond(response, 401, { error: 'unauthorized' });
  }
};

const server = createServer((request, response) => {
  void handleRequest(request, response).catch((error: unknown) => {
    log('error', 'Local progress request failed', {
      reason: error instanceof Error ? error.message : 'unknown',
    });
    respond(response, 500, { error: 'progress unavailable' });
  });
});

server.listen(port, () => {
  log('info', 'Local progress API listening', { port });
});

let shuttingDown = false;

const deleteMessage = async (receiptHandle: string | undefined): Promise<void> => {
  if (receiptHandle !== undefined && receiptHandle.length > 0) {
    await sqs.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: receiptHandle }));
  }
};

const processMessage = async (body: string | undefined, receiptHandle: string | undefined): Promise<void> => {
  if (body === undefined || body.trim().length === 0) {
    await deleteMessage(receiptHandle);
    return;
  }
  try {
    rememberEvent(TurnProgressEventSchema.parse(JSON.parse(body)));
  } catch (error: unknown) {
    log('warn', 'Invalid local progress event payload', {
      reason: error instanceof Error ? error.message : 'unknown',
    });
  } finally {
    await deleteMessage(receiptHandle);
  }
};

const pollOnce = async (): Promise<void> => {
  const response = await sqs.send(
    new ReceiveMessageCommand({
      MaxNumberOfMessages: 10,
      QueueUrl: queueUrl,
      WaitTimeSeconds: 20,
    })
  );
  await Promise.all(
    (response.Messages ?? []).map((message) => processMessage(message.Body, message.ReceiptHandle))
  );
};

const pollQueue = (): Promise<void> => {
  if (shuttingDown) {
    return Promise.resolve();
  }
  return pollOnce()
    .catch((error: unknown) => {
      log('error', 'Failed to poll progress queue', {
        reason: error instanceof Error ? error.message : 'unknown',
      });
    })
    .then(pollQueue);
};

const shutdown = (): void => {
  shuttingDown = true;
  server.close(() => {
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

void pollQueue();
