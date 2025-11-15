type RuntimeConfigWindow = Window & {
  __GLASS_FRONTIER_CONFIG__?: Record<string, string>;
};

const runtimeConfig: Record<string, string> =
  typeof window !== 'undefined' && (window as RuntimeConfigWindow).__GLASS_FRONTIER_CONFIG__
    ? (window as RuntimeConfigWindow).__GLASS_FRONTIER_CONFIG__!
    : {};

const envSource = (import.meta.env ?? {}) as Record<string, unknown>;

export const getConfigValue = (key: string): string | undefined => runtimeConfig[key];

export const getEnvValue = (key: string): string | undefined => {
  const value = envSource[key];
  return typeof value === 'string' ? value : undefined;
};
