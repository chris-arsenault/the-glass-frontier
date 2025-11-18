import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import type { ChronicleClosureEvent } from '@glass-frontier/dto';
import { log } from '@glass-frontier/utils';
import { resolveAwsEndpoint, resolveAwsRegion } from '@glass-frontier/node-utils';

type ChronicleClosurePublisher = {
  publish: (event: ChronicleClosureEvent) => Promise<void>;
};

class ChronicleClosureEmitter implements ChronicleClosurePublisher {
  readonly #client: SQSClient;
  readonly #queueUrl: string;
  #valid: boolean;

  constructor(queueUrl: string, client?: SQSClient) {
    const normalized = typeof queueUrl === 'string' ? queueUrl.trim() : '';
    if (normalized.length === 0) {
      this.#valid = false;
      return;
    }
    this.#queueUrl = normalized;
    if (client !== undefined) {
      this.#client = client;
      return;
    }
    const region = resolveAwsRegion();
    const endpoint = resolveAwsEndpoint('sqs');
    this.#client = new SQSClient({
      endpoint,
      region,
    });
    this.#valid = true;
  }

  async publish(event: ChronicleClosureEvent): Promise<void> {
    if (!this.#valid) {
      log('warn', 'chronicle-api.closure-enqueue-invalid', {
        chronicleId: event.chronicleId,
      });
      return;
    }

    try {
      await this.#client.send(
        new SendMessageCommand({
          MessageBody: JSON.stringify(event),
          QueueUrl: this.#queueUrl,
        })
      );
    } catch (error) {
      log('error', 'chronicle-api.closure-enqueue-failed', {
        chronicleId: event.chronicleId,
        reason: error instanceof Error ? error.message : 'unknown',
      });
    }
  }
}

export function createClosureEmitterFromEnv(): ChronicleClosurePublisher  {
  const queueUrl = process.env.CHRONICLE_CLOSURE_QUEUE_URL;
  const trimmed = queueUrl.trim();

  try {
    return new ChronicleClosureEmitter(trimmed);
  } catch (error) {
    log('error', 'Failed to initialize chronicle closure emitter', {
      reason: error instanceof Error ? error.message : 'unknown',
    });
    throw error;
  }
}

export { ChronicleClosureEmitter };
export type { ChronicleClosurePublisher };
