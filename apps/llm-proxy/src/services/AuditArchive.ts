import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";

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

class AuditArchive {
  #bucket: string;
  #client: S3Client;

  private constructor(bucket: string, client?: S3Client) {
    this.#bucket = bucket;
    this.#client = client ?? new S3Client({});
  }

  static fromEnv(): AuditArchive | null {
    const bucket = process.env.LLM_PROXY_ARCHIVE_BUCKET;
    if (!bucket) {
      return null;
    }
    return new AuditArchive(bucket);
  }

  async record(entry: ArchiveRecord): Promise<void> {
    const id = entry.id || randomUUID();
    const timestamp = new Date();
    const key = this.#buildKey(timestamp, id, entry.nodeId);
    const body = JSON.stringify(
      {
        id,
        createdAt: timestamp.toISOString(),
        playerId: entry.playerId ?? null,
        providerId: entry.providerId,
        requestContextId: entry.requestContextId ?? null,
        request: entry.request,
        response: entry.response,
        nodeId: entry.nodeId ?? null,
        metadata: entry.metadata ?? null
      },
      (_key, value) => (typeof value === "bigint" ? Number(value) : value)
    );

    await this.#client.send(
      new PutObjectCommand({
        Bucket: this.#bucket,
        Key: key,
        Body: body,
        ContentType: "application/json"
      })
    );
  }

  #buildKey(timestamp: Date, id: string, nodeId?: string): string {
    const year = timestamp.getUTCFullYear();
    const month = String(timestamp.getUTCMonth() + 1).padStart(2, "0");
    const day = String(timestamp.getUTCDate()).padStart(2, "0");
    const segment = this.#sanitizeNodeId(nodeId);
    return `${segment}/${year}/${month}/${day}/${id}.json`;
  }

  #sanitizeNodeId(value?: string): string {
    if (!value) {
      return "unknown-node";
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return "unknown-node";
    }
    return trimmed.replace(/[^A-Za-z0-9-_]+/g, "-").slice(0, 64) || "unknown-node";
  }
}

export { AuditArchive };
