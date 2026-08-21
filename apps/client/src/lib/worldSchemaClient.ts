import type { WorldSchema } from '@glass-frontier/dto';

import { worldSchemaTrpcClient } from './worldSchemaClientTrpc';

/**
 * World Schema API client. Read-only: the vocabulary is versioned content in
 * `@glass-frontier/dto` and reaches the database through the seed step.
 */
export const worldSchemaClient = {
  async getSchema(): Promise<WorldSchema> {
    return worldSchemaTrpcClient.getSchema.query();
  },
};
