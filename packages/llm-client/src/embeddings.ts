import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  type InvokeModelCommandOutput,
} from '@aws-sdk/client-bedrock-runtime';
import { z } from 'zod';

export const TITAN_TEXT_EMBEDDING_DIMENSIONS = 256;
export const TITAN_TEXT_EMBEDDING_MODEL_ID = 'amazon.titan-embed-text-v2:0';

export type TextEmbeddingClient = {
  embed: (text: string) => Promise<number[]>;
};

type BedrockInvoker = Pick<BedrockRuntimeClient, 'send'>;

const TitanEmbeddingResponse = z.object({
  embedding: z.array(z.number()).length(TITAN_TEXT_EMBEDDING_DIMENSIONS),
});

const decodeResponse = (response: InvokeModelCommandOutput): unknown => {
  if (response.body === undefined) {
    throw new Error('Titan embedding response contained no body.');
  }
  return JSON.parse(new TextDecoder().decode(response.body)) as unknown;
};

export class TitanTextEmbeddingClient implements TextEmbeddingClient {
  readonly #client: BedrockInvoker;

  constructor(client?: BedrockInvoker) {
    const configuredRegion = process.env.AWS_REGION?.trim();
    this.#client = client ?? new BedrockRuntimeClient({
      region: configuredRegion === undefined || configuredRegion.length === 0
        ? 'us-east-1'
        : configuredRegion,
    });
  }

  async embed(text: string): Promise<number[]> {
    const inputText = text.trim();
    if (inputText.length === 0) {
      throw new Error('Titan embedding input must not be empty.');
    }
    const response = await this.#client.send(new InvokeModelCommand({
      accept: 'application/json',
      body: JSON.stringify({
        dimensions: TITAN_TEXT_EMBEDDING_DIMENSIONS,
        inputText,
        normalize: true,
      }),
      contentType: 'application/json',
      modelId: TITAN_TEXT_EMBEDDING_MODEL_ID,
    }));
    return TitanEmbeddingResponse.parse(decodeResponse(response)).embedding;
  }
}
