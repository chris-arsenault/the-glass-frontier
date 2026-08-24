import { describe, expect, it } from 'vitest';

import { useAuthStore } from '../src/stores/authStore';

describe('authStore', () => {
  it('keeps authentication unresolved until stored credentials have been checked', () => {
    expect(useAuthStore.getState().isCheckingCredentials).toBe(true);

    useAuthStore.getState().checkStoredCredentials();

    expect(useAuthStore.getState()).toMatchObject({
      isAuthenticated: false,
      isCheckingCredentials: false,
      tokens: null,
    });
  });
});
