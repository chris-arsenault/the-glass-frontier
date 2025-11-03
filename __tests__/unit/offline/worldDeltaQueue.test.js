"use strict";

const { extractEntities } = require("../../../src/offline/entityExtraction/entityExtractor");
const { getDefaultLexicon } = require("../../../src/offline/entityExtraction/lexicon");
const { WorldDeltaQueue } = require("../../../src/offline/delta/worldDeltaQueue");

function createTranscript(text) {
  return [
    {
      sceneId: "scene-1",
      turnId: "turn-1",
      speaker: "gm",
      text
    }
  ];
}

function createCanonState() {
  return {
    "faction.prismwell-kite-guild": {
      entityId: "faction.prismwell-kite-guild",
      entityType: "faction",
      canonicalName: "Prismwell Kite Guild",
      control: [],
      influence: "steady"
    },
    "faction.echo-ledger-conclave": {
      entityId: "faction.echo-ledger-conclave",
      entityType: "faction",
      canonicalName: "Echo Ledger Conclave",
      control: ["region.sable-crescent"]
    },
    "region.kyther-range": {
      entityId: "region.kyther-range",
      entityType: "region",
      canonicalName: "Kyther Range Vault",
      status: "stable",
      controllingFaction: null,
      threats: []
    },
    "region.sable-crescent": {
      entityId: "region.sable-crescent",
      entityType: "region",
      canonicalName: "Sable Crescent Basin",
      status: "stable",
      controllingFaction: "faction.echo-ledger-conclave",
      threats: []
    },
    "faction.tempered-accord": {
      entityId: "faction.tempered-accord",
      entityType: "faction",
      canonicalName: "Tempered Accord Custodial Council",
      control: ["region.auric-steppe"],
      influence: "stable"
    },
    "region.auric-steppe": {
      entityId: "region.auric-steppe",
      entityType: "region",
      canonicalName: "Auric Steppe Corridor",
      status: "stable",
      controllingFaction: "faction.tempered-accord",
      threats: []
    }
  };
}

describe("WorldDeltaQueue", () => {
  let lexicon;

  beforeEach(() => {
    lexicon = getDefaultLexicon();
  });

  test("enqueues deltas with before/after snapshots", () => {
    const transcript = createTranscript(
      "The Prismwell Kite Guild secured the Kyther Range Vault without opposition."
    );
    const { mentions } = extractEntities({
      transcript,
      sessionId: "session-primary",
      lexicon
    });

    const publisher = { publishAlert: jest.fn() };
    const queue = new WorldDeltaQueue({
      canonState: createCanonState(),
      publisher
    });

    const deltas = queue.enqueueFromMentions(mentions);
    const delta = deltas.find(
      (candidate) => candidate.entityId === "faction.prismwell-kite-guild"
    );

    expect(delta).toBeDefined();
    expect(delta.before.control).toEqual([]);
    expect(delta.after.control).toEqual(["region.kyther-range"]);
    expect(delta.safety.requiresModeration).toBe(false);
    const moderationCount = deltas.filter((item) => item.safety.requiresModeration).length;
    expect(publisher.publishAlert).toHaveBeenCalledTimes(moderationCount);
  });

  test("flags low-confidence mentions for moderation", () => {
    const transcript = createTranscript(
      "Unconfirmed rumors suggest the Kite Guild secured the Kyther Range Vault overnight."
    );
    const { mentions } = extractEntities({
      transcript,
      sessionId: "session-low",
      lexicon
    });

    const publisher = { publishAlert: jest.fn() };
    const queue = new WorldDeltaQueue({
      canonState: createCanonState(),
      publisher
    });

    const deltas = queue.enqueueFromMentions(mentions);
    const delta = deltas.find(
      (candidate) => candidate.entityId === "faction.prismwell-kite-guild"
    );
    expect(delta).toBeDefined();
    expect(delta.safety.requiresModeration).toBe(true);
    expect(delta.safety.reasons).toContain("low_confidence");
    const moderationCount = deltas.filter((item) => item.safety.requiresModeration).length;
    expect(publisher.publishAlert).toHaveBeenCalledTimes(moderationCount);
  });

  test("detects conflicts when regions already have owners", () => {
    const transcript = createTranscript(
      "The Prismwell Kite Guild seized the Sable Crescent Basin after a fierce skirmish."
    );
    const { mentions } = extractEntities({
      transcript,
      sessionId: "session-conflict",
      lexicon
    });

    const publisher = { publishAlert: jest.fn() };
    const queue = new WorldDeltaQueue({
      canonState: createCanonState(),
      publisher
    });

    const deltas = queue.enqueueFromMentions(mentions);
    const delta = deltas.find(
      (candidate) => candidate.entityId === "faction.prismwell-kite-guild"
    );
    expect(delta).toBeDefined();
    expect(delta.safety.requiresModeration).toBe(true);
    expect(delta.safety.reasons).toContain("conflict_detected");
    expect(delta.safety.conflicts).toEqual([
      {
        type: "control_collision",
        target: "region.sable-crescent",
        currentOwner: "faction.echo-ledger-conclave"
      }
    ]);
    const moderationCount = deltas.filter((item) => item.safety.requiresModeration).length;
    expect(publisher.publishAlert).toHaveBeenCalledTimes(moderationCount);
  });

  test("surfaces capability violations even without state deltas", () => {
    const transcript = createTranscript(
      "Tempered Accord Custodial Council deployed the Spectrum Bloom Flux Array across the Auric Steppe."
    );
    const { mentions } = extractEntities({
      transcript,
      sessionId: "session-capability",
      lexicon
    });

    const publisher = { publishAlert: jest.fn() };
    const queue = new WorldDeltaQueue({
      canonState: createCanonState(),
      publisher
    });

    const deltas = queue.enqueueFromMentions(mentions);
    const delta = deltas.find(
      (candidate) => candidate.entityId === "faction.tempered-accord"
    );
    expect(delta).toBeDefined();
    expect(delta.capabilityRefs).toEqual([
      expect.objectContaining({ capabilityId: "capability.spectrum-bloom-array" })
    ]);
    expect(delta.safety.requiresModeration).toBe(true);
    expect(delta.safety.reasons).toContain("capability_violation");
    const moderationCount = deltas.filter((item) => item.safety.requiresModeration).length;
    expect(publisher.publishAlert).toHaveBeenCalledTimes(moderationCount);
  });
});
