export type ErrorInfo = {
  name?: string;
  message: string;
  stack?: string;
  code?: string | number;
  cause?: unknown;
};

export function normalizeError(err: unknown): ErrorInfo {
  if (err instanceof Error) {
    // Many libs stick extra fields on Error (e.g., code, cause)
    const anyErr = err as Error & { code?: string | number; cause?: unknown };
    return {
      cause: anyErr.cause,
      code: anyErr.code,
      message: err.message,
      name: err.name,
      stack: err.stack,
    };
  }
  if (typeof err === 'string') {return { message: err };}
  try {
    return { message: JSON.stringify(err) };
  } catch {
    return { message: String(err) };
  }
}