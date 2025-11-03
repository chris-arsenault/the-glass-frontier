"use strict";

const { StorageMetrics } = require("../../../src/telemetry/storageMetrics");

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

  test("recordRemoteTierStatus omits unexpected fields", () => {
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
  });
});
