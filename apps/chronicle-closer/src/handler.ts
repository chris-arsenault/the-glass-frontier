import {
  createAppStore,
  createPool,
  createLambdaPool,
  useLambdaRuntime,
} from '@glass-frontier/app';
import type { ChronicleClosureEvent } from '@glass-frontier/dto';
import { ChronicleClosureEventSchema } from '@glass-frontier/dto';
import { createLLMClient, loadOpenAiApiKeyFromSecrets } from '@glass-frontier/llm-client';
import { log } from '@glass-frontier/utils';
import { createChronicleStore, createWorldSchemaStore } from '@glass-frontier/worldstate';
import type { SQSBatchResponse, SQSHandler, SQSRecord } from 'aws-lambda';

import { ChronicleClosureProcessor } from './processor';

let processorPromise: Promise<ChronicleClosureProcessor> | undefined;

const initializeProcessor = async (): Promise<ChronicleClosureProcessor> => {
  const lambdaRuntime = useLambdaRuntime();
  const pool = lambdaRuntime
    ? createLambdaPool()
    : createPool({ connectionString: requireDatabaseUrl() });
  if (lambdaRuntime) {
    await loadOpenAiApiKeyFromSecrets();
  }
  const appStore = createAppStore({ pool });
  return new ChronicleClosureProcessor({
    chronicleStore: createChronicleStore({ pool }),
    llmClient: createLLMClient({ pool }),
    modelConfigStore: appStore.modelConfigStore,
    templateManager: appStore.promptTemplateManager,
    worldStore: createWorldSchemaStore({ pool }),
  });
};

const getProcessor = (): Promise<ChronicleClosureProcessor> => {
  processorPromise ??= initializeProcessor();
  return processorPromise;
};

const requireDatabaseUrl = (): string => {
  const connectionString = process.env.GLASS_FRONTIER_DATABASE_URL;
  if (connectionString === undefined || connectionString.trim().length === 0) {
    throw new Error('GLASS_FRONTIER_DATABASE_URL must be configured for the chronicle closer.');
  }
  return connectionString;
};

const parseRecord = (record: SQSRecord): ChronicleClosureEvent => {
  const payload: unknown = JSON.parse(record.body);
  return ChronicleClosureEventSchema.parse(payload);
};

const processRecord = async (record: SQSRecord): Promise<string | null> => {
  try {
    const payload = parseRecord(record);
    const processor = await getProcessor();
    await processor.process(payload);
    return null;
  } catch (error) {
    log('error', 'chronicle-closer.processing-failed', {
      messageId: record.messageId,
      reason: error instanceof Error ? error.message : 'unknown',
    });
    return record.messageId;
  }
};

export const handler: SQSHandler = async (event): Promise<SQSBatchResponse> => {
  const results = await Promise.all(event.Records.map(processRecord));
  return {
    batchItemFailures: results
      .filter((messageId): messageId is string => messageId !== null)
      .map((itemIdentifier) => ({ itemIdentifier })),
  };
};
