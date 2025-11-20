'use strict';

class ProviderError extends Error {
  code: string;
  status: number;
  retryable: boolean;
  details: Record<string, unknown>;

  constructor({
    code = '',
    details = {},
    message,
    retryable = false,
    status = 502,
  }: {
    code?: string;
    details?: Record<string, unknown>;
    message?: string;
    retryable?: boolean;
    status?: number;
  } = {}) {
    const normalizedMessage =
      typeof message === 'string' && message.trim().length > 0
        ? message
        : code.trim().length > 0
          ? code
          : 'provider_error';
    super(normalizedMessage);
    this.name = 'ProviderError';
    this.code = code.trim().length > 0 ? code : 'provider_error';
    this.status = status;
    this.retryable = Boolean(retryable);
    this.details = details;
  }
}

export { ProviderError };
