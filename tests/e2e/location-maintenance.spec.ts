import { expect, test } from '@playwright/test';

import {
  authenticate,
  openPlayerMenu,
  resetPlaywrightState,
  resetWiremockScenarios,
} from './utils';

const GLASS_WARDENS_ID = '88888888-7777-4666-8555-444444444444';

test.describe('World Atlas relationships', () => {
  test.beforeEach(async ({ request }) => {
    await resetPlaywrightState(request);
    await resetWiremockScenarios(request);
  });

  test.afterEach(async ({ request }) => {
    await resetPlaywrightState(request);
  });

  test('adds and removes a relationship between fixture entities', async ({ page }) => {
    await page.goto('/');
    await authenticate(page, { groups: ['moderator'] });

    const menu = await openPlayerMenu(page);
    await menu.getByRole('button', { name: 'World Atlas' }).click();
    await expect(page.getByRole('heading', { name: 'World Atlas' })).toBeVisible();

    await page.getByRole('button', { name: /Luminous Quay/i }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Luminous Quay' })).toBeVisible();

    const relationshipEditor = page.locator('.atlas-add-link');
    await relationshipEditor.locator('select').selectOption('related_to');
    await relationshipEditor.getByPlaceholder('Target entity id').fill(GLASS_WARDENS_ID);
    await relationshipEditor.getByRole('button', { name: 'Add link' }).click();

    const relationship = page.locator('.atlas-link-row').filter({ hasText: 'Glass Wardens' });
    await expect(relationship).toContainText('related_to', { timeout: 10_000 });
    await relationship.getByRole('button', { name: 'Remove' }).click();
    await expect(relationship).toHaveCount(0, { timeout: 10_000 });
  });
});
