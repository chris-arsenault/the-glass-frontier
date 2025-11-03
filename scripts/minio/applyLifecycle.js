"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { Client } = require("minio");
const { StorageMetrics } = require("../../src/telemetry/storageMetrics");
const { log } = require("../../src/utils/logger");

async function main() {
  const configPath =
    process.env.MINIO_LIFECYCLE_CONFIG ||
    path.resolve(__dirname, "../../infra/minio/lifecycle-policies.json");
  const config = await loadConfig(configPath);
  const metrics = new StorageMetrics();

  try {
    const remoteTierConfig = config.remoteTier || null;
    const client = createClient(config);

    const remoteTierName = resolveRemoteTierName(remoteTierConfig, config.defaults);
    const warmClass = resolveStorageClass(
      "MINIO_WARM_STORAGE_CLASS",
      config.defaults?.warmStorageClass,
      "STANDARD_IA"
    );
    const archiveClass = resolveStorageClass(
      "MINIO_ARCHIVE_STORAGE_CLASS",
      remoteTierName ?? config.defaults?.archiveStorageClass,
      remoteTierName ?? "GLACIER"
    );
    const driftAllowance = resolveNumber(
      process.env.MINIO_LIFECYCLE_DRIFT_ALLOWANCE,
      config.defaults?.allowedDriftDays,
      2
    );

    let processed = 0;

    for (const bucketConfig of config.buckets || []) {
      processed += 1;
      await ensureBucket(client, bucketConfig, config.defaults);
      const policyChanged = await applyLifecycle(client, bucketConfig, warmClass, archiveClass);
      metrics.recordPolicyApplied({
        bucket: bucketConfig.name,
        changed: policyChanged,
        ruleCount: Array.isArray(bucketConfig.lifecycle?.Rules) ? bucketConfig.lifecycle.Rules.length : 0
      });

      const usage = await collectUsage(client, bucketConfig);
      const capacityBytes = resolveNumber(bucketConfig.capacityBytes);
      const capacityPercent =
        typeof capacityBytes === "number" && capacityBytes > 0
          ? Number(((usage.bytes / capacityBytes) * 100).toFixed(2))
          : null;

      metrics.recordBucketUsage({
        bucket: bucketConfig.name,
        bytes: usage.bytes,
        objectCount: usage.objectCount,
        oldestObjectAgeDays: usage.oldestObjectAgeDays,
        scanDurationMs: usage.scanDurationMs,
        capacityBytes: capacityBytes ?? null,
        capacityPercent
      });

      evaluateLifecycleDrift(metrics, bucketConfig, usage, driftAllowance);
    }

    await runRemoteTierRehearsal(client, remoteTierConfig, config.buckets || [], metrics, remoteTierName);

    log("info", "minio.lifecycle.completed", {
      bucketCount: processed,
      warmStorageClass: warmClass,
      archiveStorageClass: archiveClass,
      remoteTierStorageClass: remoteTierName ?? null
    });
  } finally {
    await metrics.flush();
    await metrics.shutdown();
  }
}

async function loadConfig(configPath) {
  const raw = await fs.readFile(configPath, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.buckets)) {
    throw new Error("lifecycle_config_missing_buckets");
  }
  return parsed;
}

function createClient(config) {
  const accessKey = process.env.MINIO_ACCESS_KEY;
  const secretKey = process.env.MINIO_SECRET_KEY;

  if (!accessKey || !secretKey) {
    throw new Error("minio_credentials_missing");
  }

  const endPoint = process.env.MINIO_ENDPOINT || "127.0.0.1";
  const port = Number(process.env.MINIO_PORT || 9000);
  const useSSL = process.env.MINIO_USE_SSL === "1";
  const region = process.env.MINIO_REGION || config.defaults?.region || "us-east-1";

  return new Client({
    endPoint,
    port,
    useSSL,
    accessKey,
    secretKey,
    region
  });
}

async function ensureBucket(client, bucketConfig, defaults = {}) {
  const exists = await client.bucketExists(bucketConfig.name);
  const region = bucketConfig.region || defaults.region || "us-east-1";

  if (!exists) {
    await client.makeBucket(bucketConfig.name, region);
    log("info", "minio.bucket.created", { bucket: bucketConfig.name, region });
  }

  if (bucketConfig.versioning === false) {
    return;
  }

  const current = await client.getBucketVersioning(bucketConfig.name);
  if (!current || current.Status !== "Enabled") {
    await client.setBucketVersioning(bucketConfig.name, { Status: "Enabled" });
    log("info", "minio.bucket.versioning.enabled", { bucket: bucketConfig.name });
  }
}

