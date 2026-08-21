import { afterEach, describe, expect, it, vi } from 'vitest';

describe('runtimeConfig', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('reads Vite environment values', async () => {
    vi.stubEnv('VITE_PROGRESS_WS_URL', 'ws://localhost:8787');

    const { getEnvValue } = await import('../src/utils/runtimeConfig');

    expect(getEnvValue('VITE_PROGRESS_WS_URL')).toBe('ws://localhost:8787');
  });
});
