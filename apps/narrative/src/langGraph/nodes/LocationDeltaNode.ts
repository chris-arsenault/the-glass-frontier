import type { GraphNode } from "../orchestrator";
import type { GraphContext } from "../../types";
import type { LocationGraphStore } from "@glass-frontier/persistence";
import { LocationPlan } from "@glass-frontier/dto";
import { log } from "@glass-frontier/utils";

const LOCATION_PROMPT = `You are the Location Delta Planner. Decide whether a character’s location should change based on the player intent and GM response.
Return ONLY valid JSON matching the provided schema. Do not include prose.

World model:
- Places: {id, name, kind, tags[]}
- Edges: CONTAINS (parent→child), ADJACENT_TO, DOCKED_TO, LINKS_TO
- Character anchors to anchor_place_id. Prefer lowest-level moves.`;

const MAX_PLACES = 24;
const MAX_EDGES = 32;

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
      const locationPlan = await this.#resolvePlan(context);
      if (!locationPlan || !locationPlan.ops.length) {
        return context;
      }
      return {
        ...context,
        locationPlan
      };
    } catch (error) {
      log("warn", "location-delta-node.failed", {
        chronicleId: context.chronicleId,
        reason: error instanceof Error ? error.message : "unknown"
      });
      return context;
    }
  }

  async #resolvePlan(context: GraphContext) {
    const chronicleId = context.chronicleId;
    const characterId = context.chronicle.character?.id;
    if (!characterId) {
      return null;
    }

    const [graph, priorState] = await Promise.all([
      this.#graphStore.getChronicleGraph(chronicleId),
      this.#graphStore.getLocationState(characterId)
    ]);

    const payload = {
      character_id: characterId,
      prior_location: priorState
        ? {
            anchor_place_id: priorState.anchorPlaceId,
            certainty: priorState.certainty
          }
        : null,
      known_places: graph.places
        .slice(0, MAX_PLACES)
        .map((place) => ({ id: place.id, name: place.name, kind: place.kind, tags: place.tags })),
      known_edges: graph.edges
        .slice(0, MAX_EDGES)
        .map((edge) => ({ src: edge.src, dst: edge.dst, kind: edge.kind })),
      player_intent: context.playerMessage?.content ?? "",
      gm_response: context.gmMessage?.content ?? ""
    };

    const prompt = `${LOCATION_PROMPT}

Input JSON:
${JSON.stringify(payload, null, 2)}`;

    const result = await context.llm.generateJson({
      prompt,
      temperature: 0.1,
      maxTokens: 700,
      metadata: { nodeId: this.id, chronicleId }
    });
    const parsed = LocationPlan.safeParse(result.json);
    if (!parsed.success) {
      log("warn", "location-delta-node.invalid-plan", {
        chronicleId,
        message: parsed.error.message
      });
      return null;
    }
    if (!parsed.data.ops.length) {
      return null;
    }
    return parsed.data;
  }
}