async function applyLifecycle(client, bucketConfig, warmClass, archiveClass) {
  if (!bucketConfig.lifecycle || !Array.isArray(bucketConfig.lifecycle.Rules)) {
    log("warn", "minio.bucket.lifecycle.missing", { bucket: bucketConfig.name });
    return false;
  }

  const desired = transformLifecycle(bucketConfig.lifecycle, warmClass, archiveClass);

  let existing = null;
  try {
    existing = await client.getBucketLifecycle(bucketConfig.name);
  } catch (error) {
    if (error && error.code !== "NoSuchLifecycleConfiguration") {
      throw error;
    }
  }

  if (existing && lifecycleEquals(existing, desired)) {
    return false;
  }

  await client.setBucketLifecycle(bucketConfig.name, desired);
  log("info", "minio.bucket.lifecycle.updated", { bucket: bucketConfig.name });
  return true;
}

function transformLifecycle(baseLifecycle, warmClass, archiveClass) {
  const lifecycle = deepClone(baseLifecycle);

  if (!Array.isArray(lifecycle.Rules)) {
    lifecycle.Rules = [];
  }

  lifecycle.Rules = lifecycle.Rules.map((rule) => {
    const next = deepClone(rule);

    if (!next.Status) {
      next.Status = "Enabled";
    }

    if (Array.isArray(next.Transitions)) {
      next.Transitions = next.Transitions.map((transition) => ({
        ...transition,
        StorageClass: mapStorageClass(transition.StorageClass, warmClass, archiveClass)
      }));
    }

    if (Array.isArray(next.NoncurrentVersionTransitions)) {
      next.NoncurrentVersionTransitions = next.NoncurrentVersionTransitions.map((transition) => ({
        ...transition,
        StorageClass: mapStorageClass(transition.StorageClass, warmClass, archiveClass)
      }));
    }

    return next;
  });

  return lifecycle;
}

function mapStorageClass(storageClass, warmClass, archiveClass) {
  if (!storageClass) {
    return storageClass;
  }

  const normalized = String(storageClass).toUpperCase();
  if (normalized === "WARM") {
    return warmClass;
  }
  if (normalized === "ARCHIVE") {
    return archiveClass;
  }
  return storageClass;
}

function lifecycleEquals(a, b) {
  return JSON.stringify(deepSort(a)) === JSON.stringify(deepSort(b));
}

function deepSort(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => deepSort(entry)).sort(compareSerialized);
  }

  if (value && typeof value === "object") {
    const sorted = {};
    Object.keys(value)
      .sort()
      .forEach((key) => {
        sorted[key] = deepSort(value[key]);
      });
    return sorted;
  }

  return value;
}

function compareSerialized(a, b) {
  const left = JSON.stringify(a);
  const right = JSON.stringify(b);
  if (left === right) {
    return 0;
  }
  return left > right ? 1 : -1;
}

async function collectUsage(client, bucketConfig) {
  const startedAt = Date.now();
  const prefix = bucketConfig.prefix || "";
  let totalBytes = 0;
  let objectCount = 0;
  let oldest = null;

  return new Promise((resolve, reject) => {
    const stream = client.listObjectsV2(bucketConfig.name, prefix, true);

    stream.on("data", (object) => {
      objectCount += 1;
      totalBytes += object.size || 0;

      const lastModified =
        object.lastModified instanceof Date ? object.lastModified : new Date(object.lastModified || Date.now());

      if (!oldest || lastModified < oldest) {
        oldest = lastModified;
      }
    });

    stream.on("error", reject);

    stream.on("end", () => {
      const finishedAt = Date.now();
      const duration = finishedAt - startedAt;
      let oldestTime = null;
      if (oldest instanceof Date) {
        const candidate = oldest.getTime();
        if (Number.isFinite(candidate)) {
          oldestTime = candidate;
        }
      }
      const oldestAgeDays =
        typeof oldestTime === "number" ? Math.floor((finishedAt - oldestTime) / (24 * 60 * 60 * 1000)) : null;

      resolve({
        bytes: totalBytes,
        objectCount,
        oldestObjectAgeDays: oldestAgeDays,
        scanDurationMs: duration
      });
    });
  });
}

