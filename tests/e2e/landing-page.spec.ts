import { expect, test } from '@playwright/test';

import { authenticate, resetPlaywrightState } from './utils';

test.describe('Landing page', () => {
  test.beforeEach(async ({ request }) => {
    await resetPlaywrightState(request);
  });

  test('is accessible once authenticated', async ({ page }) => {
    await page.goto('/');
    await authenticate(page);

    await expect(
      page.getByRole('heading', {
        name: 'Welcome back',
      })
    ).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Your chronicles' })).toBeVisible();
    await expect(page.locator('.landing-status-chip').first()).toBeVisible();
  });

  test('shows active chronicles to member-tier players', async ({ page }) => {
    await page.goto('/');
    await authenticate(page, { groups: ['user'] });
    const activityPanel = page.locator('.landing-panel').filter({
      has: page.getByRole('heading', { name: 'Around the frontier' }),
    });

    await expect(activityPanel.getByText('Active', { exact: true })).toBeVisible();
    await expect(activityPanel.getByText('Playwright Chronicle')).toBeVisible();
  });

  test('does not expose active chronicles to free-tier players', async ({ page }) => {
    await page.goto('/');
    await authenticate(page, { groups: ['free'] });
    const activityPanel = page.locator('.landing-panel').filter({
      has: page.getByRole('heading', { name: 'Around the frontier' }),
    });

    await expect(activityPanel.getByText('Active', { exact: true })).toHaveCount(0);
    await expect(activityPanel).toContainText('No chronicle activity yet.');
  });
});
