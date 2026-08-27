import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  type InvokeModelCommandOutput,
} from '@aws-sdk/client-bedrock-runtime';
import { z } from 'zod';

/**
 * 1024 of the 1536 Matryoshka dimensions Embed v4 offers.
 *
 * Canon entries are short — a name, a kind, a paragraph of description — and
 * 1024 is already a generous representation of one. The remaining 512 cost
 * half again as much vector storage and search bandwidth for a difference
 * unlikely to show against a corpus this size.
 */
export const TEXT_EMBEDDING_DIMENSIONS = 1024;
export const TEXT_EMBEDDING_MODEL_ID = 'cohere.embed-v4:0';

/**
 * Which side of a retrieval this text is on.
 *
 * Embed v4 is trained asymmetrically, and the distinction is the reason to use
 * it: canon reads "Heat-road haulers carry bulk freight between Ashvane towns"
 * while a player asks "what's moving the cargo out here", and those are not
 * textually similar. A single symmetric space scores them on how alike the two
 * sentences are; separate query and document spaces score whether one answers
 * the other.
 */
export type EmbeddingPurpose = 'document' | 'query';

const INPUT_TYPES = new Map<EmbeddingPurpose, string>([
  ['document', 'search_document'],
  ['query', 'search_query'],
]);

export type TextEmbeddingClient = {
  embed: (text: string, purpose: EmbeddingPurpose) => Promise<number[]>;
};

type BedrockInvoker = Pick<BedrockRuntimeClient, 'send'>;

const CohereEmbeddingResponse = z.object({
  embeddings: z.object({
    float: z.array(z.array(z.number()).length(TEXT_EMBEDDING_DIMENSIONS)).min(1),
  }),
});

const decodeResponse = (response: InvokeModelCommandOutput): unknown => {
  if (response.body === undefined) {
    throw new Error('Embedding response contained no body.');
  }
  return JSON.parse(new TextDecoder().decode(response.body)) as unknown;
};

export class CohereTextEmbeddingClient implements TextEmbeddingClient {
  readonly #client: BedrockInvoker;

  constructor(client?: BedrockInvoker) {
    const configuredRegion = process.env.AWS_REGION?.trim();
    this.#client = client ?? new BedrockRuntimeClient({
      region: configuredRegion === undefined || configuredRegion.length === 0
        ? 'us-east-1'
        : configuredRegion,
    });
  }

  async embed(text: string, purpose: EmbeddingPurpose): Promise<number[]> {
    const inputText = text.trim();
    if (inputText.length === 0) {
      throw new Error('Embedding input must not be empty.');
    }
    const response = await this.#client.send(new InvokeModelCommand({
      accept: 'application/json',
      body: JSON.stringify({
        embedding_types: ['float'],
        input_type: INPUT_TYPES.get(purpose),
        output_dimension: TEXT_EMBEDDING_DIMENSIONS,
        texts: [inputText],
      }),
      contentType: 'application/json',
      modelId: TEXT_EMBEDDING_MODEL_ID,
    }));
    return CohereEmbeddingResponse.parse(decodeResponse(response)).embeddings.float[0];
  }
}
