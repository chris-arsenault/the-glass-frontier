import type { AppRouter } from '@glass-frontier/gm-api';
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';

import { useAuthStore } from '../stores/authStore';
import { getConfigValue, getEnvValue } from '../utils/runtimeConfig';
import { authenticatedFetch } from './authenticatedFetch';

const hasValue = (value: string | undefined): value is string => {
  return typeof value === 'string' && value.length > 0;
};

const resolveGmTrpcUrl = (): string => {
  const apiTarget = getConfigValue('VITE_API_TARGET') ?? getEnvValue('VITE_API_TARGET');
  if (hasValue(apiTarget)) {
    return `${apiTarget.replace(/\/$/, '')}/gm`;
  }

  return '/gm';
};

export const gmClient = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      fetch: authenticatedFetch,
      headers() {
        const token = useAuthStore.getState().tokens?.accessToken;
        if (typeof token === 'string' && token.length > 0) {
          return { Authorization: `Bearer ${token}` };
        }
        return {};
      },
      url: resolveGmTrpcUrl(),
    }),
  ],
});
