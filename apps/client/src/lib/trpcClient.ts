import type { AppRouter } from '@glass-frontier/narrative';
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';

import { useAuthStore } from '../stores/authStore';
import { getConfigValue } from '../utils/runtimeConfig';

const hasValue = (value: string | undefined): value is string => {
  return typeof value === 'string' && value.length > 0;
};

const resolveTrpcUrl = (): string => {
  const explicit = getConfigValue('VITE_TRPC_URL') ?? import.meta.env.VITE_TRPC_URL;
  if (hasValue(explicit)) {
    return explicit;
  }

  const apiTarget = getConfigValue('VITE_API_TARGET') ?? import.meta.env.VITE_API_TARGET;
  if (hasValue(apiTarget)) {
    return `${apiTarget.replace(/\/$/, '')}/trpc`;
  }

  return '/trpc';
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

const authenticatedFetch: typeof fetch = async (input, init) => {
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

export const trpcClient = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      fetch: authenticatedFetch,
      headers() {
        const token = useAuthStore.getState().tokens?.idToken;
        if (typeof token === 'string' && token.length > 0) {
          return { Authorization: `Bearer ${token}` };
        }
        return {};
      },
      url: resolveTrpcUrl(),
    }),
  ],
});
