import type {
  PlayerTemplateSlot,
  PlayerTemplateVariant,
  PromptTemplateId,
} from '@glass-frontier/dto';
import { Readable } from 'node:stream';

export const OFFICIAL_VARIANT_ID = 'official';
export const DEFAULT_PLAYER_PREFIX = 'players';

export const isNonEmptyString = (value?: string | null): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export type TransformableBody = {
  transformToString: (encoding: BufferEncoding) => Promise<string> | string;
};

export type ArrayBufferBody = {
  arrayBuffer: () => Promise<ArrayBuffer>;
};

export const hasTransformToString = (input: unknown): input is TransformableBody => {
  if (typeof input !== 'object' || input === null || !('transformToString' in input)) {
    return false;
  }
  const candidate = (input as { transformToString?: unknown }).transformToString;
  return typeof candidate === 'function';
};

export const hasArrayBuffer = (input: unknown): input is ArrayBufferBody => {
  if (typeof input !== 'object' || input === null || !('arrayBuffer' in input)) {
    return false;
  }
  const candidate = (input as { arrayBuffer?: unknown }).arrayBuffer;
  return typeof candidate === 'function';
};

type TemplateOverrideMap = Map<PromptTemplateId, PlayerTemplateSlot>;

export const toOverrideMap = (
  overrides?: Record<string, PlayerTemplateSlot>
): TemplateOverrideMap =>
  new Map(
    Object.entries(overrides ?? {}).map(([key, value]) => [
      key as PromptTemplateId,
      value,
    ])
  );

export const fromOverrideMap = (overrides: TemplateOverrideMap): Record<string, PlayerTemplateSlot> =>
  Object.fromEntries(overrides);

export const mergeVariants = (
  existing: PlayerTemplateVariant[],
  nextVariant: PlayerTemplateVariant
): PlayerTemplateVariant[] => {
  const filtered = existing.filter((variant) => variant.variantId !== nextVariant.variantId);
  return [nextVariant, ...filtered];
};

export const readBodyAsString = async (body: unknown): Promise<string> => {
  if (body === undefined || body === null) {
    throw new Error('Template body stream missing');
  }
  if (typeof body === 'string') {
    return body;
  }
  if (Buffer.isBuffer(body)) {
    return body.toString('utf-8');
  }
  if (hasTransformToString(body)) {
    const result = body.transformToString('utf-8');
    return typeof result === 'string' ? result : await result;
  }
  if (hasArrayBuffer(body)) {
    const buffer = await body.arrayBuffer();
    return Buffer.from(buffer).toString('utf-8');
  }
  if (body instanceof Readable) {
    return new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      body.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      body.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      body.on('error', reject);
    });
  }
  throw new Error('Unsupported template body type');
};
