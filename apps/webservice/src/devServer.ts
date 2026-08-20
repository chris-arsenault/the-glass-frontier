import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { TurnProgressEventSchema, type TurnProgressEvent } from '@glass-frontier/dto';
import { resolveAwsEndpoint, resolveAwsRegion, verifyJwt } from '@glass-frontier/node-utils';
import { log } from '@glass-frontier/utils';
import { WebSocketServer, WebSocket } from 'ws';

const queueUrl = process.env.TURN_PROGRESS_QUEUE_URL;
if (typeof queueUrl !== 'string' || queueUrl.trim().length === 0) {
  throw new Error('TURN_PROGRESS_QUEUE_URL must be set to run the local progress dispatcher.');
}

const wsPort = Number.parseInt(process.env.PROGRESS_WS_PORT ?? '8787', 10);
const region = resolveAwsRegion();
const endpoint = resolveAwsEndpoint('sqs');
const sqs = new SQSClient({
  endpoint,
  region,
});

type SubscriptionMap = Map<string, Map<WebSocket, string>>;

const subscribers: SubscriptionMap = new Map();

const server = new WebSocketServer({ port: wsPort }, () => {
  log('info', 'Local progress WebSocket server listening', { port: wsPort });
});

const subscribe = (jobId: string, socket: WebSocket, userId: string): void => {
  const trimmed = jobId.trim();
  if (trimmed.length === 0) {
    return;
  }
  const current = subscribers.get(trimmed) ?? new Map<WebSocket, string>();
  current.set(socket, userId);
  subscribers.set(trimmed, current);
};

const unsubscribe = (socket: WebSocket): void => {
  for (const [jobId, targets] of subscribers) {
    targets.delete(socket);
    if (targets.size === 0) {
      subscribers.delete(jobId);
    }
  }
};

const broadcast = (event: TurnProgressEvent): void => {
  const targets = subscribers.get(event.jobId);
  if (targets === undefined || targets.size === 0) {
    return;
  }
  const serialized = JSON.stringify(event);
  for (const [socket, userId] of targets) {
    if (userId === event.playerId && socket.readyState === WebSocket.OPEN) {
      socket.send(serialized);
    }
  }
};

const extractToken = (requestUrl: string | undefined): string | null => {
  if (requestUrl === undefined) {
    return null;
  }
  const token = new URL(requestUrl, 'ws://localhost').searchParams.get('token');
  return token !== null && token.trim().length > 0 ? token.trim() : null;
};

const configureSocket = async (socket: WebSocket, requestUrl: string | undefined): Promise<void> => {
  const token = extractToken(requestUrl);
  if (token === null) {
    socket.close(1008, 'authentication required');
    return;
  }
  const identity = await verifyJwt(token);
  socket.on('message', (raw) => {
    try {
      const parsed = JSON.parse(raw.toString()) as { action?: string; jobId?: string };
      if (parsed.action === 'subscribe' && typeof parsed.jobId === 'string') {
        subscribe(parsed.jobId, socket, identity.sub);
      }
    } catch (error) {
      log('warn', 'Failed to parse WS subscribe payload', {
        reason: error instanceof Error ? error.message : 'unknown',
      });
    }
  });

  socket.on('close', () => {
    unsubscribe(socket);
  });
};

server.on('connection', (socket, request) => {
  void configureSocket(socket, request.url).catch((error: unknown) => {
    log('warn', 'Local WebSocket authentication failed', {
      reason: error instanceof Error ? error.message : 'unknown',
    });
    socket.close(1008, 'authentication failed');
  });
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
    broadcast(TurnProgressEventSchema.parse(JSON.parse(body)));
  } catch (error) {
    log('warn', 'Invalid progress event payload', {
      body: body.slice(0, 200),
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
