"use strict";

class ProviderError extends Error {
  code: string
  status: number
  retryable: boolean
  details: Record<string, any>

  constructor({ code = "", status = 502, retryable = false, details = {} } = {}) {
    super(code || "provider_error");
    this.name = "ProviderError";
    this.code = code || "provider_error";
    this.status = status;
    this.retryable = Boolean(retryable);
    this.details = details;
  }
}

export {
  ProviderError
};
