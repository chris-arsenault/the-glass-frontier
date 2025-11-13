import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  paginateListObjectsV2,
} from '@aws-sdk/client-s3';
import { fromEnv } from '@aws-sdk/credential-providers';
import { Readable } from 'node:stream';

type TransformableBody = {
  transformToString: (encoding: BufferEncoding) => Promise<string> | string;
};

type ArrayBufferBody = {
  arrayBuffer: () => Promise<ArrayBuffer>;
};

const isNotFound = (error: unknown): boolean => {
  const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404;
};

const hasTransformToString = (input: unknown): input is TransformableBody => {
  if (typeof input !== 'object' || input === null || !('transformToString' in input)) {
    return false;
  }
  const candidate = (input as { transformToString?: unknown }).transformToString;
  return typeof candidate === 'function';
};

const hasArrayBuffer = (input: unknown): input is ArrayBufferBody => {
  if (typeof input !== 'object' || input === null || !('arrayBuffer' in input)) {
    return false;
  }
  const candidate = (input as { arrayBuffer?: unknown }).arrayBuffer;
  return typeof candidate === 'function';
};

const hasAwsCredentials = (): boolean => {
  const accessKey = process.env.AWS_ACCESS_KEY_ID ?? '';
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY ?? '';
  return accessKey.trim().length > 0 && secretKey.trim().length > 0;
};

const normalizePrefix = (prefix?: string | null): string => {
  if (typeof prefix !== 'string') {
    return '';
  }
  const trimmed = prefix.trim().replace(/\/+$/, '');
  return trimmed.length > 0 ? `${trimmed}/` : '';
};

const isNonEmptyString = (value?: string | null): value is string =>
  typeof value === 'string' && value.length > 0;

const normalizeSuffix = (suffix?: string | null): string | null => {
  if (typeof suffix !== 'string') {
    return null;
  }
  const trimmed = suffix.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export type HybridObjectStoreOptions = {
  bucket: string;
  prefix?: string | null;
  client?: S3Client;
  region?: string;
}

export abstract class HybridObjectStore {
  readonly #bucket: string;
  readonly #prefix: string;
  readonly #client: S3Client;

  constructor(options: HybridObjectStoreOptions) {
    if (typeof options.bucket !== 'string' || options.bucket.trim().length === 0) {
      throw new Error('HybridObjectStore requires a bucket name.');
    }

    this.#bucket = options.bucket;
    this.#prefix = normalizePrefix(options.prefix ?? null);

    const credentials = hasAwsCredentials() ? fromEnv() : undefined;

    this.#client =
      options.client ??
      new S3Client({
        credentials,
        region:
          options.region ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'us-east-1',
      });
  }

  protected get bucket(): string {
    return this.#bucket;
  }

  protected get prefix(): string {
    return this.#prefix;
  }

  protected get client(): S3Client {
    return this.#client;
  }

  protected buildKey(relativeKey: string): string {
    const sanitized = relativeKey.replace(/^\/+/, '');
    return `${this.#prefix}${sanitized}`;
  }

  protected stripPrefix(fullKey: string): string {
    return this.#prefix.length > 0 ? fullKey.slice(this.#prefix.length) : fullKey;
  }

  protected async get(relativeKey: string): Promise<string | null> {
    try {
      const result = await this.#client.send(
        new GetObjectCommand({
          Bucket: this.#bucket,
          Key: this.buildKey(relativeKey),
        })
      );
      return await this.#readBody(result.Body);
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  protected async set(relativeKey: string, payload: string | Uint8Array | Buffer): Promise<void> {
    await this.#client.send(
      new PutObjectCommand({
        Body: payload,
        Bucket: this.#bucket,
        ContentType: 'application/json',
        Key: this.buildKey(relativeKey),
      })
    );
  }

  protected async delete(relativeKey: string): Promise<void> {
    try {
      await this.#client.send(
        new DeleteObjectCommand({
          Bucket: this.#bucket,
          Key: this.buildKey(relativeKey),
        })
      );
    } catch (error) {
      if (!isNotFound(error)) {
        throw error;
      }
    }
  }

  protected async list(
    relativePrefix: string,
    options?: { shallow?: boolean; suffix?: string }
  ): Promise<string[]> {
    const results: string[] = [];
    const fullPrefix = this.buildKey(relativePrefix);
    const suffix = normalizeSuffix(options?.suffix ?? null);
    const paginator = paginateListObjectsV2(
      { client: this.#client },
      {
        Bucket: this.#bucket,
        Delimiter: options?.shallow === true ? '/' : undefined,
        Prefix: fullPrefix,
      }
    );

    for await (const page of paginator) {
      results.push(...this.#collectPageKeys(page.Contents ?? [], suffix));
    }

    return results;
  }

  protected async getJson<T>(relativeKey: string): Promise<T | null> {
    const text = await this.get(relativeKey);
    if (text === null) {
      return null;
    }
    return JSON.parse(text) as T;
  }

  protected async setJson(relativeKey: string, payload: unknown): Promise<void> {
    await this.set(relativeKey, Buffer.from(JSON.stringify(payload, null, 2), 'utf-8'));
  }

  #collectPageKeys(
    contents: Array<{ Key?: string | undefined }>,
    suffix: string | null
  ): string[] {
    return contents
      .map((object) => object.Key ?? null)
      .filter((key): key is string => this.#isKeyMatch(key, suffix))
      .map((key) => this.stripPrefix(key));
  }

  #isKeyMatch(key: string | null, suffix: string | null): key is string {
    if (!isNonEmptyString(key)) {
      return false;
    }
    if (suffix === null) {
      return true;
    }
    return key.endsWith(suffix);
  }

  async #readBody(body: unknown): Promise<string | null> {
    if (body === undefined || body === null) {
      return null;
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
      const arrayBuffer = await body.arrayBuffer();
      return Buffer.from(arrayBuffer).toString('utf-8');
    }
    if (body instanceof Readable) {
      return new Promise<string>((resolve, reject) => {
        const chunks: Buffer[] = [];
        body.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
        body.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        body.on('error', reject);
      });
    }
    return null;
  }
}
