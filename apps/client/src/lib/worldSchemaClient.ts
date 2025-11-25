import type {
  WorldKind,
  WorldRelationshipRule,
  WorldRelationshipType,
  WorldSchema,
} from '@glass-frontier/dto';
import { worldSchemaTrpcClient } from './worldSchemaClientTrpc';

/**
 * World Schema API client - uses tRPC under the hood
 * This maintains the same interface as the old REST client for backwards compatibility
 */
export const worldSchemaClient = {
  async getSchema(): Promise<WorldSchema> {
    return worldSchemaTrpcClient.getSchema.query();
  },

  async upsertKind(input: {
    id: string;
    category?: string | null;
    displayName?: string | null;
    defaultStatus?: string | null;
    subkinds?: string[];
    statuses?: string[];
  }): Promise<WorldKind> {
    return worldSchemaTrpcClient.upsertKind.mutate(input);
  },

  async addRelationshipType(input: { id: string; description?: string | null }): Promise<WorldRelationshipType> {
    return worldSchemaTrpcClient.addRelationshipType.mutate(input);
  },

  async upsertRelationshipRule(input: WorldRelationshipRule): Promise<void> {
    await worldSchemaTrpcClient.upsertRelationshipRule.mutate(input);
  },

  async deleteRelationshipRule(input: WorldRelationshipRule): Promise<void> {
    await worldSchemaTrpcClient.deleteRelationshipRule.mutate(input);
  },
};
