type RuntimeConfigWindow = Window & {
  __GLASS_FRONTIER_CONFIG__?: Record<string, string>;
};

const runtimeConfig: Record<string, string> =
  typeof window !== 'undefined' && (window as RuntimeConfigWindow).__GLASS_FRONTIER_CONFIG__
    ? (window as RuntimeConfigWindow).__GLASS_FRONTIER_CONFIG__!
    : {};

const resolveEnvSource = (meta: unknown): Record<string, unknown> => {
  if (typeof meta !== 'object' || meta === null || !('env' in meta)) {
    return {};
  }
  const env = (meta as { env?: unknown }).env;
  return typeof env === 'object' && env !== null
    ? env as Record<string, unknown>
    : {};
};

const envSource = resolveEnvSource(import.meta);

export const getConfigValue = (key: string): string | undefined => runtimeConfig[key];

export const getEnvValue = (key: string): string | undefined => {
  const value = envSource[key];
  return typeof value === 'string' ? value : undefined;
};
