import { expect, test } from '@playwright/test';

import { authenticate, seedChronicle } from './utils';

const PIPELINE_ORDER = [
  'intent-intake',
  'intent-beat-detector',
  'skill-detector',
  'check-planner',
  'action-resolver',
  'inquiry-responder',
  'clarification-responder',
  'possibility-advisor',
  'planning-narrator',
  'reflection-weaver',
  'location-delta',
  'gm-summary',
  'beat-tracker',
  'inventory-delta',
  'character-update',
] as const;

test.describe('Chat system', () => {
  test('executes every LangGraph node for a GM turn', async ({ page }) => {
    await page.goto('/');
    await authenticate(page);
    const { chronicleId } = await seedChronicle(page);

    await page.goto(`/chron/${chronicleId}`);
    await authenticate(page);
    const chatInput = page.getByTestId('chat-input');
    await expect(chatInput).toBeEnabled();

    await chatInput.fill('Sweep the console banks for hidden sensors.');
    await page.getByTestId('chat-submit').click();

    await expect(
      page.getByText('MOCK: The GM describes the scout slipping past the humming consoles.')
    ).toBeVisible({ timeout: 15_000 });

    const pipelineLocator = page.locator('.chat-entry-node-trace').first();
    await expect(pipelineLocator).toContainText('GM pipeline:', { timeout: 15_000 });

    const pipelineText = (await pipelineLocator.textContent()) ?? '';
    const executedNodes = pipelineText
      .replace('GM pipeline:', '')
      .split('→')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

    expect(executedNodes).toEqual(PIPELINE_ORDER);
  });
});
