'use strict';
const levels = ['debug', 'info', 'warn', 'error'];
const levelWeights = new Map();
levels.forEach((level, index) => {
    levelWeights.set(level, index);
});
function resolveThreshold() {
    const envLevelRaw = process.env.LOG_LEVEL;
    const envLevel = typeof envLevelRaw === 'string' ? envLevelRaw.toLowerCase() : null;
    if (envLevel !== null && levelWeights.has(envLevel)) {
        return levelWeights.get(envLevel) ?? 1;
    }
    return levelWeights.get('info') ?? 1;
}
function isSilent() {
    return process.env.LOG_SILENT === '1';
}
function log(level, message, metadata = {}) {
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
