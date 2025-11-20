import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { TurnProgressEventSchema } from '@glass-frontier/dto';
import { resolveAwsEndpoint, resolveAwsRegion } from '@glass-frontier/node-utils';
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

type SubscriptionMap = Map<string, Set<WebSocket>>;

const subscribers: SubscriptionMap = new Map();

const server = new WebSocketServer({ port: wsPort }, () => {
  log('info', 'Local progress WebSocket server listening', { port: wsPort });
});

const subscribe = (jobId: string, socket: WebSocket): void => {
  const trimmed = jobId.trim();
  if (trimmed.length === 0) {
    return;
  }
  const current = subscribers.get(trimmed) ?? new Set<WebSocket>();
  current.add(socket);
  subscribers.set(trimmed, current);
};

const unsubscribe = (socket: WebSocket): void => {
  for (const [jobId, sockets] of subscribers) {
    sockets.delete(socket);
    if (sockets.size === 0) {
      subscribers.delete(jobId);
    }
  }
};

const broadcast = (jobId: string, payload: unknown): void => {
  const targets = subscribers.get(jobId);
  if (!targets || targets.size === 0) {
    return;
  }
  const serialized = JSON.stringify(payload);
  for (const socket of targets) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(serialized);
    }
  }
};

server.on('connection', (socket) => {
  socket.on('message', (raw) => {
    try {
      const parsed = JSON.parse(raw.toString()) as { action?: string; jobId?: string };
      if (parsed.action === 'subscribe' && typeof parsed.jobId === 'string') {
        subscribe(parsed.jobId, socket);
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
});

let shuttingDown = false;

const pollQueue = async (): Promise<void> => {
  while (!shuttingDown) {
    try {
      const response = await sqs.send(
        new ReceiveMessageCommand({
          MaxNumberOfMessages: 10,
          QueueUrl: queueUrl,
          WaitTimeSeconds: 20,
        })
      );
      const messages = response.Messages ?? [];
      for (const message of messages) {
        const { Body, ReceiptHandle } = message;
        if (typeof Body !== 'string' || Body.trim().length === 0) {
          if (ReceiptHandle) {
            await sqs.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle }));
          }
          continue;
        }
        try {
          const parsed = TurnProgressEventSchema.parse(JSON.parse(Body));
          broadcast(parsed.jobId, parsed);
        } catch (error) {
          log('warn', 'Invalid progress event payload', {
            body: Body.slice(0, 200),
            reason: error instanceof Error ? error.message : 'unknown',
          });
        } finally {
          if (ReceiptHandle) {
            await sqs.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle }));
          }
        }
      }
    } catch (error) {
      log('error', 'Failed to poll progress queue', {
        reason: error instanceof Error ? error.message : 'unknown',
      });
    }
  }
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
