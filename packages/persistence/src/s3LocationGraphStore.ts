import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand
} from "@aws-sdk/client-s3";
import { fromEnv } from "@aws-sdk/credential-providers";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import {
  LocationGraphSnapshot,
  LocationPlan,
  LocationPlanEdge,
  LocationPlanPlace,
  LocationPlace,
  LocationState,
  LocationSummary,
  LocationEdgeKind
} from "@glass-frontier/dto";
import type { LocationGraphStore } from "./locationGraphStore";
import { LocationGraphIndexRepository } from "./locationGraphIndexRepository";
import { executeLocationPlan, type PlanMutationAdapter } from "./locationGraphPlan";

const isNotFound = (error: unknown): boolean => {
  const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return err?.name === "NoSuchKey" || err?.$metadata?.httpStatusCode === 404;
};

const edgeKeyId = (edge: { src: string; kind: LocationEdgeKind; dst: string }) =>
  `${edge.src}-${edge.kind}-${edge.dst}`;

export class S3LocationGraphStore implements LocationGraphStore {
  #bucket: string;
  #prefix: string;
  #client: S3Client;
  #index: LocationGraphIndexRepository;
  #placeCache = new Map<string, LocationPlace>();
  #stateCache = new Map<string, LocationState>();

  constructor(options: {
    bucket: string;
    prefix?: string | null;
    client?: S3Client;
    region?: string;
    index: LocationGraphIndexRepository;
  }) {
    if (!options.bucket) {
      throw new Error("S3LocationGraphStore requires a bucket.");
    }
    this.#bucket = options.bucket;
    this.#prefix = options.prefix ? options.prefix.replace(/\/+$/, "") + "/" : "";
    this.#index = options.index;

    const credentials =
      process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? fromEnv() : undefined;
    this.#client =
      options.client ??
      new S3Client({
        region: options.region ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1",
        credentials
      });
  }

  async ensureChronicleRoot(input: {
    chronicleId: string;
    name: string;
    description?: string;
    tags?: string[];
    characterId: string;
    kind?: string;
  }): Promise<LocationPlace> {
    const place: LocationPlace = {
      id: randomUUID(),
      chronicleId: input.chronicleId,
      name: input.name,
      kind: input.kind ?? "locale",
      tags: input.tags ?? [],
      description: input.description,
      createdAt: Date.now()
    };
    await this.#writePlace(place);
    await this.#index.registerPlace(input.chronicleId, place.id);

    const state: LocationState = {
      characterId: input.characterId,
      chronicleId: input.chronicleId,
      anchorPlaceId: place.id,
      certainty: "exact",
      status: [],
      updatedAt: Date.now()
    };
    await this.#writeState(state);
    return place;
  }

  async getChronicleGraph(chronicleId: string): Promise<LocationGraphSnapshot> {
    const placeIds = await this.#index.listChroniclePlaceIds(chronicleId);
    const places = await Promise.all(
      placeIds.map((placeId) => this.#getPlace(placeId)).filter(Boolean)
    );
    const edgesMeta = await this.#index.listChronicleEdges(chronicleId);
    const edges = await Promise.all(
      edgesMeta.map(async (edge) => {
        const metadata = await this.#readJson<Record<string, unknown>>(this.#edgeKey(edge), true);
        return {
          chronicleId,
          src: edge.src,
          dst: edge.dst,
          kind: edge.kind,
          createdAt: Date.now(),
          metadata: metadata ?? undefined
        };
      })
    );
    return {
      chronicleId,
      places: places.filter((place): place is LocationPlace => Boolean(place)),
      edges
    };
  }

  async applyPlan(input: {
    chronicleId: string;
    characterId: string;
    plan: LocationPlan;
  }): Promise<LocationState | null> {
    if (!input.plan.ops.length) {
      return this.getLocationState(input.characterId);
    }

    const adapter: PlanMutationAdapter = {
      chronicleId: input.chronicleId,
      createPlace: async (place) => {
        const record = await this.#createPlace(input.chronicleId, place);
        return record.id;
      },
      createEdge: async (edge) => {
        await this.#createEdge(input.chronicleId, edge);
      },
      setCanonicalParent: async (childId, parentId) => {
        await this.#setCanonicalParent(childId, parentId);
      }
    };

    const result = await executeLocationPlan(input.plan, adapter);
    const currentState = await this.getLocationState(input.characterId);
    const anchorPlaceId = result.anchorPlaceId ?? currentState?.anchorPlaceId;
    if (!anchorPlaceId) {
      return currentState ?? null;
    }
    const nextState: LocationState = {
      characterId: input.characterId,
      chronicleId: input.chronicleId,
      anchorPlaceId,
      certainty: result.certainty ?? currentState?.certainty ?? "exact",
      status: result.status ?? currentState?.status ?? [],
      note: result.note ?? currentState?.note,
      updatedAt: Date.now()
    };
    await this.#writeState(nextState);
    return nextState;
  }

  async getLocationState(characterId: string): Promise<LocationState | null> {
    const cached = this.#stateCache.get(characterId);
    if (cached) return cached;
    const record = await this.#readJson<LocationState>(this.#stateKey(characterId));
    if (record) {
      this.#stateCache.set(characterId, record);
    }
    return record ?? null;
  }

  async summarizeCharacterLocation(input: {
    chronicleId: string;
    characterId: string;
  }): Promise<LocationSummary | null> {
    const state = await this.getLocationState(input.characterId);
    if (!state?.anchorPlaceId) {
      return null;
    }
    const breadcrumb = await this.#buildBreadcrumb(state.anchorPlaceId, input.chronicleId);
    if (!breadcrumb.length) {
      return null;
    }
    const tags = Array.from(
      new Set(
        await Promise.all(
          breadcrumb.map(async (entry) => {
            const place = await this.#getPlace(entry.id);
            return place?.tags ?? [];
          })
        ).then((list) => list.flat())
      )
    );
    return {
      anchorPlaceId: state.anchorPlaceId,
      breadcrumb,
      tags,
      status: state.status ?? [],
      certainty: state.certainty,
      description: (await this.#getPlace(state.anchorPlaceId))?.description
    };
  }

  async #createPlace(
    chronicleId: string,
    place: LocationPlanPlace
  ): Promise<LocationPlace> {
    const record: LocationPlace = {
      id: randomUUID(),
      chronicleId,
      name: place.name,
      kind: place.kind,
      tags: place.tags ?? [],
      description: place.description,
      createdAt: Date.now()
    };
    await this.#writePlace(record);
    await this.#index.registerPlace(chronicleId, record.id);
    return record;
  }

  async #createEdge(chronicleId: string, edge: LocationPlanEdge): Promise<void> {
    const entry = {
      chronicleId,
      src: edge.src,
      dst: edge.dst,
      kind: edge.kind,
      createdAt: Date.now()
    };
    await this.#writeJson(this.#edgeKey(edge), entry);
    await this.#index.registerEdge(chronicleId, edge);
  }

