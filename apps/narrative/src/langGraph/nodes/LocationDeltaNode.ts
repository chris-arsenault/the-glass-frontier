import { z } from "zod";
import type { GraphNode } from "../orchestrator";
import type { GraphContext } from "../../types";
import type { LocationGraphStore } from "@glass-frontier/persistence";
import {
  LocationPlan,
  type LocationEdgeKind,
  type LocationGraphSnapshot,
  type LocationPlace
} from "@glass-frontier/dto";
import { log } from "@glass-frontier/utils";
import { composeLocationDeltaPrompt } from "../prompts/prompts";

const decisionSchema = z.object({
  action: z.enum(["no_change", "move", "uncertain"]),
  destination: z.string().min(1),
  link: z.enum(["same", "adjacent", "inside", "linked"])
});

const MAX_CHILDREN = 25;
const MAX_NEIGHBORS = 25;

export class LocationDeltaNode implements GraphNode {
  readonly id = "location-delta";
  #graphStore: LocationGraphStore;

  constructor(graphStore: LocationGraphStore) {
    this.#graphStore = graphStore;
  }

  async execute(context: GraphContext): Promise<GraphContext> {
    if (context.failure || !context.gmMessage || !context.chronicle.character?.id) {
      return context;
    }

    try {
      const plan = await this.#buildPlan(context);
      if (!plan || plan.ops.length === 0) {
        return context;
      }
      return { ...context, locationPlan: plan };
    } catch (error) {
      log("warn", "location-delta-node.failed", {
        chronicleId: context.chronicleId,
        reason: error instanceof Error ? error.message : "unknown"
      });
      return context;
    }
  }

  async #buildPlan(context: GraphContext) {
    const chronicleId = context.chronicleId;
    const characterId = context.chronicle.character?.id;
    if (!characterId) {
      return null;
    }

    const [graph, priorState] = await Promise.all([
      this.#graphStore.getChronicleGraph(chronicleId),
      this.#graphStore.getLocationState(characterId)
    ]);

    const anchorPlace = priorState ? graph.places.find((place) => place.id === priorState.anchorPlaceId) : null;
    if (!anchorPlace) {
      return null;
    }

    const placeById = new Map(graph.places.map((place) => [place.id, place]));
    const placeByName = new Map<string, LocationPlace>();
    for (const place of graph.places) {
      placeByName.set(normalizeName(place.name), place);
    }

    const parentPlace = anchorPlace.canonicalParentId
      ? placeById.get(anchorPlace.canonicalParentId) ?? null
      : null;

    const childNames = graph.places
      .filter((place) => place.canonicalParentId === anchorPlace.id)
      .slice(0, MAX_CHILDREN)
      .map((place) => place.name);

    const adjacentNames = collectNeighborNames(graph, anchorPlace.id, ["ADJACENT_TO"]).slice(
      0,
      MAX_NEIGHBORS
    );
    const linkNames = collectNeighborNames(graph, anchorPlace.id, ["LINKS_TO", "DOCKED_TO"]).slice(
      0,
      MAX_NEIGHBORS
    );

    const prompt = composeLocationDeltaPrompt({
      current: anchorPlace.name,
      parent: parentPlace?.name ?? null,
      children: childNames,
      adjacent: adjacentNames,
      links: linkNames,
      playerIntent: context.playerMessage?.content ?? "",
      gmResponse: context.gmMessage?.content ?? ""
    });

    const llmResult = await context.llm.generateText({
      prompt,
      temperature: 0.1,
      maxTokens: 400,
      metadata: { nodeId: this.id, chronicleId }
    });
    const raw = (llmResult.text ?? "").trim();
    if (!raw) {
      return null;
    }

    let decision: z.infer<typeof decisionSchema>;
    try {
      decision = decisionSchema.parse(JSON.parse(extractJsonLine(raw)));
    } catch (error) {
      log("warn", "location-delta-node.invalid-json", {
        chronicleId,
        payload: raw,
        reason: error instanceof Error ? error.message : "unknown"
      });
      return null;
    }

