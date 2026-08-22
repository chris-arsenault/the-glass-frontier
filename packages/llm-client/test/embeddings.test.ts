import {
  InvokeModelCommand,
  type InvokeModelCommandOutput,
} from '@aws-sdk/client-bedrock-runtime';
import { describe, expect, it, vi } from 'vitest';

import {
  TITAN_TEXT_EMBEDDING_DIMENSIONS,
  TITAN_TEXT_EMBEDDING_MODEL_ID,
  TitanTextEmbeddingClient,
} from '../src/embeddings';

describe('TitanTextEmbeddingClient', () => {
  it('requests normalized 256-dimensional Titan embeddings', async () => {
    const embedding = Array.from(
      { length: TITAN_TEXT_EMBEDDING_DIMENSIONS },
      (_, index) => index / TITAN_TEXT_EMBEDDING_DIMENSIONS
    );
    const sent: unknown[] = [];
    const send = vi.fn((command: unknown): Promise<InvokeModelCommandOutput> => {
      sent.push(command);
      return Promise.resolve({
        $metadata: {},
        body: new TextEncoder().encode(JSON.stringify({ embedding })),
        contentType: 'application/json',
      } as unknown as InvokeModelCommandOutput);
    });
    const client = new TitanTextEmbeddingClient({ send });

    await expect(client.embed('Amaya Venn')).resolves.toEqual(embedding);

    const command = sent[0];
    expect(command).toBeInstanceOf(InvokeModelCommand);
    if (!(command instanceof InvokeModelCommand)) {
      throw new Error('Expected an InvokeModelCommand.');
    }
    expect(command.input.modelId).toBe(TITAN_TEXT_EMBEDDING_MODEL_ID);
    if (typeof command.input.body !== 'string') {
      throw new Error('Expected a JSON request body.');
    }
    expect(JSON.parse(command.input.body)).toEqual({
      dimensions: TITAN_TEXT_EMBEDDING_DIMENSIONS,
      inputText: 'Amaya Venn',
      normalize: true,
    });
  });
});
