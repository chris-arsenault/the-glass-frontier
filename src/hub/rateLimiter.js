"use strict";

const { HubRateLimitError } = require("./commandErrors");

class RateLimiter {
  constructor({ clock = Date } = {}) {
    this.clock = clock;
    this.state = new Map();
  }

  _now() {
    if (typeof this.clock.now === "function") {
      return this.clock.now();
    }
    return Date.now();
  }

  _key(actorId, verbId, scope = "actor") {
    return `${scope}:${actorId}:${verbId}`;
  }

  enforce(config, { actorId, verbId, scope = "actor" }) {
    if (!config || !config.enabled) {
      return;
    }

    const {
      burst = 5,
      perSeconds = 10,
      shared = false,
      errorCode = "hub_rate_limited"
    } = config;

    if (!actorId || !verbId) {
      throw new HubRateLimitError("rate_limit_context_missing", {
        actorId,
        verbId
      });
    }

    const windowMs = perSeconds * 1000;
    const now = this._now();
    const key = this._key(shared ? "shared" : actorId, verbId, scope);
    const history = this.state.get(key) || [];
    const filtered = history.filter((timestamp) => now - timestamp < windowMs);

    if (filtered.length + 1 > burst) {
      const retryIn = windowMs - (now - filtered[0]);
      throw new HubRateLimitError(errorCode, {
        actorId,
        verbId,
        burst,
        perSeconds,
        retryIn
      });
    }

    filtered.push(now);
    this.state.set(key, filtered);
  }

  reset(actorId, verbId) {
    if (!actorId || !verbId) {
      return;
    }
    for (const scope of ["actor", "room"]) {
      const key = this._key(actorId, verbId, scope);
      this.state.delete(key);
    }
  }
}

module.exports = {
  RateLimiter
};
