import {
  InvokeModelCommand,
  type InvokeModelCommandOutput,
} from '@aws-sdk/client-bedrock-runtime';
import { describe, expect, it, vi } from 'vitest';

import {
  CohereTextEmbeddingClient,
  TEXT_EMBEDDING_DIMENSIONS,
  TEXT_EMBEDDING_MODEL_ID,
} from '../src/embeddings';

const vector = Array.from(
  { length: TEXT_EMBEDDING_DIMENSIONS },
  (_, index) => index / TEXT_EMBEDDING_DIMENSIONS
);

const clientOf = (): {
  client: CohereTextEmbeddingClient;
  bodies: () => Array<Record<string, unknown>>;
} => {
  const sent: unknown[] = [];
  const send = vi.fn((command: unknown): Promise<InvokeModelCommandOutput> => {
    sent.push(command);
    return Promise.resolve({
      $metadata: {},
      body: new TextEncoder().encode(JSON.stringify({ embeddings: { float: [vector] } })),
      contentType: 'application/json',
    } as unknown as InvokeModelCommandOutput);
  });
  return {
    bodies: () => sent.map((command) => {
      if (!(command instanceof InvokeModelCommand)
        || typeof command.input.body !== 'string') {
        throw new Error('Expected an InvokeModelCommand with a JSON body.');
      }
      expect(command.input.modelId).toBe(TEXT_EMBEDDING_MODEL_ID);
      return JSON.parse(command.input.body) as Record<string, unknown>;
    }),
    client: new CohereTextEmbeddingClient({ send }),
  };
};

describe('CohereTextEmbeddingClient', () => {
  it('embeds canon as a document and a search as a query', async () => {
    const { bodies, client } = clientOf();

    await expect(client.embed('Heat-road Hauler', 'document')).resolves.toEqual(vector);
    await expect(client.embed('what moves the cargo', 'query')).resolves.toEqual(vector);

    // The asymmetry is the reason for this model: a stored passage and the
    // question it answers are not textually alike, and one space cannot score
    // both relationships.
    expect(bodies().map((body) => body.input_type))
      .toEqual(['search_document', 'search_query']);
  });

  it('asks for 1024 float dimensions', async () => {
    const { bodies, client } = clientOf();

    await client.embed('Ashvane', 'document');

    expect(bodies()[0]).toEqual({
      embedding_types: ['float'],
      input_type: 'search_document',
      output_dimension: TEXT_EMBEDDING_DIMENSIONS,
      texts: ['Ashvane'],
    });
  });

  it('rejects a response whose width is not the width we asked for', async () => {
    const send = vi.fn(() => Promise.resolve({
      $metadata: {},
      body: new TextEncoder().encode(JSON.stringify({ embeddings: { float: [[0.1, 0.2]] } })),
      contentType: 'application/json',
    } as unknown as InvokeModelCommandOutput));
    const client = new CohereTextEmbeddingClient({ send });

    // A 2-wide vector reaching the store would fail against vector(1024) far
    // from here, or worse, silently after a dimension change.
    await expect(client.embed('Ashvane', 'document')).rejects.toThrow();
  });

  it('refuses empty input rather than embedding whitespace', async () => {
    const { client } = clientOf();

    await expect(client.embed('   ', 'query')).rejects.toThrow('must not be empty');
  });
});
