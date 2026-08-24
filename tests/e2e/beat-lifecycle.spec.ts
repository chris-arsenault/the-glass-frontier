import { expect, test } from '@playwright/test';

import {
  bootstrapChronicle,
  resetPlaywrightState,
  resetWiremockScenarios,
  sendTurn,
} from './utils';

test.describe('Chronicle beat lifecycle', () => {
  test.beforeEach(async ({ request }) => {
    await resetPlaywrightState(request);
    await resetWiremockScenarios(request);
  });

  test.afterEach(async ({ request }) => {
    await resetPlaywrightState(request);
  });

  test('spawns a beat and resolves that same beat on a later turn', async ({ page }) => {
    test.setTimeout(35_000);
    const { chatInput } = await bootstrapChronicle(page);

    await sendTurn(
      page,
      chatInput,
      '#beat:new #mock:beat:new Trace the harmonics through the eastern vault.'
    );

    const beat = page.locator('.chronicle-beat').filter({ hasText: 'Shattered Chorus' });
    await expect(beat).toHaveCount(1);
    await expect(beat).toHaveAttribute('data-status', 'in_progress');
    await expect(beat.locator('.chronicle-beat-status')).toHaveText('In progress');

    const resolvingEntry = await sendTurn(
      page,
      chatInput,
      '#beat:resolve #mock:beat:resolve Break the harmonic lock and open the vault.'
    );

    await expect(beat).toHaveCount(1);
    await expect(beat).toHaveAttribute('data-status', 'succeeded');
    await expect(beat.locator('.chronicle-beat-status')).toHaveText('Succeeded');

    const badge = resolvingEntry.locator('.beat-tracker-badge');
    await expect(badge).toBeVisible();
    await badge.hover();
    await expect(badge.locator('.beat-tracker-tooltip')).toContainText('Shattered Chorus');
    await expect(badge.locator('.beat-tracker-tooltip')).toContainText('Resolved');
    await expect(badge.locator('.beat-tracker-tooltip')).toContainText('Succeeded');
  });
});
