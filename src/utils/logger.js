"use strict";

const levels = ["debug", "info", "warn", "error"];

function log(level, message, metadata = {}) {
  if (!levels.includes(level)) {
    throw new Error(`Unknown log level: ${level}`);
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

module.exports = {
  log
};
