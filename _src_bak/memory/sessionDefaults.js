"use strict";

const ALLOWED_SHARDS = new Set(["character", "inventory", "relationships", "momentum"]);
const CHANGE_FEED_LIMIT = 500;

const DEFAULT_CHARACTER = {
  name: "Avery Glass",
  pronouns: "they/them",
  archetype: "Wayfarer Archivist",
  background:
    "Custodian scout cataloguing resonance anomalies across the Auric Steppe Corridor for the Prismwell Kite Guild.",
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
};

const DEFAULT_LOCATION = {
  region: "Auric Steppe Corridor",
  anchorId: "anchor.prism-spire.auric-step",
  locale: "Eclipse Relay Hub",
  atmosphere:
    "Glassfall mist refracts across suspended relay pylons as Prismwell couriers converge on relays."
};

const DEFAULT_INVENTORY = [
  {
    id: "item.glass-frontier-compass",
    name: "Glass Frontier Compass",
    tags: ["narrative-anchor", "tech.tier.resonance"]
  },
  {
    id: "item.echo-ledger-fragment",
    name: "Echo Ledger Fragment",
    tags: ["lore-hook", "faction.echo-ledger-conclave"]
  }
];

const DEFAULT_RELATIONSHIPS = [
  {
    id: "faction.cinder-scout-collective",
    name: "Cinder Scout Collective",
    status: "guarded",
    bond: 1
  },
  {
    id: "faction.prismwell-kite-guild",
    name: "Prismwell Kite Guild",
    status: "trusted",
    bond: 2
  }
];

const DEFAULT_MOMENTUM = {
  current: 0,
  floor: -2,
  ceiling: 3,
  baseline: 0,
  history: []
};

export {
  ALLOWED_SHARDS,
  CHANGE_FEED_LIMIT,
  DEFAULT_CHARACTER,
  DEFAULT_LOCATION,
  DEFAULT_INVENTORY,
  DEFAULT_RELATIONSHIPS,
  DEFAULT_MOMENTUM
};
