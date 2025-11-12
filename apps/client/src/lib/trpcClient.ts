import type { AppRouter } from '@glass-frontier/narrative';
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';

import { getAuthHeaders } from '../stores/authStore';
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

export const trpcClient = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      headers() {
        return getAuthHeaders();
      },
      url: resolveTrpcUrl(),
    }),
  ],
});
