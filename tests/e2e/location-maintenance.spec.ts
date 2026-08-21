import { expect, test } from '@playwright/test';

import {
  authenticate,
  openPlayerMenu,
  resetPlaywrightState,
  resetWiremockScenarios,
} from './utils';

test.describe('World Atlas relationships', () => {
  test.beforeEach(async ({ request }) => {
    await resetPlaywrightState(request);
    await resetWiremockScenarios(request);
  });

  test.afterEach(async ({ request }) => {
    await resetPlaywrightState(request);
  });

  test('renders the canon relationships of a fixture location', async ({ page }) => {
    await page.goto('/');
    await authenticate(page, { groups: ['moderator'] });

    const menu = await openPlayerMenu(page);
    await menu.getByRole('button', { name: 'World Atlas' }).click();
    await expect(page.getByRole('heading', { name: 'World Atlas' })).toBeVisible();

    await page.getByRole('button', { name: /Luminous Quay/i }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Luminous Quay' })).toBeVisible();

    // The Atlas is a reader over materialized canon: the batch-committed
    // relationships render, and no editing affordance is offered.
    const relationship = page.locator('.atlas-link-row').filter({ hasText: 'Glass Wardens' });
    await expect(relationship).toContainText('controls', { timeout: 10_000 });
    await expect(page.locator('.atlas-add-link')).toHaveCount(0);
  });
});
