"use strict";

function clone(value) {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value));
}

function toIsoTimestamp(value) {
  if (!value) {
    return new Date().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  return new Date().toISOString();
}

function normalizeSafetyFlags(flags) {
  if (!Array.isArray(flags) || flags.length === 0) {
    return [];
  }

  const normalized = new Set();
  flags.forEach((flag) => {
    if (typeof flag === "string") {
      normalized.add(flag);
    } else if (flag && typeof flag.id === "string") {
      normalized.add(flag.id);
    }
  });
  return Array.from(normalized).sort();
}

function hasChanged(before, after) {
  return JSON.stringify(before) !== JSON.stringify(after);
}

function createShard(initialData, actor = "seed", timestamp = new Date().toISOString()) {
  return {
    data: clone(initialData),
    revision: 1,
    updatedAt: timestamp,
    updatedBy: actor
  };
}

export {
  clone,
  toIsoTimestamp,
  normalizeSafetyFlags,
  hasChanged,
  createShard
};
