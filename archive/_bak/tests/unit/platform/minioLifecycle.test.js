"use strict";

import path from "path";

const modulePath = path.resolve(__dirname, "../../../scripts/minio/applyLifecycle.js");

describe("MinIO lifecycle remote tier rehearsal", () => {
  const ORIGINAL_ENV = { ...process.env };

  let runRemoteTierRehearsal;
  let evaluateLifecycleDrift;
  let resolveBoolean;
  let buildRehearsalBucketList;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV, LOG_SILENT: "1" };
    ({
      runRemoteTierRehearsal,
      evaluateLifecycleDrift,
      resolveBoolean,
      buildRehearsalBucketList
    } = require(modulePath));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  test("skips rehearsal when remote tier config is absent", async () => {
    const metrics = { recordRemoteTierStatus: jest.fn() };

    await runRemoteTierRehearsal(createClientStub(), null, [], metrics);

    expect(metrics.recordRemoteTierStatus).not.toHaveBeenCalled();
  });

  test("skips rehearsal when disabled via environment", async () => {
    process.env.MINIO_REMOTE_TIER_ENABLED = "0";
    const metrics = { recordRemoteTierStatus: jest.fn() };

    await runRemoteTierRehearsal(createClientStub(), { enabled: true }, [], metrics);

    expect(metrics.recordRemoteTierStatus).not.toHaveBeenCalled();
  });

  test("throws and records credentials missing when required", async () => {
    delete process.env.BACKBLAZE_B2_KEY_ID;
    delete process.env.BACKBLAZE_B2_APPLICATION_KEY;

    const metricsCalls = [];
    const metrics = {
      recordRemoteTierStatus: jest.fn((payload) => metricsCalls.push(payload))
    };

    await expect(
      runRemoteTierRehearsal(
        createClientStub(),
        {
          enabled: true,
          requireCredentials: true,
          rehearsal: { enabled: true, buckets: ["gf-digests"] }
        },
        [{ name: "gf-digests" }],
        metrics,
        "b2-archive"
      )
    ).rejects.toThrow("remote_tier_credentials_missing");

    expect(metricsCalls).toHaveLength(1);
    expect(metricsCalls[0]).toMatchObject({ status: "credentials_missing", storageClass: "b2-archive" });
  });

  test("records success metrics for rehearsal run", async () => {
    process.env.BACKBLAZE_B2_KEY_ID = "test-key";
    process.env.BACKBLAZE_B2_APPLICATION_KEY = "test-secret";

    const events = [];
    const metrics = {
      recordRemoteTierStatus: jest.fn((payload) => events.push(payload))
    };

    const putObject = jest.fn(() => Promise.resolve());
    const statObject = jest.fn(() => Promise.resolve({ metaData: { "x-amz-storage-class": "b2-archive" } }));
    const getObject = jest.fn(() => ({
      [Symbol.asyncIterator]: async function* iterate() {
        yield Buffer.from("probe-payload", "utf8");
      }
    }));
    const removeObject = jest.fn(() => Promise.resolve());

    let timestamp = 1_000;
    jest.spyOn(Date, "now").mockImplementation(() => {
      timestamp += 100;
      return timestamp;
    });

    await runRemoteTierRehearsal(
      {
        putObject,
        statObject,
        getObject,
        removeObject
      },
      {
        name: "b2-archive",
        rehearsal: {
          enabled: true,
          buckets: ["gf-digests", "gf-attachments"],
          limit: 1,
          cleanupGovernanceBypass: true
        }
      },
      [{ name: "gf-digests" }, { name: "gf-attachments" }],
      metrics,
      "b2-archive"
    );

    expect(putObject).toHaveBeenCalledTimes(1);
    expect(statObject).toHaveBeenCalledTimes(1);
    expect(getObject).toHaveBeenCalledTimes(1);
    expect(removeObject).toHaveBeenCalledWith(
      "gf-digests",
      expect.stringContaining("gf-digests-rehearsal"),
      { governanceBypass: true }
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      bucket: "gf-digests",
      status: "success",
      storageClass: "b2-archive"
    });
    expect(events[0].bytes).toBeGreaterThan(0);
    expect(events[0].writeDurationMs).toBeGreaterThanOrEqual(0);
    expect(events[0].fetchDurationMs).toBeGreaterThanOrEqual(events[0].writeDurationMs);

  });

  test("records restore failure when object fetch fails", async () => {
    process.env.BACKBLAZE_B2_KEY_ID = "test-key";
    process.env.BACKBLAZE_B2_APPLICATION_KEY = "test-secret";

    const events = [];
    const metrics = {
      recordRemoteTierStatus: jest.fn((payload) => events.push(payload))
    };

    const client = {
      putObject: jest.fn(() => Promise.resolve()),
      statObject: jest.fn(() => Promise.resolve({ metaData: {} })),
      getObject: jest.fn(async () => {
        throw new Error("restore failed");
      }),
      removeObject: jest.fn(() => Promise.resolve())
    };

    await runRemoteTierRehearsal(
      client,
      {
        name: "b2-archive",
        rehearsal: {
          enabled: true,
          buckets: ["gf-digests"],
          cleanupGovernanceBypass: false
        }
      },
      [{ name: "gf-digests" }],
      metrics,
      "b2-archive"
    );

    expect(events.some((event) => event.status === "restore_failed")).toBe(true);
    expect(events.some((event) => event.status === "error")).toBe(true);
  });

  test("evaluateLifecycleDrift emits when drift exceeds allowance", () => {
    const metricsCalls = [];
    const metrics = {
      recordLifecycleDrift: jest.fn((payload) => metricsCalls.push(payload))
    };

    evaluateLifecycleDrift(
      metrics,
      { name: "gf-digests", expectedArchiveDays: 30 },
      { oldestObjectAgeDays: 45 },
      2
    );

    expect(metricsCalls).toHaveLength(1);
    expect(metricsCalls[0]).toMatchObject({ bucket: "gf-digests", status: "archive_overdue" });
  });

  test("resolveBoolean interprets common truthy and falsy inputs", () => {
    expect(resolveBoolean("yes")).toBe(true);
    expect(resolveBoolean("0")).toBe(false);
    expect(resolveBoolean(true)).toBe(true);
    expect(resolveBoolean(undefined)).toBeNull();
  });

  test("buildRehearsalBucketList falls back to bucket definitions when unspecified", () => {
    const buckets = [{ name: "gf-digests" }, { name: "gf-attachments" }];
    expect(buildRehearsalBucketList({}, buckets)).toEqual(["gf-digests", "gf-attachments"]);
  });
});

function createClientStub() {
  return {
    putObject: jest.fn(() => Promise.resolve()),
    statObject: jest.fn(() => Promise.resolve({ metaData: {} })),
    getObject: jest.fn(() => ({
      [Symbol.asyncIterator]: async function* iterate() {
        yield Buffer.alloc(0);
      }
    })),
    removeObject: jest.fn(() => Promise.resolve())
  };
}
