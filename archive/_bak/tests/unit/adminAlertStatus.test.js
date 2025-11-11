"use strict";

import fs from "fs";
import os from "os";
import path from "path";

import { DEFAULT_OBSERVATION_PATH,
  DEFAULT_WINDOW_MS,
  parseArgs,
  parseWindow,
  loadObservation,
  analyzeObservation,
  renderText,
  formatDuration
 } from "../../_scripts_bak/adminAlertStatus.js.js";

describe("admin alert status tooling", () => {
  test("parseArgs applies defaults and overrides", () => {
    const args = parseArgs([
      "node",
      "script",
      "--observation",
      "/tmp/custom.json",
      "--window",
      "15m",
      "--json"
    ]);

    expect(args.observationPath).toBe("/tmp/custom.json");
    expect(args.windowMs).toBe(15 * 60 * 1000);
    expect(args.format).toBe("json");
  });

  test("parseWindow supports ms, seconds, minutes, and hours", () => {
    expect(parseWindow("60000")).toBe(60000);
    expect(parseWindow("30s")).toBe(30000);
    expect(parseWindow("2m")).toBe(120000);
    expect(parseWindow("1.5h")).toBe(5400000);
    expect(() => parseWindow("not-a-number")).toThrow(/Invalid window/);
  });

  test("loadObservation returns placeholder when file is missing", () => {
    const expectedPath = path.join(os.tmpdir(), "missing-observation.json");
    const observation = loadObservation(expectedPath);
    expect(observation?.data).toBeNull();
    expect(observation?.path).toBe(expectedPath);
  });

  test("loadObservation parses existing JSON", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "admin-alert-"));
    const filePath = path.join(tempDir, "observation.json");
    const payload = {
      observedAt: "2025-11-04T10:00:00.000Z",
      seeded: false,
      latencyMs: 12
    };

    try {
      fs.writeFileSync(filePath, JSON.stringify(payload), "utf8");
      const observation = loadObservation(filePath);
      expect(observation?.data).toEqual(payload);
      expect(observation?.path).toBe(filePath);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("analyzeObservation recommends keeping fallback when no data", () => {
    const summary = analyzeObservation(null, DEFAULT_WINDOW_MS, Date.parse("2025-11-04T12:00:00Z"));
    expect(summary.recommendation.status).toBe("missing");
    expect(summary.recommendation.keepFallbackSeeding).toBe(true);
  });

  test("analyzeObservation recommends disabling fallback for live alerts within window", () => {
    const observation = {
      data: {
        observedAt: "2025-11-04T10:00:00.000Z",
        seeded: false,
        latencyMs: 10
      },
      path: "/tmp/test.json"
    };
    const now = Date.parse("2025-11-04T12:00:00.000Z");

    const summary = analyzeObservation(observation, DEFAULT_WINDOW_MS, now);
    expect(summary.recommendation.status).toBe("ready");
    expect(summary.recommendation.keepFallbackSeeding).toBe(false);
  });

  test("analyzeObservation keeps fallback when latest alert was seeded", () => {
    const observation = {
      data: {
        observedAt: "2025-11-04T10:00:00.000Z",
        seeded: true
      },
      path: "/tmp/test.json"
    };
    const now = Date.parse("2025-11-04T12:00:00.000Z");

    const summary = analyzeObservation(observation, DEFAULT_WINDOW_MS, now);
    expect(summary.recommendation.status).toBe("seeded");
    expect(summary.recommendation.keepFallbackSeeding).toBe(true);
  });

  test("analyzeObservation marks stale observations outside window", () => {
    const observation = {
      data: {
        observedAt: "2025-11-03T00:00:00.000Z",
        seeded: false
      },
      path: "/tmp/test.json"
    };
    const twoHoursMs = 2 * 60 * 60 * 1000;
    const now = Date.parse("2025-11-04T12:00:00.000Z");

    const summary = analyzeObservation(observation, twoHoursMs, now);
    expect(summary.recommendation.status).toBe("stale");
    expect(summary.recommendation.keepFallbackSeeding).toBe(true);
  });

  test("renderText returns human readable summary", () => {
    const observation = {
      data: {
        observedAt: "2025-11-04T10:00:00.000Z",
        seeded: false,
        latencyMs: 14
      },
      path: DEFAULT_OBSERVATION_PATH
    };
    const summary = analyzeObservation(
      observation,
      DEFAULT_WINDOW_MS,
      Date.parse("2025-11-04T12:00:00.000Z")
    );
    const output = renderText(summary);
    expect(output).toContain("Admin Alert Observation Summary");
    expect(output).toContain("disable fallback seeding");
  });

  test("formatDuration handles various thresholds", () => {
    expect(formatDuration(30 * 60 * 1000)).toBe("30m 0s");
    expect(formatDuration(90 * 1000)).toBe("1m 30s");
    expect(formatDuration(10 * 1000)).toBe("10s");
    expect(formatDuration(-1)).toBe("unknown");
  });
});
