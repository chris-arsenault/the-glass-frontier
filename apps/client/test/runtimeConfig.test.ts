import { afterEach, describe, expect, it, vi } from 'vitest';

describe('runtimeConfig', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('reads Vite environment values', async () => {
    vi.stubEnv('VITE_API_TARGET', 'https://api.glass-frontier.ahara.io');

    const { getEnvValue } = await import('../src/utils/runtimeConfig');

    expect(getEnvValue('VITE_API_TARGET')).toBe('https://api.glass-frontier.ahara.io');
  });
});
