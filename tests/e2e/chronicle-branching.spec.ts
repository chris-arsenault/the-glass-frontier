import { expect, test } from '@playwright/test';

import {
  bootstrapChronicle,
  resetPlaywrightState,
  resetWiremockScenarios,
  sendTurn,
} from './utils';

test.describe('Chronicle branching', () => {
  test.beforeEach(async ({ request }) => {
    await resetPlaywrightState(request);
    await resetWiremockScenarios(request);
  });

  test.afterEach(async ({ request }) => {
    await resetPlaywrightState(request);
  });

  test('resumes an active chronicle from a completed turn as the next version', async ({
    page,
  }) => {
    test.setTimeout(30_000);
    const { chatInput, chronicleId } = await bootstrapChronicle(page);
    const playerMove = 'Record this path before testing another outcome.';

    await sendTurn(page, chatInput, playerMove);
    const branchButton = page.getByRole('button', {
      name: 'Resume chronicle from turn 1',
    });
    await expect(branchButton).toBeVisible();
    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('The original chronicle will remain unchanged.');
      await dialog.accept();
    });
    await branchButton.click();

    await expect(page).toHaveURL(new RegExp(`/chron/(?!${chronicleId}$)[0-9a-f-]+$`, 'u'));
    await expect(page.getByRole('heading', { name: 'Playwright Chronicle v2' })).toBeVisible();
    await expect(page.locator('.chat-entry-player').filter({ hasText: playerMove })).toBeVisible();
    await expect(chatInput).toBeEnabled();
  });
});