function evaluateLifecycleDrift(metrics, bucketConfig, usage, defaultAllowance) {
  if (typeof usage.oldestObjectAgeDays !== "number") {
    return;
  }

  if (typeof bucketConfig.expectedArchiveDays !== "number") {
    return;
  }

  const allowance =
    typeof bucketConfig.allowedDriftDays === "number" ? bucketConfig.allowedDriftDays : Number(defaultAllowance) || 0;
  const drift = usage.oldestObjectAgeDays - bucketConfig.expectedArchiveDays;

  if (drift > allowance) {
    metrics.recordLifecycleDrift({
      bucket: bucketConfig.name,
      expectedArchiveDays: bucketConfig.expectedArchiveDays,
      observedAgeDays: usage.oldestObjectAgeDays,
      driftDays: drift,
      status: "archive_overdue"
    });
  }
}

function deepClone(input) {
  return JSON.parse(JSON.stringify(input));
}

function resolveStorageClass(envKey, configDefault, fallback) {
  const fromEnv = process.env[envKey];
  if (fromEnv && fromEnv.trim()) {
    return fromEnv.trim().toUpperCase();
  }
  if (configDefault && typeof configDefault === "string") {
    return configDefault.trim().toUpperCase();
  }
  return fallback;
}

function resolveNumber(...candidates) {
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null || candidate === "") {
      continue;
    }
    const parsed = Number(candidate);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return null;
}

async function runRemoteTierRehearsal(client, remoteTierConfig, buckets, metrics, providedTierName) {
  if (!remoteTierConfig) {
    return;
  }

  const enabled = resolveBoolean(process.env.MINIO_REMOTE_TIER_ENABLED, remoteTierConfig.enabled, true);
  if (enabled === false) {
    return;
  }

  const tierName = providedTierName || resolveRemoteTierName(remoteTierConfig);
  if (!tierName) {
    log("warn", "minio.remote_tier.missing_name", {});
    return;
  }

  const credentialsOptional = resolveBoolean(
    process.env.MINIO_REMOTE_TIER_OPTIONAL,
    remoteTierConfig.optional,
    false
  );
  const credentialsPresent = hasRemoteTierCredentials();

  if (!credentialsPresent) {
    metrics.recordRemoteTierStatus({
      storageClass: tierName,
      status: "credentials_missing"
    });
    log("warn", "minio.remote_tier.credentials_missing", { storageClass: tierName });
    if (resolveBoolean(remoteTierConfig.requireCredentials, true) === true && credentialsOptional !== true) {
      throw new Error("remote_tier_credentials_missing");
    }
    return;
  }

  const rehearsal = remoteTierConfig.rehearsal || {};
  if (resolveBoolean(rehearsal.enabled, true) === false) {
    return;
  }

  const bucketNames = buildRehearsalBucketList(rehearsal, buckets);
  if (!Array.isArray(bucketNames) || bucketNames.length === 0) {
    log("warn", "minio.remote_tier.no_buckets_for_rehearsal", {});
    return;
  }

  const limit = resolveNumber(rehearsal.limit, bucketNames.length);
  const normalizedLimit = limit && limit > 0 ? Math.min(limit, bucketNames.length) : bucketNames.length;
  const prefix = rehearsal.objectPrefix || ".remote-tier-rehearsal";
  const payloadBase = rehearsal.payload || "remote tier rehearsal";
  const cleanupBypass = resolveBoolean(rehearsal.cleanupGovernanceBypass, false) === true;

  let processed = 0;

  for (const bucketName of bucketNames) {
    if (!bucketName) {
      continue;
    }

    if (processed >= normalizedLimit) {
      break;
    }
    processed += 1;

    const objectKey = `${prefix.replace(/\/+$/, "")}/${bucketName}-rehearsal-${Date.now()}.txt`;
    const payload = Buffer.from(`${payloadBase} ${new Date().toISOString()}`, "utf8");

    const writeStartedAt = Date.now();
    let storageClass = tierName;

    try {
      await client.putObject(bucketName, objectKey, payload, {
        "x-amz-storage-class": tierName
      });
      const writeDurationMs = Date.now() - writeStartedAt;

      const stat = await client.statObject(bucketName, objectKey);
      storageClass = extractStorageClass(stat.metaData) || tierName;

      let fetchDurationMs = null;
      let bytesFetched = null;
      try {
        const stream = await client.getObject(bucketName, objectKey);
        const buffer = await streamToBuffer(stream);
        fetchDurationMs = Date.now() - writeStartedAt;
        bytesFetched = buffer.length;
      } catch (fetchError) {
        metrics.recordRemoteTierStatus({
          bucket: bucketName,
          objectKey,
          storageClass,
          status: "restore_failed",
          error: sanitizeError(fetchError),
          writeDurationMs
        });
        throw fetchError;
      }

      metrics.recordRemoteTierStatus({
        bucket: bucketName,
        objectKey,
        storageClass,
        status: "success",
        bytes: bytesFetched,
        writeDurationMs,
        fetchDurationMs
      });
    } catch (error) {
      metrics.recordRemoteTierStatus({
        bucket: bucketName,
        objectKey,
        storageClass,
        status: "error",
        error: sanitizeError(error)
      });
      log("error", "minio.remote_tier.rehearsal_error", {
        bucket: bucketName,
        objectKey,
        message: error.message
      });
    } finally {
      try {
        await client.removeObject(
          bucketName,
          objectKey,
          cleanupBypass ? { governanceBypass: true } : undefined
        );
      } catch (cleanupError) {
        log("warn", "minio.remote_tier.cleanup_failed", {
          bucket: bucketName,
          objectKey,
          message: cleanupError.message
        });
      }
    }
  }
}

