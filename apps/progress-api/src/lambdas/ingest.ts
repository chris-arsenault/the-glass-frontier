import { TurnProgressEventSchema, type TurnProgressEvent } from '@glass-frontier/dto';
import { log } from '@glass-frontier/utils';
import type { SQSBatchResponse, SQSEvent, SQSRecord } from 'aws-lambda';

import { ProgressRepository } from '../services/ProgressRepository';

export type ProgressWriter = Pick<ProgressRepository, 'store'>;

const parseRecord = (record: SQSRecord): TurnProgressEvent => {
  let body: unknown;
  try {
    body = JSON.parse(record.body);
  } catch {
    throw new Error('Progress event payload is not JSON');
  }
  return TurnProgressEventSchema.parse(body);
};

const processRecord = async (record: SQSRecord, repository: ProgressWriter): Promise<void> => {
  const progressEvent = parseRecord(record);
  await repository.store(record.messageId, progressEvent);
};

export const processProgressBatch = async (
  event: SQSEvent,
  repository: ProgressWriter
): Promise<SQSBatchResponse> => {
  const results = await Promise.all(
    event.Records.map(async (record) => {
      try {
        await processRecord(record, repository);
        return null;
      } catch (error: unknown) {
        log('error', 'Failed to retain progress event', {
          messageId: record.messageId,
          reason: error instanceof Error ? error.message : 'unknown',
        });
        return { itemIdentifier: record.messageId };
      }
    })
  );

  return {
    batchItemFailures: results.filter(
      (result): result is { itemIdentifier: string } => result !== null
    ),
  };
};

let repository: ProgressRepository | null = null;

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  repository ??= new ProgressRepository();
  return processProgressBatch(event, repository);
};