  async #setCanonicalParent(childId: string, parentId: string): Promise<void> {
    const place = await this.#getPlace(childId);
    if (!place) return;
    const updated: LocationPlace = { ...place, canonicalParentId: parentId };
    await this.#writePlace(updated);
  }

  async #buildBreadcrumb(placeId: string, chronicleId: string) {
    const path: Array<{ id: string; name: string; kind: string }> = [];
    let current = await this.#getPlace(placeId);
    const maxDepth = 20;
    let depth = 0;
    while (current && current.chronicleId === chronicleId && depth < maxDepth) {
      path.unshift({
        id: current.id,
        name: current.name,
        kind: current.kind
      });
      if (!current.canonicalParentId) {
        break;
      }
      current = await this.#getPlace(current.canonicalParentId);
      depth += 1;
    }
    return path;
  }

  async #getPlace(placeId: string): Promise<LocationPlace | null> {
    const cached = this.#placeCache.get(placeId);
    if (cached) return cached;
    const record = await this.#readJson<LocationPlace>(this.#placeKey(placeId));
    if (record) {
      this.#placeCache.set(placeId, record);
      return record;
    }
    return null;
  }

  async #writePlace(place: LocationPlace): Promise<void> {
    this.#placeCache.set(place.id, place);
    await this.#writeJson(this.#placeKey(place.id), place);
  }

  #placeKey(placeId: string) {
    return `${this.#prefix}location-graph/places/${placeId}.json`;
  }

  #edgeKey(edge: { src: string; kind: LocationEdgeKind; dst: string }) {
    return `${this.#prefix}location-graph/edges/${edgeKeyId(edge)}.json`;
  }

  #stateKey(characterId: string) {
    return `${this.#prefix}location-graph/states/${characterId}.json`;
  }

  async #writeState(state: LocationState): Promise<void> {
    this.#stateCache.set(state.characterId, state);
    await this.#writeJson(this.#stateKey(state.characterId), state);
  }

  async #writeJson(key: string, value: unknown): Promise<void> {
    await this.#client.send(
      new PutObjectCommand({
        Bucket: this.#bucket,
        Key: key,
        Body: JSON.stringify(value),
        ContentType: "application/json"
      })
    );
  }

  async #readJson<T>(key: string, suppressErrors = false): Promise<T | null> {
    try {
      const result = await this.#client.send(
        new GetObjectCommand({
          Bucket: this.#bucket,
          Key: key
        })
      );
      if (!result.Body) {
        return null;
      }
      const body = await streamToString(result.Body as Readable);
      return body ? (JSON.parse(body) as T) : null;
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      if (suppressErrors) {
        return null;
      }
      throw error;
    }
  }
}

async function streamToString(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.once("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    stream.once("error", (error) => reject(error));
  });
}
