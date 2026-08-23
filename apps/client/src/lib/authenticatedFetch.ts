import { useAuthStore } from '../stores/authStore';
import { decodeJwtPayload } from '../utils/jwt';

const ACCESS_TOKEN_REFRESH_LEEWAY_MS = 60_000;
const SESSION_EXPIRED_ERROR = 'Session expired. Please sign in again.';

type AccessTokenResolution = {
  accessToken: string | null;
  refreshed: boolean;
};

const baseFetch: typeof fetch = (...args) => {
  const globalFetch = globalThis.fetch;
  if (typeof globalFetch !== 'function') {
    throw new Error('Fetch API is not available in this environment.');
  }
  return globalFetch(...args);
};

const buildRequest = (
  input: RequestInfo | URL,
  init?: RequestInit,
  headersOverride?: HeadersInit
): Request => {
  if (input instanceof Request) {
    return new Request(
      input,
      headersOverride !== undefined ? { ...init, headers: headersOverride } : init
    );
  }
  return new Request(input, {
    ...init,
    ...(headersOverride !== undefined ? { headers: headersOverride } : {}),
  });
};

const mergeHeaders = (input: RequestInfo | URL, init?: RequestInit): Headers => {
  if (input instanceof Request) {
    return new Headers(init?.headers ?? input.headers);
  }
  return new Headers(init?.headers);
};

const buildAuthenticatedRequest = (
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  accessToken: string | null
): Request => {
  if (accessToken === null) {
    return buildRequest(input, init);
  }

  const headerBag = mergeHeaders(input, init);
  headerBag.set('Authorization', `Bearer ${accessToken}`);
  return buildRequest(input, init, headerBag);
};

const accessTokenNeedsRefresh = (accessToken: string): boolean => {
  const expiration = decodeJwtPayload(accessToken)?.exp;
  return (
    typeof expiration === 'number' &&
    expiration * 1000 <= Date.now() + ACCESS_TOKEN_REFRESH_LEEWAY_MS
  );
};

const refreshAccessToken = async (): Promise<string> => {
  const refreshedTokens = await useAuthStore.getState().refreshTokens();
  if (refreshedTokens !== null) {
    return refreshedTokens.accessToken;
  }

  useAuthStore.getState().logout();
  throw new Error(SESSION_EXPIRED_ERROR);
};

const resolveAccessToken = async (): Promise<AccessTokenResolution> => {
  const accessToken = useAuthStore.getState().tokens?.accessToken ?? null;
  if (accessToken === null || !accessTokenNeedsRefresh(accessToken)) {
    return { accessToken, refreshed: false };
  }

  return { accessToken: await refreshAccessToken(), refreshed: true };
};

export const authenticatedFetch: typeof fetch = async (input, init) => {
  const tokenResolution = await resolveAccessToken();
  const request = buildAuthenticatedRequest(input, init, tokenResolution.accessToken);
  let response = await baseFetch(request);
  if (response.status !== 401) {
    return response;
  }

  if (tokenResolution.refreshed) {
    useAuthStore.getState().logout();
    return response;
  }

  const refreshedAccessToken = await refreshAccessToken();
  const retryRequest = buildAuthenticatedRequest(input, init, refreshedAccessToken);
  response = await baseFetch(retryRequest);
  if (response.status === 401) {
    useAuthStore.getState().logout();
  }
  return response;
};
