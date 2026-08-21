import { expect, test } from '@playwright/test';

import {
  bootstrapChronicle,
  resetPlaywrightState,
  resetWiremockScenarios,
  sendTurn,
} from './utils';

test.describe('Chronicle wrap', () => {
  test.beforeEach(async ({ request }) => {
    await resetPlaywrightState(request);
    await resetWiremockScenarios(request);
  });

  test.afterEach(async ({ request }) => {
    await resetPlaywrightState(request);
  });

  test('toggles wrap mode and closes on the third upcoming turn', async ({ page }) => {
    test.setTimeout(45_000);
    const { chatInput } = await bootstrapChronicle(page);

    const wrapButton = page.getByRole('button', { name: 'Wrap Up' });
    await wrapButton.click();
    await expect(page.getByRole('button', { name: 'Wrapping' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    await page.getByRole('button', { name: 'Wrapping' }).click();
    await expect(wrapButton).toHaveAttribute('aria-pressed', 'false');
    await wrapButton.click();

    await sendTurn(page, chatInput, 'Begin drawing the vault mission toward its conclusion.');
    await sendTurn(page, chatInput, 'Secure the beacon and settle the remaining danger.');
    await sendTurn(page, chatInput, 'Close the vault and bring the chronicle home.');

    await expect(page.getByTestId('chat-closed-banner')).toHaveText(
      'This chronicle has ended. Its story is complete.'
    );
    await expect(chatInput).toBeDisabled();
    await expect(page.getByTestId('chat-submit')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Wrapping' })).toBeDisabled();
  });
});
