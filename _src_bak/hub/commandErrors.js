"use strict";

class HubCommandError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = "HubCommandError";
    this.code = code || "hub_command_error";
    this.details = details;
  }
}

class HubAuthenticationError extends HubCommandError {
  constructor(message = "hub_authentication_failed", details = {}) {
    super(message, "hub_authentication_failed", details);
    this.name = "HubAuthenticationError";
  }
}

class HubRateLimitError extends HubCommandError {
  constructor(message = "hub_rate_limited", details = {}) {
    super(message, "hub_rate_limited", details);
    this.name = "HubRateLimitError";
  }
}

class HubValidationError extends HubCommandError {
  constructor(message = "hub_command_invalid", details = {}) {
    super(message, "hub_command_invalid", details);
    this.name = "HubValidationError";
  }
}

export {
  HubCommandError,
  HubAuthenticationError,
  HubRateLimitError,
  HubValidationError
};
