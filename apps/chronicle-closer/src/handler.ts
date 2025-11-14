import type { ChronicleClosureEvent } from '@glass-frontier/dto';
import { ChronicleClosureEventSchema } from '@glass-frontier/dto';
import { log } from '@glass-frontier/utils';
import type { SQSHandler, SQSRecord } from 'aws-lambda';

import { ChronicleClosureProcessor } from './processor';

const processor = new ChronicleClosureProcessor();

const parseRecord = (record: SQSRecord): ChronicleClosureEvent | null => {
  try {
    const payload: unknown = JSON.parse(record.body ?? '{}');
    const parsed = ChronicleClosureEventSchema.safeParse(payload);
    if (parsed.success) {
      return parsed.data;
    }
    log('warn', 'chronicle-closer.invalid-payload', {
      messageId: record.messageId,
      reason: parsed.error.message,
    });
    return null;
  } catch (error) {
    log('warn', 'chronicle-closer.payload-parse-failed', {
      messageId: record.messageId,
      reason: error instanceof Error ? error.message : 'unknown',
    });
    return null;
  }
};

export const handler: SQSHandler = async (event) => {
  await Promise.all(
    event.Records.map(async (record) => {
      const payload = parseRecord(record);
      if (payload === null) {
        return;
      }
      try {
        await processor.process(payload);
      } catch (error) {
        log('error', 'chronicle-closer.processing-failed', {
          chronicleId: payload.chronicleId,
          reason: error instanceof Error ? error.message : 'unknown',
        });
      }
    })
  );
};
