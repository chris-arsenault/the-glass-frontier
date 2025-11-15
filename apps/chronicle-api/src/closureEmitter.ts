import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import type { ChronicleClosureEvent } from '@glass-frontier/dto';
import { log, resolveAwsEndpoint, resolveAwsRegion } from '@glass-frontier/utils';

type ChronicleClosurePublisher = {
  publish: (event: ChronicleClosureEvent) => Promise<void>;
};

class ChronicleClosureEmitter implements ChronicleClosurePublisher {
  readonly #client: SQSClient;
  readonly #queueUrl: string;

  constructor(queueUrl: string, client?: SQSClient) {
    const normalized = typeof queueUrl === 'string' ? queueUrl.trim() : '';
    if (normalized.length === 0) {
      throw new Error('CHRONICLE_CLOSURE_QUEUE_URL is required');
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
  }

  async publish(event: ChronicleClosureEvent): Promise<void> {
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

export { ChronicleClosureEmitter };
export type { ChronicleClosurePublisher };
