import type {
  LocationCertainty,
  LocationPlan,
  LocationPlanEdge,
  LocationPlanOp,
  LocationPlanPlace
} from "@glass-frontier/dto";
import type { LocationEdgeKind } from "@glass-frontier/dto";

export interface PlanMutationAdapter {
  chronicleId: string;
  createPlace(place: LocationPlanPlace): Promise<string>;
  createEdge(edge: LocationPlanEdge): Promise<void>;
  setCanonicalParent(childId: string, parentId: string): Promise<void>;
}

export interface PlanExecutionResult {
  anchorPlaceId?: string;
  status?: string[];
  certainty?: LocationCertainty;
  note?: string;
}

const isContainment = (edge: LocationPlanEdge): edge is LocationPlanEdge & {
  kind: Extract<LocationEdgeKind, "CONTAINS">;
} => edge.kind === "CONTAINS";

export async function executeLocationPlan(
  plan: LocationPlan,
  adapter: PlanMutationAdapter
): Promise<PlanExecutionResult> {
  const tempToReal = new Map<string, string>();
  let anchorPlaceId: string | undefined;
  let status: string[] | undefined;
  let certainty: LocationCertainty | undefined;
  let note: string | undefined;

  const resolveId = (value: string): string => tempToReal.get(value) ?? value;

  for (const op of plan.ops) {
    await handleOp(op);
  }

  return {
    anchorPlaceId,
    status,
    certainty,
    note
  };

  async function handleOp(op: LocationPlanOp): Promise<void> {
    switch (op.op) {
      case "NO_CHANGE":
        return;
      case "CREATE_PLACE": {
        const realId = await adapter.createPlace(op.place);
        tempToReal.set(op.place.temp_id, realId);
        return;
      }
      case "CREATE_EDGE": {
        const edge = {
          src: resolveId(op.edge.src),
          dst: resolveId(op.edge.dst),
          kind: op.edge.kind
        };
        await adapter.createEdge(edge);
        if (isContainment(edge)) {
          await adapter.setCanonicalParent(edge.dst, edge.src);
        }
        return;
      }
      case "MOVE":
      case "ENTER": {
        anchorPlaceId = resolveId(op.dst_place_id);
        return;
      }
      case "EXIT":
        return;
      case "SET_STATUS": {
        status = dedupe([...(status ?? []), ...op.status]);
        return;
      }
      case "SET_CERTAINTY":
        certainty = op.certainty;
        note = op.note;
        return;
      default:
        return;
    }
  }
}

const dedupe = (values: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
  }
  return result;
};
