/* eslint-disable importPlugin/no-extraneous-dependencies */
import { expect, test } from '@playwright/test';

import {
  bootstrapChronicle,
  resetPlaywrightState,
  resetWiremockScenarios,
} from './utils';

const DIALOG_LABEL = 'Dialog';
const DIALOG_SUBJECT = 'Amaya Venn';
const ROLE_SELECTOR = '.chat-entry-role';

test.describe('Curated scene types', () => {
  test.beforeEach(async ({ request }) => {
    await resetPlaywrightState(request);
    await resetWiremockScenarios(request);
  });

  test.afterEach(async ({ request }) => {
    await resetPlaywrightState(request);
  });

  test('enters and completes a dialog through free text', async ({ page }) => {
    test.setTimeout(35_000);
    const { chatInput } = await bootstrapChronicle(page);

    await chatInput.fill(`I find ${DIALOG_SUBJECT} and ask about the missing cargo. #scene:dialog:start`);
    await page.getByTestId('chat-submit').click();

    await expect(
      page.getByText('Amaya Venn folds her hands over the quay ledger. "Ask what you came to ask."')
    ).toBeVisible({ timeout: 15_000 });
    const stage = page.getByTestId('scene-stage');
    await expect(stage).toContainText(DIALOG_SUBJECT);
    await expect(stage).toContainText(DIALOG_LABEL);
    const firstGmEntry = page.locator('.chat-entry-gm').last();
    await expect(firstGmEntry.locator(ROLE_SELECTOR)).toHaveText(DIALOG_SUBJECT);
    await expect(firstGmEntry.locator('.chat-entry-scene-tag')).toContainText('dialog');

    await chatInput.fill('I thank her, say goodbye, and leave. #scene:dialog:end');
    await page.getByTestId('chat-submit').click();

    await expect(
      page.getByText('Amaya gives one curt nod and turns back to the ledger as you leave.')
    ).toBeVisible({ timeout: 15_000 });
    await expect(stage).toHaveCount(0);
    const finalGmEntry = page.locator('.chat-entry-gm').last();
    await expect(finalGmEntry.locator(ROLE_SELECTOR)).toHaveText(DIALOG_SUBJECT);
    await expect(firstGmEntry.locator(ROLE_SELECTOR)).toHaveText(DIALOG_SUBJECT);
  });
});
