"use strict";

import { log  } from "../../utils/logger.js";

class HttpTemporalModerationClient {
  constructor({
    endpoint,
    token = null,
    sharedTransportKey = null,
    channel = "admin:moderation",
    fetchImpl = global.fetch,
    logger = log,
    timeoutMs = 10000
  } = {}) {
    if (!endpoint) {
      throw new Error("http_temporal_moderation_client_requires_endpoint");
    }
    if (typeof fetchImpl !== "function") {
      throw new Error("http_temporal_moderation_client_requires_fetch");
    }

    this.endpoint = endpoint;
    this.token = token;
    this.sharedTransportKey = sharedTransportKey;
    this.channel = channel;
    this.fetch = fetchImpl;
    this.log = logger;
    this.timeoutMs = timeoutMs;
  }

  async syncCadenceSnapshot({ sessionId, queue, timestamp }) {
    if (!sessionId || !queue) {
      return;
    }

    const body = JSON.stringify({
      sessionId,
      timestamp: timestamp || new Date().toISOString(),
      queue
    });

    const headers = {
      "content-type": "application/json",
      "user-agent": "the-glass-frontier/temporal-moderation-bridge",
      "x-shared-transport-channel": this.channel,
      "x-session-id": sessionId
    };

    if (this.token) {
      headers.authorization = `Bearer ${this.token}`;
    }
    if (this.sharedTransportKey) {
      headers["x-shared-transport-key"] = this.sharedTransportKey;
    }

    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timeout =
      controller && this.timeoutMs > 0
        ? setTimeout(() => controller.abort(), this.timeoutMs)
        : null;

    try {
      const response = await this.fetch(this.endpoint, {
        method: "POST",
        headers,
        body,
        signal: controller ? controller.signal : undefined
      });

      if (!response || !response.ok) {
        let responseText = "";
        if (response && typeof response.text === "function") {
          try {
            responseText = await response.text();
          } catch (_error) {
            responseText = "";
          }
        }

        const error = new Error(
          `temporal_moderation_sync_failed: ${response?.status || "unknown"}`
        );
        error.code = "temporal_moderation_sync_failed";
        if (response) {
          error.status = response.status;
          error.statusText = response.statusText;
        }
        if (responseText) {
          error.details = responseText;
        }
        throw error;
      }
    } catch (error) {
      if (error.name === "AbortError") {
        const timeoutError = new Error("temporal_moderation_sync_timeout");
        timeoutError.code = "temporal_moderation_sync_timeout";
        throw timeoutError;
      }
      throw error;
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }
}

export {
  HttpTemporalModerationClient
};
