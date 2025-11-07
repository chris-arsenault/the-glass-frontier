"use strict";

const DEFAULT_LEXICON = [
  {
    entityId: "faction.tempered-accord",
    entityType: "faction",
    canonicalName: "Tempered Accord Custodial Council",
    aliases: ["Tempered Accord", "Custodial Council"],
    tags: ["faction", "canon", "safety"],
    defaultState: {
      influence: "stable",
      control: ["region.auric-steppe"]
    }
  },
  {
    entityId: "faction.prismwell-kite-guild",
    entityType: "faction",
    canonicalName: "Prismwell Kite Guild",
    aliases: ["Kite Guild", "Prismwell Guild"],
    tags: ["faction", "aerial"]
  },
  {
    entityId: "faction.echo-ledger-conclave",
    entityType: "faction",
    canonicalName: "Echo Ledger Conclave",
    aliases: ["Echo Conclave", "Ledger Conclave"],
    tags: ["faction", "echo"]
  },
  {
    entityId: "region.auric-steppe",
    entityType: "region",
    canonicalName: "Auric Steppe Corridor",
    aliases: ["Auric Steppe", "Auric Corridor"],
    tags: ["region", "prismwell"],
    defaultState: {
      status: "stable",
      controllingFaction: "faction.tempered-accord",
      threats: []
    }
  },
  {
    entityId: "region.kyther-range",
    entityType: "region",
    canonicalName: "Kyther Range Vault",
    aliases: ["Kyther Range", "Kyther Vault"],
    tags: ["region", "lattice"],
    defaultState: {
      status: "stable",
      controllingFaction: null,
      threats: []
    }
  },
  {
    entityId: "region.sable-crescent",
    entityType: "region",
    canonicalName: "Sable Crescent Basin",
    aliases: ["Sable Crescent", "Crescent Basin"],
    tags: ["region", "echo"],
    defaultState: {
      status: "stable",
      controllingFaction: "faction.echo-ledger-conclave",
      threats: []
    }
  },
  {
    entityId: "anchor.prism-spire.auric-step",
    entityType: "anchor",
    canonicalName: "Auric Step Prism Spire",
    aliases: ["Auric Prism Spire", "Auric Spire"],
    tags: ["anchor", "prismwell"]
  },
  {
    entityId: "artifact.spectrum-bloom-array",
    entityType: "artifact",
    canonicalName: "Spectrum Bloom Flux Array",
    aliases: ["Spectrum Bloom", "Flux Array"],
    tags: ["artifact", "capability", "legendary"]
  }
];

function cloneEntry(entry) {
  return {
    ...entry,
    aliases: Array.isArray(entry.aliases) ? [...entry.aliases] : [],
    tags: Array.isArray(entry.tags) ? [...entry.tags] : [],
    defaultState: entry.defaultState
      ? JSON.parse(JSON.stringify(entry.defaultState))
      : undefined
  };
}

function getDefaultLexicon() {
  return DEFAULT_LEXICON.map(cloneEntry);
}

export {
  getDefaultLexicon
};
