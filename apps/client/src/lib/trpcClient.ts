import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@glass-frontier/narrative";

const resolveTrpcUrl = (): string => {
  const explicit = import.meta.env.VITE_TRPC_URL;
  if (explicit && explicit.length > 0) {
    return explicit;
  }

  const apiTarget = import.meta.env.VITE_API_TARGET;
  if (apiTarget && apiTarget.length > 0) {
    return `${apiTarget.replace(/\/$/, "")}/trpc`;
  }

  return "/trpc";
};

export const trpcClient = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: resolveTrpcUrl()
    })
  ]
});
