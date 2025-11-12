import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { TurnProgressEvent, TurnProgressPayload } from '@glass-frontier/dto';
import { log } from '@glass-frontier/utils';
import type { GraphContext } from './types';

export type TurnProgressStatus = 'start' | 'success' | 'error';

export interface TurnProgressUpdate {
  jobId: string;
  chronicleId: string;
  turnSequence: number;
  nodeId: string;
  step: number;
  total: number;
  status: TurnProgressStatus;
  context: GraphContext;
}

export interface TurnProgressPublisher {
  publish(update: TurnProgressUpdate): Promise<void>;
}

const buildPayload = (context: GraphContext): TurnProgressPayload => ({
  playerIntent: context.playerIntent,
  skillCheckPlan: context.skillCheckPlan,
  skillCheckResult: context.skillCheckResult,
  gmMessage: context.gmMessage,
  systemMessage: context.systemMessage,
  gmSummary: context.gmSummary,
  failure: context.failure,
  inventoryDelta: context.inventoryDelta ?? undefined,
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
      jobId: update.jobId,
      chronicleId: update.chronicleId,
      turnSequence: update.turnSequence,
      nodeId: update.nodeId,
      step: update.step,
      total: update.total,
      status: update.status,
      payload:
        update.status === 'success'
          ? buildPayload(update.context)
          : update.status === 'error'
            ? buildPayload(update.context)
            : undefined,
    };

    try {
      await this.client.send(
        new SendMessageCommand({
          QueueUrl: this.queueUrl,
          MessageBody: JSON.stringify(event),
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
