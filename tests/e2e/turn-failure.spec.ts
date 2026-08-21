import { expect, test } from '@playwright/test';

import {
  bootstrapChronicle,
  GM_RESPONSE_TEXT,
  resetPlaywrightState,
  resetWiremockScenarios,
} from './utils';

test.describe('Turn failure recovery', () => {
  test.beforeEach(async ({ request }) => {
    await resetPlaywrightState(request);
    await resetWiremockScenarios(request);
  });

  test.afterEach(async ({ request }) => {
    await resetPlaywrightState(request);
  });

  test('restores the draft after transport failure and retries the same turn cleanly', async ({
    page,
  }) => {
    test.setTimeout(30_000);
    const { chatInput } = await bootstrapChronicle(page);
    const message = 'Test the eastern lock without losing this draft.';

    await page.route('**/gm/**', (route) => route.abort('failed'), { times: 1 });
    await chatInput.fill(message);
    await page.getByTestId('chat-submit').click();

    await expect(chatInput).toHaveValue(message, { timeout: 10_000 });
    await expect(page.getByTestId('chat-error')).toBeVisible();
    await expect(page.locator('.chat-entry-player').filter({ hasText: message })).toHaveCount(0);

    await page.getByTestId('chat-submit').click();
    await expect(page.getByText(GM_RESPONSE_TEXT)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('chat-error')).toHaveCount(0);
    await expect(page.locator('.chat-entry-player').filter({ hasText: message })).toHaveCount(1);
  });
});
