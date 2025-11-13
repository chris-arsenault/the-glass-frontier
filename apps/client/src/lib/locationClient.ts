import type { LocationRouter } from '@glass-frontier/location-api';
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';

import { useAuthStore } from '../stores/authStore';
import { getConfigValue } from '../utils/runtimeConfig';
import { authenticatedFetch } from './authenticatedFetch';

const hasValue = (value: string | undefined): value is string => {
  return typeof value === 'string' && value.length > 0;
};

const resolveLocationTrpcUrl = (): string => {
  const apiTarget = getConfigValue('VITE_API_TARGET') ?? import.meta.env.VITE_API_TARGET;
  if (hasValue(apiTarget)) {
    return `${apiTarget.replace(/\/$/, '')}/location`;
  }

  return '/location';
};

export const locationClient = createTRPCProxyClient<LocationRouter>({
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
      url: resolveLocationTrpcUrl(),
    }),
  ],
});
