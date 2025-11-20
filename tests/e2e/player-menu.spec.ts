import { expect, test } from '@playwright/test';

import {
  authenticate,
  bootstrapChronicle,
  openPlayerMenu,
  resetPlaywrightState,
  resetWiremockScenarios,
  sendTurn,
} from './utils';

test.describe('Player menu moderation shortcuts', () => {
  test.beforeEach(async ({ request }) => {
    await resetWiremockScenarios(request);
  });

  test.afterEach(async ({ request }) => {
    await resetPlaywrightState(request);
  });
  test('hides moderation links for standard players', async ({ page }) => {
    await page.goto('/');
    await authenticate(page);

    const panel = await openPlayerMenu(page);
    await expect(panel.getByText('Admin and lore shortcuts will appear here.')).toBeVisible();
  });

  test('opens fully populated moderation workspaces for moderators', async ({ page }) => {
    const { chatInput } = await bootstrapChronicle(page, { groups: ['moderator'] });
    await sendTurn(
      page,
      chatInput,
      'Record a quick audit turn for moderation. #beat:update #mock:beat:update'
    );

    const auditPanel = await openPlayerMenu(page);
    await auditPanel.getByRole('button', { name: 'LLM Audit Review' }).click();
    await expect(page.getByRole('heading', { name: 'LLM Audit Review' })).toBeVisible();
    await page.locator('#audit-filter-player').fill('playwright-e2e');
    await page.getByRole('button', { name: 'Apply Filters' }).click();
    await expect(page.getByRole('button', { name: 'Open Review' }).first()).toBeEnabled({
      timeout: 15_000,
    });
    await page.getByRole('button', { name: 'Back to Chronicle' }).click();

    const bugPanel = await openPlayerMenu(page);
    await bugPanel.getByRole('button', { name: 'Bug Moderation' }).click();
    await expect(page.getByRole('heading', { name: 'Bug Moderation' })).toBeVisible();
    await expect(page.getByLabel('Search bug reports')).toBeVisible();
    await page.getByRole('button', { name: 'Back to Chronicle' }).click();

    const locationPanel = await openPlayerMenu(page);
    await locationPanel.getByRole('button', { name: 'Location Maintenance' }).click();
    await expect(page.getByRole('heading', { name: 'Location Maintenance' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Luminous Quay/i }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Back to Chronicle' }).click();
  });
});
