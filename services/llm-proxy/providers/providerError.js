"use strict";

class ProviderError extends Error {
  constructor({ code, message, status = 502, retryable = false, details = null } = {}) {
    super(message || code || "provider_error");
    this.name = "ProviderError";
    this.code = code || "provider_error";
    this.status = status;
    this.retryable = Boolean(retryable);
    this.details = details || null;
  }
}

module.exports = {
  ProviderError
};
