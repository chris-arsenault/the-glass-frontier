"use strict";

const EventEmitter = require("events");
const { VerbCatalog, normalizeVerbDefinition } = require("../verbCatalog");

class HubVerbCatalogStore extends EventEmitter {
  constructor({
    repository,
    fallbackCatalog = null,
    clock = Date,
    ttlMs = 60000
  } = {}) {
    super();
    if (!repository || typeof repository.listActiveVerbs !== "function") {
      throw new Error("HubVerbCatalogStore requires a repository with listActiveVerbs()");
    }
    this.repository = repository;
    this.fallbackCatalog = fallbackCatalog;
    this.clock = clock;
    this.ttlMs = ttlMs;
    this.cache = new Map();
  }

  async ensureCatalog(hubId) {
    const entry = this.cache.get(hubId || "__default__");
    const now = this._now();
    if (entry && entry.expiresAt > now) {
      return entry.catalog;
    }
    return this.reload(hubId);
  }

  async reload(hubId) {
    const now = this._now();
    const rows = await this.repository.listActiveVerbs({ hubId });
    const builder = buildCatalog(rows, this.fallbackCatalog);
    const catalog = builder.catalog;
    const versionStamp = builder.versionStamp;
    const cacheKey = hubId || "__default__";

    const previous = this.cache.get(cacheKey);
    this.cache.set(cacheKey, {
      catalog,
      versionStamp,
      verbs: builder.verbs,
      updatedAt: now,
      expiresAt: now + this.ttlMs
    });

    if (!previous || previous.versionStamp !== versionStamp) {
      this.emit("catalogUpdated", {
        hubId: hubId || null,
        versionStamp,
        verbs: builder.verbs
      });
    }

    return catalog;
  }

  invalidate(hubId) {
    const cacheKey = hubId || "__default__";
    this.cache.delete(cacheKey);
  }

  getCatalog(hubId) {
    const cacheKey = hubId || "__default__";
    const entry = this.cache.get(cacheKey);
    return entry ? entry.catalog : null;
  }

  getVersionStamp(hubId) {
    const cacheKey = hubId || "__default__";
    const entry = this.cache.get(cacheKey);
    return entry ? entry.versionStamp : null;
  }

  listVerbs(hubId) {
    const cacheKey = hubId || "__default__";
    const entry = this.cache.get(cacheKey);
    return entry ? entry.verbs : [];
  }

  _now() {
    if (this.clock && typeof this.clock.now === "function") {
      return this.clock.now();
    }
    return Date.now();
  }
}

function buildCatalog(rows, fallbackCatalog) {
  const verbs = new Map();
  let latestTimestamp = 0;
  let latestVersion = 0;

  rows.forEach((row) => {
    if (!row) {
      return;
    }
    const normalized = normalizeVerbDefinition(row.definition);
    verbs.set(row.verbId, normalized);

    if (row.updatedAt) {
      const ts = row.updatedAt instanceof Date ? row.updatedAt.getTime() : new Date(row.updatedAt).getTime();
      if (ts > latestTimestamp) {
        latestTimestamp = ts;
      }
    }
    if (row.version && row.version > latestVersion) {
      latestVersion = row.version;
    }
  });

  if (verbs.size === 0 && fallbackCatalog) {
    fallbackCatalog.list().forEach((definition) => {
      verbs.set(definition.verbId, definition);
    });
  } else if (fallbackCatalog) {
    fallbackCatalog.list().forEach((definition) => {
      if (!verbs.has(definition.verbId)) {
        verbs.set(definition.verbId, definition);
      }
    });
  }

  const catalog = new VerbCatalog(Array.from(verbs.values()));
  const versionStamp =
    latestTimestamp === 0 && latestVersion === 0
      ? `bootstrap:${catalog.list().length}`
      : `${latestVersion}:${latestTimestamp}`;

  return {
    catalog,
    verbs: catalog.list(),
    versionStamp
  };
}

module.exports = {
  HubVerbCatalogStore
};

