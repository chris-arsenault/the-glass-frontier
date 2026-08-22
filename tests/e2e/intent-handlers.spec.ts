import { expect, test } from '@playwright/test';

import {
  bootstrapChronicle,
  resetPlaywrightState,
  resetWiremockScenarios,
} from './utils';

const ADVANCES_TIMELINE = 'Advances timeline';
const HOLDS_MOMENT = 'Holds moment';

const INTENT_CASES = [
  {
    handler: 'inquiry-describer',
    intent: 'inquiry',
    label: 'Inquiry',
    message: 'What can I hear beyond the sealed vault door? #intent:inquiry',
    narration: 'MOCK INQUIRY: A low harmonic pulse answers from beyond the vault door.',
    timeline: HOLDS_MOMENT,
  },
  {
    handler: 'clarification-responder',
    intent: 'clarification',
    label: 'Clarification',
    message: 'Was the Oracle Vessel already moved into this chamber? #intent:clarification',
    narration: 'MOCK CLARIFICATION: The Oracle Vessel remains in the Luminous Quay archive.',
    timeline: HOLDS_MOMENT,
  },
  {
    handler: 'possibility-advisor',
    intent: 'possibility',
    label: 'Possibility',
    message: 'Could the beacon be retuned without opening the vault? #intent:possibility',
    narration: 'MOCK POSSIBILITY: Retuning the beacon is possible if you isolate its eastern relay.',
    timeline: HOLDS_MOMENT,
  },
  {
    handler: 'planning-narrator',
    intent: 'planning',
    label: 'Planning',
    message: 'We map the patrol route and prepare a quiet approach. #intent:planning',
    narration: 'MOCK PLANNING: You chart the patrol gaps and ready a silent route to the vault.',
    timeline: ADVANCES_TIMELINE,
  },
  {
    handler: 'reflection-weaver',
    intent: 'reflection',
    label: 'Reflection',
    message: 'I remember why the Wardens taught me to fear this signal. #intent:reflection',
    narration: 'MOCK REFLECTION: The Wardens’ old warning settles over the signal like frost.',
    timeline: HOLDS_MOMENT,
  },
  {
    handler: 'wrap-resolver',
    intent: 'wrap',
    label: 'Wrap',
    message: 'Bring this expedition to its final reckoning. #intent:wrap',
    narration: 'MOCK WRAP: The vault falls silent as the expedition gathers for its final choice.',
    timeline: ADVANCES_TIMELINE,
  },
] as const;

test.describe('Intent handlers', () => {
  test.beforeEach(async ({ request }) => {
    await resetPlaywrightState(request);
    await resetWiremockScenarios(request);
  });

  test.afterEach(async ({ request }) => {
    await resetPlaywrightState(request);
  });

  for (const intentCase of INTENT_CASES) {
    test(`routes ${intentCase.intent} through ${intentCase.handler}`, async ({ page }) => {
      test.setTimeout(25_000);
      const { chatInput } = await bootstrapChronicle(page);

      await chatInput.fill(intentCase.message);
      await page.getByTestId('chat-submit').click();

      await expect(page.getByText(intentCase.narration, { exact: true })).toBeVisible({
        timeout: 15_000,
      });

      const playerEntry = page.locator('.chat-entry-player').last();
      const gmEntry = page.locator('.chat-entry-gm').last();
      await expect(playerEntry.locator('.chat-entry-intent-tag')).toHaveText(intentCase.label);
      await expect(gmEntry.locator('.chat-entry-timeline-tag')).toHaveText(intentCase.timeline);
      await expect(gmEntry.locator('.chat-entry-node-trace')).toContainText(
        `gm-response-node (${intentCase.intent})`
      );
      await expect(page.locator('.chat-entry-system')).toHaveCount(0);
    });
  }
});
