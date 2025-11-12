"use strict";

const levels = ["debug", "info", "warn", "error"];
const levelWeights = levels.reduce((acc, level, index) => {
  acc[level] = index;
  return acc;
}, {});

function resolveThreshold() {
  const envLevel = process.env.LOG_LEVEL ? process.env.LOG_LEVEL.toLowerCase() : "info";

  if (!Object.prototype.hasOwnProperty.call(levelWeights, envLevel)) {
    return levelWeights.info;
  }

  return levelWeights[envLevel];
}

function isSilent() {
  return process.env.LOG_SILENT === "1";
}

function log(level, message, metadata = {}) {
  if (!levels.includes(level)) {
    throw new Error(`Unknown log level: ${level}`);
  }

  if (isSilent()) {
    return;
  }

  const threshold = resolveThreshold();

  if (levelWeights[level] < threshold) {
    return;
  }

  const timestamp = new Date().toISOString();
  const payload = {
    level,
    timestamp,
    message,
    ...metadata
  };

  // Using stdout keeps the skeleton lightweight while staying observable-friendly.
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(payload));
}

export {
  log
};
