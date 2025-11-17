import { expect, test } from '@playwright/test';

import {
  bootstrapChronicle,
  ensureFeedbackVisibility,
  openPlayerMenu,
  resetPlaywrightState,
  resetWiremockScenarios,
  sendTurn,
} from './utils';

test.describe('Chronicle deltas', () => {
  test.beforeEach(async ({ request }) => {
    await resetWiremockScenarios(request);
  });

  test.afterEach(async ({ request }) => {
    await resetPlaywrightState(request);
  });

  test('tracks multi-turn location transitions and inventory changes', async ({ page }) => {
    const { chatInput } = await bootstrapChronicle(page, { groups: ['moderator'] });
    await ensureFeedbackVisibility(page, 'all');
    const locationPill = page.locator('.location-pill-value');
    const locationPath = page.locator('.location-pill-path');

    await expect(locationPill).toContainText('Luminous Quay');

    const gmEntry = await sendTurn(
      page,
      chatInput,
      '#loc:auric Sweep the console banks for hidden sensors.'
    );

    await expect(locationPill).toContainText('Auric Causeway', { timeout: 15_000 });

    const badge = gmEntry.locator('.inventory-delta-badge');
    await expect(badge).toBeVisible();
    await badge.hover();
    const deltaRows = gmEntry.locator('.inventory-delta-row');
    await expect(deltaRows).toHaveCount(3);
    await expect(gmEntry.locator('.inventory-delta-row.inventory-delta-add')).toContainText('Auric Loom');
    await expect(gmEntry.locator('.inventory-delta-row.inventory-delta-remove')).toContainText('Vault Access Seed');
    await expect(gmEntry.locator('.inventory-delta-row.inventory-delta-consume')).toContainText('Starlight Draught');
    await expect(gmEntry.locator('.inventory-delta-row').filter({ hasText: 'Auric Loom' })).toHaveCount(1);

    await page.getByRole('button', { name: 'Toggle character sheet' }).click();
    const drawer = page.locator('.character-drawer.open');
    await expect(drawer).toBeVisible();
    const inventoryCards = drawer.locator('.inventory-kind-card');
    await expect(inventoryCards).toHaveCount(4);
    await expect(inventoryCards.filter({ hasText: 'Relics' })).toContainText('Auric Loom');
    await expect(inventoryCards.filter({ hasText: 'Consumables' })).toContainText('Starlight Draught');
    await drawer.getByRole('button', { name: 'Close character sheet' }).click();

    await sendTurn(page, chatInput, '#loc:maintenance Descend into the maintenance bay.');
    await expect(locationPill).toContainText('Maintenance Bay', { timeout: 15_000 });

    await sendTurn(page, chatInput, '#loc:quay Return to the Luminous Quay observation deck.');
    await expect(locationPill).not.toContainText('Maintenance Bay', { timeout: 15_000 });
    await expect(locationPill).toContainText('Luminous Quay', { timeout: 15_000 });
    const breadcrumbText = ((await locationPath.textContent()) ?? '').replace(/\s+/g, ' ').trim();
    if (breadcrumbText !== 'Luminous Quay') {
      throw new Error(
        `Location breadcrumb failed to return home (expected "Luminous Quay", saw "${breadcrumbText}")`
      );
    }

    await sendTurn(page, chatInput, '#loc:prism Stride onto the Prism Walk and signal the towers.');
    await expect(locationPill).toContainText('Prism Walk', { timeout: 15_000 });

    const menu = await openPlayerMenu(page);
    await menu.getByRole('button', { name: 'Location Maintenance' }).click();
    await expect(page.getByRole('heading', { name: 'Location Maintenance' })).toBeVisible();
    await page.getByRole('button', { name: /Luminous Quay/i }).click();
    const gridRows = page.locator('.MuiDataGrid-row');
    await expect(gridRows.first()).toBeVisible({ timeout: 15_000 });
    await expect(gridRows.filter({ hasText: 'Maintenance Bay' }).first()).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole('button', { name: 'Back to Chronicle' }).click();
  });
});
