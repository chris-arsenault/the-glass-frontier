import type { TextEmbeddingClient } from '@glass-frontier/llm-client/embeddings';
import type { WorldSchemaStore } from '@glass-frontier/worldstate';

const EMBEDDING_BATCH_SIZE = 16;

export const embedMissingEntities = async (
  world: WorldSchemaStore,
  embeddings: TextEmbeddingClient
): Promise<number> => {
  const embedBatch = async (embedded: number): Promise<number> => {
    const sources = await world.listMissingEntityEmbeddings(EMBEDDING_BATCH_SIZE);
    if (sources.length === 0) {
      return embedded;
    }
    await Promise.all(sources.map(async (source) => {
      const embedding = await embeddings.embed(source.text);
      await world.saveEntityEmbedding(source.id, embedding);
    }));
    return embedBatch(embedded + sources.length);
  };
  return embedBatch(0);
};
