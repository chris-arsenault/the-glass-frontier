import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import type { ChronicleClosureEvent } from '@glass-frontier/dto';
import { resolveAwsEndpoint, resolveAwsRegion } from '@glass-frontier/node-utils';

type ChronicleClosurePublisher = {
  publish: (event: ChronicleClosureEvent) => Promise<void>;
};

class ChronicleClosureEmitter implements ChronicleClosurePublisher {
  readonly #client: SQSClient;
  readonly #queueUrl: string;

  constructor(queueUrl: string, client?: SQSClient) {
    const normalized = queueUrl.trim();
    if (normalized.length === 0) {
      throw new Error('CHRONICLE_CLOSURE_QUEUE_URL must be configured for the GM API.');
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
    await this.#client.send(
      new SendMessageCommand({
        DelaySeconds: 5,
        MessageBody: JSON.stringify(event),
        QueueUrl: this.#queueUrl,
      })
    );
  }
}

export function createClosureEmitterFromEnv(): ChronicleClosurePublisher {
  const queueUrl = process.env.CHRONICLE_CLOSURE_QUEUE_URL;
  if (queueUrl === undefined) {
    throw new Error('CHRONICLE_CLOSURE_QUEUE_URL must be configured for the GM API.');
  }
  return new ChronicleClosureEmitter(queueUrl);
}

export { ChronicleClosureEmitter };
export type { ChronicleClosurePublisher };
