import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { log } from '@glass-frontier/utils';
import { randomUUID } from 'node:crypto';

type ArchiveRecord = {
  id: string;
  playerId?: string;
  providerId: string;
  request: Record<string, unknown>;
  response: unknown;
  requestContextId?: string;
  nodeId?: string;
  metadata?: Record<string, unknown>;
};

const UNKNOWN_NODE_ID = 'unknown-node';

class AuditArchive {
  readonly #bucket: string;
  readonly #client: S3Client;

  private constructor(bucket: string, client?: S3Client) {
    this.#bucket = bucket;
    this.#client = client ?? new S3Client({});
  }

  static fromEnv(): AuditArchive | null {
    const rawBucket = process.env.LLM_PROXY_ARCHIVE_BUCKET;
    if (typeof rawBucket !== 'string') {
      return null;
    }
    const bucket = rawBucket.trim();
    if (bucket.length === 0) {
      return null;
    }
    return new AuditArchive(bucket);
  }

  async record(entry: ArchiveRecord): Promise<void> {
    const id =
      typeof entry.id === 'string' && entry.id.trim().length > 0 ? entry.id.trim() : randomUUID();
    const timestamp = new Date();
    const key = this.#buildKey(timestamp, id, entry.nodeId);
    const payload = {
      createdAt: timestamp.toISOString(),
      id,
      metadata: entry.metadata ?? null,
      nodeId: entry.nodeId ?? null,
      playerId: entry.playerId ?? null,
      providerId: entry.providerId,
      request: entry.request,
      requestContextId: entry.requestContextId ?? null,
      response: entry.response,
    };
    const body = JSON.stringify(payload, (_key, value) =>
      typeof value === 'bigint' ? Number(value) : value
    );

    await this.#client.send(
      new PutObjectCommand({
        Body: body,
        Bucket: this.#bucket,
        ContentType: 'application/json',
        Key: key,
      })
    );
    log('info', `Wrote ${id} to audit log.`);
  }

  #buildKey(timestamp: Date, id: string, nodeId?: string): string {
    const year = timestamp.getUTCFullYear();
    const month = String(timestamp.getUTCMonth() + 1).padStart(2, '0');
    const day = String(timestamp.getUTCDate()).padStart(2, '0');
    const segment = this.#sanitizeNodeId(nodeId);
    return `${segment}/${year}/${month}/${day}/${id}.json`;
  }

  #sanitizeNodeId(value?: string): string {
    if (typeof value !== 'string') {
      return UNKNOWN_NODE_ID;
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return UNKNOWN_NODE_ID;
    }
    const normalized = trimmed.replace(/[^A-Za-z0-9-_]+/g, '-').slice(0, 64);
    return normalized.length > 0 ? normalized : UNKNOWN_NODE_ID;
  }
}

export { AuditArchive };
