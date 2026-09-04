import { expect, test } from '@playwright/test';

import {
  bootstrapChronicle,
  openPlayerMenu,
  resetPlaywrightState,
  resetWiremockScenarios,
  sendTurn,
} from './utils';

test.describe('Chronicle deltas', () => {
  test.beforeEach(async ({ request }) => {
    await resetPlaywrightState(request);
    await resetWiremockScenarios(request);
  });

  test.afterEach(async ({ request }) => {
    await resetPlaywrightState(request);
  });

  test('tracks session-scoped location transitions and inventory changes', async ({ page }) => {
    test.setTimeout(30_000);
    const { chatInput } = await bootstrapChronicle(page, { groups: ['moderator'] });
    const locationPill = page.locator('.location-pill-value');

    await expect(locationPill).toContainText('Luminous Quay');
    const locationAtlasLink = locationPill.getByRole('link', { name: 'Luminous Quay' });
    await expect(locationAtlasLink).toHaveAttribute('href', '/atlas/luminous_quay');
    await locationAtlasLink.click();
    const atlasModal = page.getByRole('dialog', { name: 'World Atlas entry' });
    await expect(
      atlasModal.getByRole('heading', { level: 1, name: 'Luminous Quay' })
    ).toBeVisible();
    await atlasModal.getByRole('button', { name: 'Close Atlas dialog' }).click();

    const gmEntry = await sendTurn(
      page,
      chatInput,
      '#loc:auric Sweep the console banks for hidden sensors.'
    );

    await expect(locationPill).toContainText('Auric Causeway', { timeout: 15_000 });
    const nearbyAtlasLink = page
      .getByRole('navigation', { name: 'Chronicle' })
      .getByRole('link', { name: /Luminous Quay/i });
    await expect(nearbyAtlasLink).toHaveAttribute('href', '/atlas/luminous_quay');

    const badge = gmEntry.locator('.inventory-delta-badge');
    await expect(badge).toBeVisible();
    await badge.hover();
    const deltaRows = gmEntry.locator('.inventory-delta-row');
    await expect(deltaRows).toHaveCount(3);
    await expect(deltaRows.filter({ hasText: 'Auric Loom' })).toHaveCount(1);
    await expect(deltaRows.filter({ hasText: 'Vault Access Seed' })).toHaveCount(1);
    await expect(deltaRows.filter({ hasText: 'Starlight Draught' })).toHaveCount(1);

    await page
      .getByRole('navigation', { name: 'Chronicle' })
      .getByRole('button', { name: 'E2E Scout', exact: true })
      .click();
    const drawer = page.locator('.character-drawer.open');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('heading', { name: 'Gear' })).toBeVisible();
    await expect(drawer.getByRole('heading', { name: 'Relics' })).toBeVisible();
    await expect(drawer.getByRole('heading', { name: 'Consumables' })).toBeVisible();
    await expect(drawer.getByRole('heading', { name: 'Supplies' })).toBeVisible();
    await drawer.getByRole('button', { name: 'Close character sheet' }).click();

    await sendTurn(
      page,
      chatInput,
      '#loc:maintenance Descend into the maintenance bay.'
    );
    await expect(locationPill).toContainText('Maintenance Bay', { timeout: 15_000 });

    await sendTurn(
      page,
      chatInput,
      '#loc:quay Return to the Luminous Quay observation deck.'
    );
    await expect(locationPill).not.toContainText('Maintenance Bay', { timeout: 15_000 });
    await expect(locationPill).toContainText('Luminous Quay', { timeout: 15_000 });

    await sendTurn(
      page,
      chatInput,
      '#loc:prism Stride onto the Prism Walk and signal the towers.'
    );
    await expect(locationPill).toContainText('Prism Walk', { timeout: 15_000 });

    const menu = await openPlayerMenu(page);
    await menu.getByRole('button', { name: 'World Atlas' }).click();
    await expect(page.getByRole('heading', { name: 'World Atlas' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Luminous Quay/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Maintenance Bay/i })).toHaveCount(0);
  });
});
