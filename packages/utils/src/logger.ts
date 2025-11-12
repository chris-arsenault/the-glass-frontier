'use strict';

const levels = ['debug', 'info', 'warn', 'error'];
const levelWeights = levels.reduce((acc: Record<string, number>, level: string, index: number) => {
  acc[level] = index;
  return acc;
}, {});

function resolveThreshold() {
  const envLevel = process.env.LOG_LEVEL ? process.env.LOG_LEVEL.toLowerCase() : 'info';

  if (!Object.prototype.hasOwnProperty.call(levelWeights, envLevel)) {
    return levelWeights.info;
  }

  return levelWeights[envLevel];
}

function isSilent() {
  return process.env.LOG_SILENT === '1';
}

type Loggable = string | number | boolean;

function log(level: string, message: string, metadata: Record<string, Loggable> = {}) {
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
    ...metadata,
  };

  // Using stdout keeps the skeleton lightweight while staying observable-friendly.
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(payload));
}

export { log };
