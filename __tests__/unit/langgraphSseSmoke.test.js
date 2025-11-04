"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const { parseArgs, writeReport } = require("../../scripts/langgraphSseSmoke.js");

describe("langgraph SSE smoke tooling", () => {
  const originalEnv = { ...process.env };
  const trackedEnvKeys = [
    "LANGGRAPH_SMOKE_BASE_URL",
    "LANGGRAPH_SMOKE_ADMIN_EMAIL",
    "LANGGRAPH_SMOKE_ADMIN_PASSWORD",
    "LANGGRAPH_SMOKE_SESSION_TITLE",
    "LANGGRAPH_SMOKE_SESSION_ID",
    "LANGGRAPH_SMOKE_TIMEOUT_MS",
    "LANGGRAPH_SMOKE_SKIP_ADMIN_ALERT",
    "LANGGRAPH_SMOKE_REPORT_PATH"
  ];

  beforeEach(() => {
    trackedEnvKeys.forEach((key) => {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    });
  });

  afterAll(() => {
    Object.assign(process.env, originalEnv);
  });

  test("parseArgs honours environment defaults and CLI overrides", () => {
    process.env.LANGGRAPH_SMOKE_BASE_URL = "http://env.local";
    process.env.LANGGRAPH_SMOKE_TIMEOUT_MS = "15000";
    process.env.LANGGRAPH_SMOKE_SKIP_ADMIN_ALERT = "true";

    const config = parseArgs(["node", "script", "--report", "/tmp/report.json"]);

    expect(config.baseUrl).toBe("http://env.local");
    expect(config.timeoutMs).toBe(15000);
    expect(config.skipAdminAlert).toBe(true);
    expect(config.reportPath).toBe("/tmp/report.json");
  });

  test("writeReport persists structured summaries when a path is provided", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "langgraph-sse-report-"));
    const reportPath = path.join(tempDir, "summary.json");

    const summary = {
      runId: "test-run",
      success: true,
      metrics: { sample: true }
    };

    try {
      writeReport(reportPath, summary);
      const saved = fs.readFileSync(reportPath, "utf-8");
      expect(JSON.parse(saved)).toEqual(summary);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
