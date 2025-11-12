import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import type { TurnProgressEvent, TurnProgressPayload } from '@glass-frontier/dto';
import { log } from '@glass-frontier/utils';

import type { GraphContext } from './types';

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

export type TurnProgressPublisher = {
  publish: (update: TurnProgressUpdate) => Promise<void>;
}

const buildPayload = (context: GraphContext): TurnProgressPayload => ({
  failure: context.failure,
  gmMessage: context.gmMessage,
  gmSummary: context.gmSummary,
  inventoryDelta: context.inventoryDelta ?? undefined,
  playerIntent: context.playerIntent,
  skillCheckPlan: context.skillCheckPlan,
  skillCheckResult: context.skillCheckResult,
  systemMessage: context.systemMessage,
});

export class TurnProgressEmitter implements TurnProgressPublisher {
  private readonly client: SQSClient;

  constructor(
    private readonly queueUrl: string,
    client?: SQSClient
  ) {
    if (!queueUrl) {
      throw new Error('TURN_PROGRESS_QUEUE_URL is required to emit progress events');
    }
    this.client = client ?? new SQSClient({});
  }

  async publish(update: TurnProgressUpdate): Promise<void> {
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
      status: update.status,
      step: update.step,
      total: update.total,
      turnSequence: update.turnSequence,
    };

    try {
      await this.client.send(
        new SendMessageCommand({
          MessageBody: JSON.stringify(event),
          QueueUrl: this.queueUrl,
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
