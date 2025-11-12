'use strict';

const levels = ['debug', 'info', 'warn', 'error'] as const;
type LogLevel = (typeof levels)[number];

const levelWeights = new Map<LogLevel, number>();
levels.forEach((level, index) => {
  levelWeights.set(level, index);
});

function resolveThreshold(): number {
  const envLevelRaw = process.env.LOG_LEVEL;
  const envLevel = typeof envLevelRaw === 'string' ? envLevelRaw.toLowerCase() : null;
  if (envLevel !== null && levelWeights.has(envLevel as LogLevel)) {
    return levelWeights.get(envLevel as LogLevel) ?? 1;
  }
  return levelWeights.get('info') ?? 1;
}

function isSilent(): boolean {
  return process.env.LOG_SILENT === '1';
}

type Loggable = string | number | boolean;

function log(
  level: LogLevel,
  message: string,
  metadata: Record<string, Loggable> = {}
): void {
  if (isSilent()) {
    return;
  }

  const threshold = resolveThreshold();
  const levelWeight = levelWeights.get(level) ?? threshold;
  if (levelWeight < threshold) {
    return;
  }

  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...metadata,
  };

  console.log(JSON.stringify(payload));
}

export { log };
