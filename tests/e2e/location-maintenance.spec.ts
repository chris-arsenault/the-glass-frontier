import { expect, test } from '@playwright/test';

import {
  bootstrapChronicle,
  openPlayerMenu,
  resetPlaywrightState,
  resetWiremockScenarios,
  sendTurn,
} from './utils';

test.describe('Location maintenance relationships', () => {
  test.beforeEach(async ({ request }) => {
    await resetWiremockScenarios(request);
  });

  test.afterEach(async ({ request }) => {
    await resetPlaywrightState(request);
  });

  test('adds and removes adjacency for a newly created place', async ({ page }) => {
    const { chatInput } = await bootstrapChronicle(page, { groups: ['moderator'] });
    await sendTurn(page, chatInput, '#loc:maintenance Survey the maintenance corridors.');

    const menu = await openPlayerMenu(page);
    await menu.getByRole('button', { name: 'Location Maintenance' }).click();
    await expect(page.getByRole('heading', { name: 'Location Maintenance' })).toBeVisible();

    await page.getByRole('button', { name: /Luminous Quay/i }).click();
    const gridRows = page.locator('.MuiDataGrid-row');
    const maintenanceRow = gridRows.filter({ hasText: 'Maintenance Bay' }).first();
    await expect(maintenanceRow).toBeVisible({ timeout: 15_000 });
    await maintenanceRow.scrollIntoViewIfNeeded();
    const relationshipsButton = maintenanceRow.getByRole('button', {
      name: /Manage relationships for Maintenance Bay/i,
    });
    await expect(relationshipsButton).toBeVisible({ timeout: 10_000 });
    await relationshipsButton.click();

    const dialog = page.getByRole('dialog', { name: 'Manage relationships' });
    await expect(dialog).toBeVisible();

    await dialog.getByLabel('Target location').selectOption({ label: 'Prism Walk' });
    await dialog.getByLabel('Relationship type').selectOption('ADJACENT_TO');
    await dialog.getByRole('button', { name: 'Add relationship' }).click();

    const newEdgeRow = dialog
      .locator('.lm-edge-list')
      .first()
      .locator('li')
      .filter({ hasText: 'Prism Walk' });
    await expect(newEdgeRow).toBeVisible({ timeout: 10_000 });

    await newEdgeRow.getByRole('button', { name: '×' }).click();
    await expect(
      dialog
        .locator('.lm-edge-list')
        .first()
        .locator('li')
        .filter({ hasText: 'Prism Walk' })
    ).toHaveCount(0, { timeout: 15_000 });

    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();
  });
});