    return this.#decisionToPlan({
      decision,
      anchorPlace,
      parentPlace,
      placeByName,
      characterId
    });
  }

  #decisionToPlan(input: {
    decision: z.infer<typeof decisionSchema>;
    anchorPlace: LocationPlace;
    parentPlace: LocationPlace | null;
    placeByName: Map<string, LocationPlace>;
    characterId: string;
  }): LocationPlan | null {
    const { decision, anchorPlace, parentPlace, placeByName, characterId } = input;

    if (decision.action === "no_change") {
      return null;
    }

    if (decision.action === "uncertain") {
      return {
        character_id: characterId,
        ops: [
          {
            op: "SET_CERTAINTY",
            certainty: "unknown",
            note: "GM response ambiguous"
          }
        ],
        notes: "location-uncertain"
      } satisfies LocationPlan;
    }

    const normalized = normalizeName(decision.destination);
    const known = placeByName.get(normalized);

    const ops: LocationPlan["ops"] = [];
    let targetRef: string | undefined = known?.id;

    if (!targetRef) {
      const tempId = createTempId(decision.destination);
      ops.push({
        op: "CREATE_PLACE",
        place: {
          temp_id: tempId,
          name: decision.destination,
          kind: inferKind(decision.link),
          tags: []
        }
      });
      this.#appendEdgesForNewTarget({
        ops,
        link: decision.link,
        anchorId: anchorPlace.id,
        parentId: parentPlace?.id ?? anchorPlace.id,
        targetId: tempId
      });
      targetRef = tempId;
    } else {
      this.#appendEdgesForExistingTarget({
        ops,
        link: decision.link,
        anchorId: anchorPlace.id,
        targetId: targetRef,
        parentId: parentPlace?.id ?? anchorPlace.id
      });
    }

    if (!targetRef) {
      return null;
    }

    ops.push({ op: "MOVE", dst_place_id: targetRef });

    return {
      character_id: characterId,
      ops,
      notes: `move:${decision.destination}`
    } satisfies LocationPlan;
  }

  #appendEdgesForNewTarget(input: {
    ops: LocationPlan["ops"];
    link: string;
    anchorId: string;
    parentId: string;
    targetId: string;
  }) {
    const { ops, link, anchorId, parentId, targetId } = input;
    switch (link) {
      case "inside":
        ops.push({ op: "CREATE_EDGE", edge: { src: anchorId, dst: targetId, kind: "CONTAINS" } });
        break;
      case "adjacent":
        ops.push({ op: "CREATE_EDGE", edge: { src: parentId, dst: targetId, kind: "CONTAINS" } });
        ops.push({ op: "CREATE_EDGE", edge: { src: anchorId, dst: targetId, kind: "ADJACENT_TO" } });
        break;
      case "linked":
        ops.push({ op: "CREATE_EDGE", edge: { src: anchorId, dst: targetId, kind: "LINKS_TO" } });
        break;
      default:
        ops.push({ op: "CREATE_EDGE", edge: { src: anchorId, dst: targetId, kind: "ADJACENT_TO" } });
        break;
    }
  }

  #appendEdgesForExistingTarget(input: {
    ops: LocationPlan["ops"];
    link: string;
    anchorId: string;
    parentId: string;
    targetId: string;
  }) {
    const { ops, link, anchorId, parentId, targetId } = input;
    switch (link) {
      case "inside":
        ops.push({ op: "CREATE_EDGE", edge: { src: anchorId, dst: targetId, kind: "CONTAINS" } });
        break;
      case "adjacent":
        ops.push({ op: "CREATE_EDGE", edge: { src: anchorId, dst: targetId, kind: "ADJACENT_TO" } });
        break;
      case "linked":
        ops.push({ op: "CREATE_EDGE", edge: { src: anchorId, dst: targetId, kind: "LINKS_TO" } });
        break;
      default:
        ops.push({ op: "CREATE_EDGE", edge: { src: parentId, dst: targetId, kind: "CONTAINS" } });
        break;
    }
  }
}

function collectNeighborNames(
  graph: LocationGraphSnapshot,
  anchorId: string,
  kinds: LocationEdgeKind[]
): string[] {
  const names: string[] = [];
  for (const edge of graph.edges) {
    if (!kinds.includes(edge.kind as LocationEdgeKind)) {
      continue;
    }
    if (edge.src === anchorId) {
      const target = graph.places.find((place) => place.id === edge.dst);
      if (target) names.push(target.name);
    } else if (edge.dst === anchorId) {
      const target = graph.places.find((place) => place.id === edge.src);
      if (target) names.push(target.name);
    }
  }
  return dedupe(names);
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}

function createTempId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return `temp-${slug || "place"}-${Math.random().toString(16).slice(2, 6)}`;
}

function inferKind(link: string): string {
  switch (link) {
    case "inside":
      return "room";
    case "linked":
      return "structure";
    default:
      return "locale";
  }
}

function extractJsonLine(raw: string): string {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return raw;
  }
  return raw.slice(start, end + 1);
}
