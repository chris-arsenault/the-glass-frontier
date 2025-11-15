import { expect, test, type Page } from '@playwright/test';

const authenticate = async (page: Page) => {
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

test.describe('Landing page', () => {
  test('is accessible once authenticated', async ({ page }) => {
    await page.goto('/');
    await authenticate(page);

    await expect(
      page.getByRole('heading', {
        name: 'Stay briefed before you dive into your next chronicle.',
      })
    ).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Your chronicles' })).toBeVisible();
    await expect(page.locator('.landing-status-chip')).toBeVisible();
  });
});
