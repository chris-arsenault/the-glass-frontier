import type { TextEmbeddingClient } from '@glass-frontier/llm-client/embeddings';
import type { EncyclopediaStore, WorldSchemaStore } from '@glass-frontier/worldstate';

const EMBEDDING_BATCH_SIZE = 16;

const embedMissing = async (
  listSources: () => Promise<Array<{ id: string; text: string }>>,
  save: (id: string, embedding: number[]) => Promise<void>,
  embeddings: TextEmbeddingClient
): Promise<number> => {
  const embedBatch = async (embedded: number): Promise<number> => {
    const sources = await listSources();
    if (sources.length === 0) {
      return embedded;
    }
    await Promise.all(sources.map(async (source) => {
      // Canon is the document side: what a query is scored against, never the
      // thing doing the asking.
      const embedding = await embeddings.embed(source.text, 'document');
      await save(source.id, embedding);
    }));
    return embedBatch(embedded + sources.length);
  };
  return embedBatch(0);
};

export const embedMissingEntities = (
  world: WorldSchemaStore,
  embeddings: TextEmbeddingClient
): Promise<number> => embedMissing(
  () => world.listMissingEntityEmbeddings(EMBEDDING_BATCH_SIZE),
  (id, embedding) => world.saveEntityEmbedding(id, embedding),
  embeddings
);

export const embedMissingEncyclopediaEntries = (
  encyclopedia: EncyclopediaStore,
  embeddings: TextEmbeddingClient
): Promise<number> => embedMissing(
  () => encyclopedia.listMissingEmbeddings(EMBEDDING_BATCH_SIZE),
  (id, embedding) => encyclopedia.saveEmbedding(id, embedding),
  embeddings
);
