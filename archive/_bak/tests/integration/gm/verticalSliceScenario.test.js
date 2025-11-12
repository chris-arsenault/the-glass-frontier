"use strict";

import { runVerticalSliceScenario,
  createSequentialRandomizer
 } from "../../../_src_bak/narrative/scenarios/verticalSliceScenario.js";

describe("IMP-GM-06 · Vertical Slice Scenario", () => {
  test(
    "executes scripted solo session through closure pipeline",
    async () => {
      const randomizer = createSequentialRandomizer([
        [6, 5, 4],
        [2, 1, 1]
      ]);

      const {
        sessionState,
        transcript,
        changeFeed,
        resolvedChecks,
        vetoedChecks,
        closureJob
      } = await runVerticalSliceScenario({ randomizer });

      expect(resolvedChecks.length).toBeGreaterThanOrEqual(2);
      expect(vetoedChecks.length).toBe(1);

      const systemEntries = transcript.filter((entry) => entry.role === "system");
      expect(systemEntries.some((entry) => entry.metadata?.type === "check-resolution")).toBe(true);
      expect(systemEntries.some((entry) => entry.metadata?.type === "check-veto")).toBe(true);

      expect(
        changeFeed.some((entry) => entry.shard === "transcript" && entry.action === "append")
      ).toBe(true);

      expect(closureJob.status).toBe("completed");
      expect(closureJob.result).toEqual(
        expect.objectContaining({
          deltaCount: expect.any(Number),
          mentionCount: expect.any(Number)
        })
      );

      expect(sessionState.pendingOfflineReconcile).toBe(false);
      expect(sessionState.lastOfflineWorkflowRun).toEqual(
        expect.objectContaining({
          status: "completed",
          deltaCount: expect.any(Number),
          mentionCount: expect.any(Number)
        })
      );
      expect(sessionState.offlineReconciledAt).toBeDefined();
    },
    20000
  );
});

