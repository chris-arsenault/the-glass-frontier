export const CONNECTION_STATES = {
  CONNECTING: "connecting",
  READY: "ready",
  FALLBACK: "fallback",
  CLOSED: "closed",
  ERROR: "error",
  OFFLINE: "offline"
};

export const EMPTY_OVERLAY = () => ({
  revision: 0,
  character: {
    name: "Avery Glass",
    pronouns: "they/them",
    archetype: "Wayfarer",
    background: "Former archivist tracking lost frontier tech.",
    stats: {
      ingenuity: 1,
      resolve: 1,
      finesse: 2,
      presence: 1,
      weird: 0,
      grit: 1
    },
    tags: [
      "region.auric-steppe",
      "faction.prismwell-kite-guild",
      "anchor.prism-spire.auric-step"
    ]
  },
  inventory: [
    { id: "compass", name: "Glass Frontier Compass", tags: ["narrative-anchor"] }
  ],
  relationships: [
    {
      id: "faction.prismwell-kite-guild",
      name: "Prismwell Kite Guild",
      status: "trusted",
      bond: 2
    },
    {
      id: "faction.cinder-scout-collective",
      name: "Cinder Scout Collective",
      status: "guarded",
      bond: 1
    }
  ],
  capabilityReferences: [],
  momentum: {
    current: 0,
    floor: -2,
    ceiling: 3,
    baseline: 0,
    history: []
  },
  pendingOfflineReconcile: false,
  lastChangeCursor: null,
  lastAcknowledgedCursor: null,
  lastUpdatedAt: null,
  lastSyncedAt: null
});

export const PIPELINE_FILTERS = ["all", "alerts", "runs"];

export const DEFAULT_PIPELINE_PREFERENCES = {
  filter: "all",
  timelineExpanded: false,
  acknowledged: []
};

export const DEFAULT_MODERATION_STATE = {
  alerts: [],
  decisions: [],
  stats: {
    total: 0,
    live: 0,
    queued: 0,
    escalated: 0,
    resolved: 0
  }
};
