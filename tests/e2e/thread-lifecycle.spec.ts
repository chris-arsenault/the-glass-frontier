import { expect, test } from '@playwright/test';

import {
  bootstrapChronicle,
  resetPlaywrightState,
  resetWiremockScenarios,
  sendTurn,
} from './utils';

test.describe('Chronicle thread lifecycle', () => {
  test.beforeEach(async ({ request }) => {
    await resetPlaywrightState(request);
    await resetWiremockScenarios(request);
  });

  test.afterEach(async ({ request }) => {
    await resetPlaywrightState(request);
  });

  test('records a newly declared long-horizon goal as the focused player thread', async ({ page }) => {
    const { chatInput } = await bootstrapChronicle(page);

    await sendTurn(
      page,
      chatInput,
      '#thread:new Trace the harmonics through the eastern vault.'
    );

    const thread = page.locator('.chronicle-thread').filter({ hasText: 'Shattered Chorus' });
    await expect(thread).toHaveCount(1);
    await expect(thread).toContainText('Investigate the harmonics pulsing through the eastern vault.');
    await expect(thread).toContainText('Focused');
  });
});
