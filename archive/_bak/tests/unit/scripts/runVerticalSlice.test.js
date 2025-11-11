"use strict";

import { parseRandomizerSequences,
  mapTranscriptToNarrativeSummary,
  serialize
 } from "../../../_scripts_bak/runVerticalSlice.js.js";

describe("scripts/runVerticalSlice helpers", () => {
  test("parseRandomizerSequences returns parsed arrays", () => {
    expect(parseRandomizerSequences("6,5,4|2,1,1")).toEqual([
      [6, 5, 4],
      [2, 1, 1]
    ]);
    expect(parseRandomizerSequences("")).toBeNull();
    expect(parseRandomizerSequences(null)).toBeNull();
    expect(parseRandomizerSequences("abc")).toBeNull();
  });

  test("mapTranscriptToNarrativeSummary aggregates flags and move metadata", () => {
    const summary = mapTranscriptToNarrativeSummary([
      {
        role: "player",
        metadata: {
          safetyFlags: ["content-warning"],
          detectedMove: "survey"
        }
      },
      {
        role: "gm",
        metadata: {
          flags: ["creative-spark"],
          move: "survey"
        }
      },
      {
        role: "system"
      }
    ]);

    expect(summary).toEqual(
      expect.objectContaining({
        turnCount: 3,
        playerMessages: 1,
        gmMessages: 1,
        systemMessages: 1,
        safetyFlags: ["content-warning", "creative-spark"],
        moves: ["survey"]
      })
    );
  });

  test("serialize converts Maps and Sets to arrays", () => {
    const source = {
      pending: new Map([
        ["check-1", { id: "check-1" }],
        ["check-2", { id: "check-2" }]
      ]),
      flags: new Set(["alpha", "beta"])
    };

    const output = serialize(source);
    expect(output).toEqual({
      pending: [
        ["check-1", { id: "check-1" }],
        ["check-2", { id: "check-2" }]
      ],
      flags: ["alpha", "beta"]
    });
    expect(JSON.stringify(output)).toBeDefined();
  });
});
