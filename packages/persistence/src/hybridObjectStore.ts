import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  paginateListObjectsV2,
} from '@aws-sdk/client-s3';
import { fromEnv } from '@aws-sdk/credential-providers';
import { Readable } from 'node:stream';

const isNotFound = (error: unknown): boolean => {
  const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404;
};

export interface HybridObjectStoreOptions {
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
    if (!options.bucket) {
      throw new Error('HybridObjectStore requires a bucket name.');
    }

    this.#bucket = options.bucket;
    this.#prefix = options.prefix ? options.prefix.replace(/\/+$/, '') + '/' : '';

    const credentials =
      process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? fromEnv() : undefined;

    this.#client =
      options.client ??
      new S3Client({
        region:
          options.region ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'us-east-1',
        credentials,
      });
  }

  protected buildKey(relativeKey: string): string {
    const sanitized = relativeKey.replace(/^\/+/, '');
    return `${this.#prefix}${sanitized}`;
  }

  protected stripPrefix(fullKey: string): string {
    return this.#prefix ? fullKey.slice(this.#prefix.length) : fullKey;
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
        Bucket: this.#bucket,
        Key: this.buildKey(relativeKey),
        Body: payload,
        ContentType: 'application/json',
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
    const paginator = paginateListObjectsV2(
      { client: this.#client },
      {
        Bucket: this.#bucket,
        Prefix: fullPrefix,
        Delimiter: options?.shallow ? '/' : undefined,
      }
    );

    for await (const page of paginator) {
      for (const obj of page.Contents ?? []) {
        if (!obj.Key) continue;
        if (options?.suffix && !obj.Key.endsWith(options.suffix)) continue;
        results.push(this.stripPrefix(obj.Key));
      }
    }

    return results;
  }

  protected async getJson<T>(relativeKey: string): Promise<T | null> {
    const text = await this.get(relativeKey);
    return text ? (JSON.parse(text) as T) : null;
  }

  protected async setJson(relativeKey: string, payload: unknown): Promise<void> {
    await this.set(relativeKey, Buffer.from(JSON.stringify(payload, null, 2), 'utf-8'));
  }

  async #readBody(body: unknown): Promise<string | null> {
    if (!body) {
      return null;
    }
    if (typeof body === 'string') {
      return body;
    }
    if (Buffer.isBuffer(body)) {
      return body.toString('utf-8');
    }
    if (typeof (body as any).transformToString === 'function') {
      return (body as any).transformToString('utf-8');
    }
    if (typeof (body as any).arrayBuffer === 'function') {
      const arrayBuffer = await (body as any).arrayBuffer();
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
