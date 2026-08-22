import type { SQSEvent, SQSRecord } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';

import { processProgressBatch, type ProgressWriter } from '../src/lambdas/ingest';

const progressEvent = {
  chronicleId: 'chronicle-1',
  jobId: 'chronicle-1#1#request-1',
  nodeId: 'classifier',
  playerId: 'player-1',
  status: 'success' as const,
  step: 1,
  total: 4,
  turnSequence: 1,
};
const WRITE_FAILURE = 'write-failure';

const record = (messageId: string, body: string): SQSRecord =>
  ({ body, messageId }) as SQSRecord;

describe('progress ingestion', () => {
  it('stores valid events and reports only failed records', async () => {
    const store = vi.fn((messageId: string) =>
      messageId === WRITE_FAILURE
        ? Promise.reject(new Error('write failed'))
        : Promise.resolve()
    );
    const repository: ProgressWriter = { store };
    const event: SQSEvent = {
      Records: [
        record('valid', JSON.stringify(progressEvent)),
        record('invalid', '{'),
        record(WRITE_FAILURE, JSON.stringify(progressEvent)),
      ],
    };

    const result = await processProgressBatch(event, repository);

    expect(store).toHaveBeenCalledWith('valid', progressEvent);
    expect(result).toEqual({
      batchItemFailures: [
        { itemIdentifier: 'invalid' },
        { itemIdentifier: WRITE_FAILURE },
      ],
    });
  });
});
