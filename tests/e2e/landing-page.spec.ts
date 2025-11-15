import { expect, test } from '@playwright/test';

import { authenticate } from './utils';

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
