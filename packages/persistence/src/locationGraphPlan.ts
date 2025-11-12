import type {
  LocationCertainty,
  LocationPlan,
  LocationPlanEdge,
  LocationPlanOp,
  LocationPlanPlace,
} from '@glass-frontier/dto';
import type { LocationEdgeKind } from '@glass-frontier/dto';

export type PlanMutationAdapter = {
  createPlace: (place: LocationPlanPlace) => Promise<string>;
  createEdge: (edge: LocationPlanEdge) => Promise<void>;
  setCanonicalParent: (childId: string, parentId: string) => Promise<void>;
}

export type PlanExecutionResult = {
  anchorPlaceId?: string;
  status?: string[];
  certainty?: LocationCertainty;
  note?: string;
}

const isContainment = (
  edge: LocationPlanEdge
): edge is LocationPlanEdge & {
  kind: Extract<LocationEdgeKind, 'CONTAINS'>;
} => edge.kind === 'CONTAINS';

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
  const registerPlace = (tempId: string, realId: string): void => {
    tempToReal.set(tempId, realId);
  };
  const setAnchor = (placeId: string): void => {
    anchorPlaceId = placeId;
  };
  const appendStatus = (entries: string[]): void => {
    status = dedupe([...(status ?? []), ...entries]);
  };
  const setCertaintyState = (payload: { certainty: LocationCertainty; note?: string }): void => {
    certainty = payload.certainty;
    note = payload.note;
  };

  const opHandlers = createPlanHandlers({
    adapter,
    appendStatus,
    registerPlace,
    resolveId,
    setAnchor,
    setCertainty: setCertaintyState,
  });

  let sequence = Promise.resolve();
  for (const operation of plan.ops) {
    sequence = sequence.then(() => opHandlers[operation.op](operation as never));
  }
  await sequence;

  return {
    anchorPlaceId,
    certainty,
    note,
    status,
  };
}

type PlanHandlers = {
  [K in LocationPlanOp['op']]: (
    operation: Extract<LocationPlanOp, { op: K }>
  ) => void | Promise<void>;
};

type PlanHandlerDeps = {
  adapter: PlanMutationAdapter;
  appendStatus: (entries: string[]) => void;
  registerPlace: (tempId: string, realId: string) => void;
  resolveId: (value: string) => string;
  setAnchor: (placeId: string) => void;
  setCertainty: (input: { certainty: LocationCertainty; note?: string }) => void;
};

const createPlanHandlers = (deps: PlanHandlerDeps): PlanHandlers => ({
  CREATE_EDGE: async (op) => {
    const edge = {
      dst: deps.resolveId(op.edge.dst),
      kind: op.edge.kind,
      src: deps.resolveId(op.edge.src),
    };
    await deps.adapter.createEdge(edge);
    if (isContainment(edge)) {
      await deps.adapter.setCanonicalParent(edge.dst, edge.src);
    }
  },
  CREATE_PLACE: async (op) => {
    const realId = await deps.adapter.createPlace(op.place);
    deps.registerPlace(op.place.temp_id, realId);
  },
  ENTER: (op) => {
    deps.setAnchor(deps.resolveId(op.dst_place_id));
  },
  EXIT: () => {
    // Exit currently only affects downstream systems.
  },
  MOVE: (op) => {
    deps.setAnchor(deps.resolveId(op.dst_place_id));
  },
  NO_CHANGE: () => {},
  SET_CERTAINTY: (op) => {
    deps.setCertainty({ certainty: op.certainty, note: op.note });
  },
  SET_STATUS: (op) => {
    deps.appendStatus(op.status);
  },
});

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
