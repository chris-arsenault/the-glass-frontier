"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  resolveInputTargets,
  composeBatchRollup,
  summarizeModeration
} = require("../../scripts/runOfflinePublishingQa");

describe("runOfflinePublishingQa helpers", () => {
  describe("resolveInputTargets", () => {
    let tempDir;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "offline-qa-test-"));
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    test("returns sorted session artifact files and filters summaries/transcripts", () => {
      const allowedOne = path.join(tempDir, "session-one.json");
      const allowedTwo = path.join(tempDir, "session-two.json");
      const summaryPath = path.join(tempDir, "session-one-summary.json");
      const transcriptPath = path.join(tempDir, "session-one-transcript.json");
      const qaOutputPath = path.join(tempDir, "session-one-offline-qa.json");
      const nestedDir = path.join(tempDir, "nested");

      fs.writeFileSync(allowedOne, "{}");
      fs.writeFileSync(allowedTwo, "{}");
      fs.writeFileSync(summaryPath, "{}");
      fs.writeFileSync(transcriptPath, "{}");
      fs.writeFileSync(qaOutputPath, "{}");
      fs.mkdirSync(nestedDir);

      const targets = resolveInputTargets(tempDir);
      expect(targets).toEqual([allowedOne, allowedTwo]);
    });
  });

  describe("composeBatchRollup", () => {
    test("accumulates mention and moderation counts", () => {
      const rollup = composeBatchRollup([
        {
          mentionCount: 3,
          deltaCount: 2,
          requiresModeration: true,
          capabilityViolations: 1,
          conflictDetections: 1,
          lowConfidenceDeltas: 0
        },
        {
          mentionCount: 1,
          deltaCount: 0,
          requiresModeration: false,
          capabilityViolations: 0,
          conflictDetections: 0,
          lowConfidenceDeltas: 1
        }
      ]);

      expect(rollup).toEqual({
        totalSessions: 2,
        totalMentions: 4,
        totalDeltas: 2,
        sessionsWithModeration: 1,
        sessionsWithCapabilityViolations: 1,
        sessionsWithConflicts: 1,
        sessionsWithLowConfidence: 1
      });
    });
  });

  describe("summarizeModeration", () => {
    test("tracks moderation reasons and counts", () => {
      const summary = summarizeModeration([
        {
          safety: {
            requiresModeration: true,
            reasons: ["capability_violation", "conflict_detected"]
          }
        },
        {
          safety: {
            requiresModeration: true,
            reasons: ["low_confidence"]
          }
        },
        {
          safety: {
            requiresModeration: false,
            reasons: []
          }
        }
      ]);

      expect(summary.requiresModeration).toBe(true);
      expect(summary.reasons).toEqual([
        "capability_violation",
        "conflict_detected",
        "low_confidence"
      ]);
      expect(summary.capabilityViolations).toBe(1);
      expect(summary.conflictDetections).toBe(1);
      expect(summary.lowConfidenceFindings).toBe(1);
    });

    test("handles empty delta list", () => {
      const summary = summarizeModeration([]);
      expect(summary).toEqual({
        requiresModeration: false,
        reasons: [],
        capabilityViolations: 0,
        conflictDetections: 0,
        lowConfidenceFindings: 0
      });
    });
  });
});
