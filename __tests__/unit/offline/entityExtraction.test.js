"use strict";

const { extractEntities } = require("../../../src/offline/entityExtraction/entityExtractor");
const { getDefaultLexicon } = require("../../../src/offline/entityExtraction/lexicon");

function createTranscriptEntry(text, overrides = {}) {
  return {
    sceneId: overrides.sceneId || "scene-1",
    turnId: overrides.turnId || "turn-1",
    speaker: overrides.speaker || "gm",
    text
  };
}

describe("Entity Extraction", () => {
  test("detects control shifts for factions and regions", () => {
    const transcript = [
      createTranscriptEntry(
        "The Prismwell Kite Guild seized the Kyther Range Vault after a daring raid."
      )
    ];

    const { mentions } = extractEntities({
      transcript,
      sessionId: "session-123",
      lexicon: getDefaultLexicon()
    });

    const mention = mentions.find(
      (candidate) => candidate.entityId === "faction.prismwell-kite-guild"
    );
    expect(mention.entityId).toBe("faction.prismwell-kite-guild");
    expect(mention.proposedChanges).toEqual({
      control: {
        add: ["region.kyther-range"],
        remove: []
      }
    });
    expect(mention.confidence).toBeGreaterThanOrEqual(0.8);
    expect(mention.source.sessionId).toBe("session-123");
  });

  test("captures capability references for moderation", () => {
    const transcript = [
      createTranscriptEntry(
        "Tempered Accord Custodial Council deployed the Spectrum Bloom Flux Array to shield the Auric Steppe."
      )
    ];

    const { mentions } = extractEntities({
      transcript,
      sessionId: "session-cap",
      lexicon: getDefaultLexicon()
    });

    const mention = mentions.find(
      (candidate) => candidate.entityId === "faction.tempered-accord"
    );
    expect(mention).toBeDefined();
    expect(mention.capabilityRefs).toEqual([
      {
        capabilityId: "capability.spectrum-bloom-array",
        severity: "critical"
      }
    ]);
  });
});
