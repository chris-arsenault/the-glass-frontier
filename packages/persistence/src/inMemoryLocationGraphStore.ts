import { randomUUID } from "node:crypto";
import {
  LocationGraphSnapshot,
  LocationPlan,
  LocationPlace,
  LocationState,
  LocationSummary,
  LocationCertainty,
  LocationEdgeKind
} from "@glass-frontier/dto";
import type { LocationGraphStore } from "./locationGraphStore";
import { executeLocationPlan, type PlanMutationAdapter } from "./locationGraphPlan";

const edgeKey = (src: string, kind: LocationEdgeKind, dst: string) => `${src}|${kind}|${dst}`;

export class InMemoryLocationGraphStore implements LocationGraphStore {
  #places = new Map<string, LocationPlace>();
  #edges = new Set<string>();
  #states = new Map<string, LocationState>();

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
      description: input.description,
      tags: input.tags ?? [],
      createdAt: Date.now()
    };
    this.#places.set(place.id, place);
    const state: LocationState = {
      characterId: input.characterId,
      chronicleId: input.chronicleId,
      anchorPlaceId: place.id,
      certainty: "exact",
      status: [],
      updatedAt: Date.now()
    };
    this.#states.set(input.characterId, state);
    return place;
  }

  async getChronicleGraph(chronicleId: string): Promise<LocationGraphSnapshot> {
    const places = Array.from(this.#places.values()).filter(
      (place) => place.chronicleId === chronicleId
    );
    const placeIds = new Set(places.map((place) => place.id));
    const edges = Array.from(this.#edges)
      .map((key) => {
        const [src, kind, dst] = key.split("|");
        return { src, kind: kind as LocationEdgeKind, dst };
      })
      .filter((edge) => placeIds.has(edge.src) || placeIds.has(edge.dst))
      .map((edge) => ({
        chronicleId,
        src: edge.src,
        dst: edge.dst,
        kind: edge.kind,
        createdAt: Date.now()
      }));
    return {
      chronicleId,
      places,
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
        const realId = randomUUID();
        const record: LocationPlace = {
          id: realId,
          chronicleId: input.chronicleId,
          name: place.name,
          kind: place.kind,
          tags: place.tags ?? [],
          description: place.description,
          createdAt: Date.now()
        };
        this.#places.set(realId, record);
        return realId;
      },
      createEdge: async (edge) => {
        this.#edges.add(edgeKey(edge.src, edge.kind, edge.dst));
      },
      setCanonicalParent: async (childId, parentId) => {
        const existing = this.#places.get(childId);
        if (!existing) {
          return;
        }
        this.#places.set(childId, { ...existing, canonicalParentId: parentId });
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
    this.#states.set(input.characterId, nextState);
    return nextState;
  }

  async getLocationState(characterId: string): Promise<LocationState | null> {
    return this.#states.get(characterId) ?? null;
  }

  async summarizeCharacterLocation(input: {
    chronicleId: string;
    characterId: string;
  }): Promise<LocationSummary | null> {
    const state = await this.getLocationState(input.characterId);
    if (!state?.anchorPlaceId) {
      return null;
    }
    const breadcrumb = this.#buildBreadcrumb(state.anchorPlaceId, input.chronicleId);
    if (!breadcrumb.length) {
      return null;
    }
    const tags = Array.from(
      new Set(
        breadcrumb.flatMap((entry) => {
          const place = this.#places.get(entry.id);
          return place?.tags ?? [];
        })
      )
    );
    return {
      anchorPlaceId: state.anchorPlaceId,
      breadcrumb: breadcrumb.map((entry) => ({
        id: entry.id,
        name: entry.name,
        kind: entry.kind
      })),
      tags,
      status: state.status ?? [],
      certainty: state.certainty,
      description: this.#places.get(state.anchorPlaceId)?.description
    };
  }

  #buildBreadcrumb(placeId: string, chronicleId: string) {
    const path: Array<{ id: string; name: string; kind: string }> = [];
    let current: LocationPlace | undefined = this.#places.get(placeId);
    while (current && current.chronicleId === chronicleId) {
      path.unshift({
        id: current.id,
        name: current.name,
        kind: current.kind
      });
      if (!current.canonicalParentId) {
        break;
      }
      current = this.#places.get(current.canonicalParentId);
    }
    return path;
  }
}
