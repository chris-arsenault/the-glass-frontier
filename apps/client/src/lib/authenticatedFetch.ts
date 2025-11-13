import { useAuthStore } from '../stores/authStore';

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

export const authenticatedFetch: typeof fetch = async (input, init) => {
  const request = buildRequest(input, init);
  let response = await baseFetch(request);
  if (response.status !== 401) {
    return response;
  }

  const refreshedTokens = await useAuthStore.getState().refreshTokens();
  if (refreshedTokens === null) {
    useAuthStore.getState().logout();
    return response;
  }

  const headerBag = mergeHeaders(input, init);
  headerBag.set('Authorization', `Bearer ${refreshedTokens.idToken}`);

  const retryRequest = buildRequest(input, init, headerBag);
  response = await baseFetch(retryRequest);
  if (response.status === 401) {
    useAuthStore.getState().logout();
  }
  return response;
};
