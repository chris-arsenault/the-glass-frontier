/* eslint-disable importPlugin/no-extraneous-dependencies */
import { expect, test } from '@playwright/test';

import {
  bootstrapChronicle,
  resetPlaywrightState,
  resetWiremockScenarios,
} from './utils';

const DIALOG_LABEL = 'Dialog';
const DIALOG_SUBJECT = 'Amaya Venn';
const DIALOG_QUESTION = 'Will Amaya Venn reveal what she knows?';

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
    await expect(stage).toContainText(DIALOG_QUESTION);
    await expect(stage).toContainText(DIALOG_LABEL);
    await chatInput.fill('I thank her, say goodbye, and leave. #scene:dialog:end');
    await page.getByTestId('chat-submit').click();

    await expect(
      page.getByText('Amaya gives one curt nod and turns back to the ledger as you leave.')
    ).toBeVisible({ timeout: 15_000 });
    await expect(stage).toHaveCount(0);
  });
});
