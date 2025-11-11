"use strict";

/**
 * Remove proxy-specific fields and apply defaults that downstream providers
 * expect. The original request body is left untouched.
 *
 * @param {object} body
 * @returns {object}
 */
function sanitizeBasePayload(body = {}) {
  if (!body || typeof body !== "object") {
    return {};
  }

  const clone = { ...body };
  delete clone.provider;
  delete clone.fallbackProviders;

  if (!clone.model && process.env.LLM_PROXY_DEFAULT_MODEL) {
    clone.model = process.env.LLM_PROXY_DEFAULT_MODEL;
  }

  return clone;
}

export {
  sanitizeBasePayload
};