function resolveRemoteTierName(remoteTierConfig, defaults = {}) {
  const fromEnv = process.env.MINIO_REMOTE_TIER;
  if (fromEnv && fromEnv.trim()) {
    return fromEnv.trim();
  }
  if (remoteTierConfig && typeof remoteTierConfig.name === "string" && remoteTierConfig.name.trim()) {
    return remoteTierConfig.name.trim();
  }
  if (defaults && typeof defaults.archiveStorageClass === "string" && defaults.archiveStorageClass.trim()) {
    return defaults.archiveStorageClass.trim();
  }
  return null;
}

function hasRemoteTierCredentials() {
  const keyId = process.env.BACKBLAZE_B2_KEY_ID;
  const applicationKey = process.env.BACKBLAZE_B2_APPLICATION_KEY;
  return Boolean(keyId && keyId.trim() && applicationKey && applicationKey.trim());
}

function buildRehearsalBucketList(rehearsal, buckets) {
  if (rehearsal && Array.isArray(rehearsal.buckets) && rehearsal.buckets.length > 0) {
    return rehearsal.buckets.filter(Boolean);
  }
  return (buckets || [])
    .map((entry) => entry && entry.name)
    .filter(Boolean);
}

function extractStorageClass(metaData) {
  if (!metaData || typeof metaData !== "object") {
    return null;
  }
  for (const key of Object.keys(metaData)) {
    if (typeof key === "string" && key.toLowerCase() === "x-amz-storage-class") {
      const value = metaData[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
  }
  return null;
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function sanitizeError(error) {
  if (!error) {
    return null;
  }
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  try {
    return JSON.stringify(error);
  } catch (serializationError) {
    return String(error);
  }
}

function resolveBoolean(...candidates) {
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null || candidate === "") {
      continue;
    }
    if (typeof candidate === "boolean") {
      return candidate;
    }
    if (typeof candidate === "number") {
      if (!Number.isNaN(candidate)) {
        return candidate !== 0;
      }
    }
    if (typeof candidate === "string") {
      const normalized = candidate.trim().toLowerCase();
      if (!normalized) {
        continue;
      }
      if (["1", "true", "yes", "y", "on"].includes(normalized)) {
        return true;
      }
      if (["0", "false", "no", "n", "off"].includes(normalized)) {
        return false;
      }
    }
  }
  return null;
}

if (require.main === module) {
  main().catch((error) => {
    log("error", "minio.lifecycle.failed", { message: error.message });
    process.exitCode = 1;
  });
}

module.exports = {
  main,
  runRemoteTierRehearsal,
  evaluateLifecycleDrift,
  resolveRemoteTierName,
  resolveBoolean,
  resolveNumber,
  resolveStorageClass,
  buildRehearsalBucketList
};
