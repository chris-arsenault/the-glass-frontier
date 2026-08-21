import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import type { TurnProgressEvent, TurnProgressPayload } from '@glass-frontier/dto';
import { resolveAwsEndpoint, resolveAwsRegion } from '@glass-frontier/node-utils';
import { log } from '@glass-frontier/utils';

import type { GraphContext } from '../types';

export type TurnProgressStatus = 'start' | 'success' | 'error';

export type TurnProgressUpdate = {
  jobId: string;
  chronicleId: string;
  turnSequence: number;
  nodeId: string;
  step: number;
  total: number;
  status: TurnProgressStatus;
  context: GraphContext;
}

type TurnProgressPublisher = {
  publish: (update: TurnProgressUpdate) => Promise<void>;
}

const buildPayload = (context: GraphContext): TurnProgressPayload => {
  const optionalEntries: Array<[keyof TurnProgressPayload, unknown]> = [
    ['advancesTimeline', context.advancesTimeline],
    ['beatTracker', context.beatTracker],
    ['chronicleShouldClose', context.shouldCloseChronicle],
    ['executedNodes', context.executedNodes],
    ['gmMessage', context.gmResponse],
    ['gmSummary', context.gmSummary],
    ['gmTrace', context.gmTrace],
    ['inventoryDelta', context.inventoryDelta],
  ];
  const optionalPayload = Object.fromEntries(
    optionalEntries.filter(([, value]) => value !== undefined && value !== null)
  ) as Partial<TurnProgressPayload>;
  return {
    failure: context.failure,
    playerIntent: context.playerIntent,
    skillCheckPlan: context.skillCheckPlan,
    skillCheckResult: context.skillCheckResult,
    ...optionalPayload,
  };
};

class TurnProgressEmitter implements TurnProgressPublisher {
  readonly #client: SQSClient | undefined;
  readonly #queueUrl: string | undefined;
  readonly #valid: boolean;

  constructor(queueUrl: string, client?: SQSClient) {
    const normalizedQueueUrl = typeof queueUrl === 'string' ? queueUrl.trim() : '';
    if (normalizedQueueUrl.length === 0) {
      this.#valid = false;
      return;
    }
    this.#queueUrl = normalizedQueueUrl;
    if (client !== undefined) {
      this.#client = client;
    } else {
      const region = resolveAwsRegion();
      const endpoint = resolveAwsEndpoint('sqs');
      this.#client = new SQSClient({
        endpoint,
        region,
      });
    }
    this.#valid = true;
  }

  async publish(update: TurnProgressUpdate): Promise<void> {
    if (!this.#valid || this.#client === undefined || this.#queueUrl === undefined) {
      log('warn', 'Failed to enqueue turn progress', {
        jobId: update.jobId,
      });
      return;
    }

    const event: TurnProgressEvent = {
      chronicleId: update.chronicleId,
      jobId: update.jobId,
      nodeId: update.nodeId,
      payload:
        update.status === 'success'
          ? buildPayload(update.context)
          : update.status === 'error'
            ? buildPayload(update.context)
            : undefined,
      playerId: update.context.chronicleState.chronicle.playerId,
      status: update.status,
      step: update.step,
      total: update.total,
      turnSequence: update.turnSequence,
    };

    try {
      await this.#client.send(
        new SendMessageCommand({
          MessageBody: JSON.stringify(event),
          QueueUrl: this.#queueUrl,
        })
      );
    } catch (error) {
      log('error', 'Failed to enqueue turn progress', {
        jobId: update.jobId,
        reason: error instanceof Error ? error.message : 'unknown',
      });
    }
  }
}

export function createProgressEmitterFromEnv(): TurnProgressPublisher {
  const queueUrl = process.env.TURN_PROGRESS_QUEUE_URL?.trim() ?? '';
  return new TurnProgressEmitter(queueUrl);
}

export { TurnProgressEmitter };
export type { TurnProgressPublisher };
