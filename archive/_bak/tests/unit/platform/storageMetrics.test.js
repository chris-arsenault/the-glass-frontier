"use strict";

jest.mock("../../../_src_bak/telemetry/storageMetricsOtel", () => ({
  recordPolicyApplied: jest.fn(),
  recordBucketUsage: jest.fn(),
  recordLifecycleDrift: jest.fn(),
  recordRemoteTierStatus: jest.fn(),
  flush: jest.fn(() => Promise.resolve()),
  shutdown: jest.fn(() => Promise.resolve())
}));

import otel from "../../../_src_bak/telemetry/storageMetricsOtel";
import { StorageMetrics  } from "../../../_src_bak/telemetry/storageMetrics.js";

describe("StorageMetrics sanitization", () => {
  const ORIGINAL_ENV = { ...process.env };
  let consoleSpy;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, LOG_SILENT: "0", LOG_LEVEL: "info" };
    consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    process.env = ORIGINAL_ENV;
  });

  test("recordRemoteTierStatus omits unexpected fields and forwards to OTEL exporter", () => {
    const metrics = new StorageMetrics();

    metrics.recordRemoteTierStatus({
      bucket: "gf-digests",
      storageClass: "b2-archive",
      status: "success",
      bytes: 123,
      fetchDurationMs: 42,
      unexpected: "discard me"
    });

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(payload).toMatchObject({
      message: "telemetry.storage.remote_tier.rehearsal",
      bucket: "gf-digests",
      storageClass: "b2-archive",
      status: "success",
      bytes: 123,
      fetchDurationMs: 42
    });
    expect(payload.unexpected).toBeUndefined();
    expect(otel.recordRemoteTierStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: "gf-digests",
        storageClass: "b2-archive",
        status: "success",
        bytes: 123
      })
    );
  });

  test("flush resolves even when exporter is disabled", async () => {
    const metrics = new StorageMetrics();
    await expect(metrics.flush()).resolves.toBeUndefined();
    expect(otel.flush).toHaveBeenCalledTimes(1);
  });
});
