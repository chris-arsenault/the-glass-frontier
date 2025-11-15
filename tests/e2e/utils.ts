import type { Page } from '@playwright/test';

export const authenticate = async (page: Page) => {
  await page.evaluate(async () => {
    const module = await import('/src/stores/authStore.ts');
    module.useAuthStore.setState({
      challengeUser: null,
      error: null,
      isAuthenticated: true,
      isAuthenticating: false,
      newPasswordRequired: false,
      tokens: {
        accessToken: 'test-access-token',
        idToken: 'test-id-token',
        refreshToken: 'test-refresh-token',
      },
      username: 'playwright-e2e',
    });
  });
};

export const seedChronicle = async (page: Page): Promise<{ chronicleId: string }> => {
  return page.evaluate(async () => {
    const { useChronicleStore } = await import('/src/stores/chronicleStore.ts');
    const store = useChronicleStore.getState();

    await store.refreshLoginResources();
    const refreshed = useChronicleStore.getState();
    const loginId = refreshed.loginId ?? 'playwright-e2e';
    const chronicle =
      refreshed.availableChronicles.find((entry) => entry.loginId === loginId) ??
      refreshed.availableChronicles[0] ??
      null;
    if (!chronicle) {
      throw new Error('Seeded chronicle not found.');
    }
    return { chronicleId: chronicle.id };
  });
};
