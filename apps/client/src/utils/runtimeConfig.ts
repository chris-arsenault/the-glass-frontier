declare global {
  interface Window {
    __GLASS_FRONTIER_CONFIG__?: Record<string, string>;
  }
}

const runtimeConfig =
  typeof window !== 'undefined' && window.__GLASS_FRONTIER_CONFIG__
    ? window.__GLASS_FRONTIER_CONFIG__
    : {};

export const getConfigValue = (key: string): string | undefined => {
  return runtimeConfig[key];
};
