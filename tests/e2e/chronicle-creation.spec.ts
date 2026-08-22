import { expect, test } from '@playwright/test';

import {
  authenticate,
  GM_RESPONSE_TEXT,
  resetPlaywrightState,
  resetWiremockScenarios,
} from './utils';

test.describe('Chronicle creation', () => {
  test.beforeEach(async ({ request }) => {
    await resetPlaywrightState(request);
    await resetWiremockScenarios(request);
  });

  test.afterEach(async ({ request }) => {
    await resetPlaywrightState(request);
  });

  test('creates a character and chronicle through the wizard, then streams the first turn', async ({
    page,
  }) => {
    test.setTimeout(45_000);
    const characterName = 'E2E Pathfinder';
    const chronicleTitle = 'First Light over the Quay';
    const openingText = 'You stand beneath the signal gantries of Luminous Quay';
    const seedText = 'A fractured beacon calls from beneath the Luminous Quay.';

    await page.goto('/');
    await authenticate(page);
    await expect(page.locator('.landing-status-chip').first()).toHaveText('Ready');

    await page.getByRole('button', { name: 'Create new' }).click();
    await expect(page.getByRole('heading', { name: 'Create a character' })).toBeVisible();

    // Origin: species, culture, homeland and allegiance all come from canon.
    await page.getByRole('button', { name: /Sitharian/ }).click();
    await page.getByRole('button', { name: /Quay-Keeper/ }).click();
    await page.getByRole('button', { name: /Luminous Quay/ }).click();
    await page.getByRole('button', { name: /Glass Wardens/ }).click();
    await page.getByRole('button', { name: 'Next' }).click();

    // Concept: the preset fills the attribute spread and the three skills.
    await page.getByLabel('Name').fill(characterName);
    await page.getByLabel('Pronouns').fill('she/her');
    await page.getByRole('button', { name: /Fault-Singer/ }).click();
    await page.getByLabel('Bio').fill('Reads the quay glass for the people who work it.');
    await page.getByRole('button', { name: 'Next' }).click();

    // Aptitudes and skills arrive valid from the preset.
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Next' }).click();

    // Nature is optional: fill one field and leave the rest blank.
    await page.getByLabel(/Flaw/).fill('Opens sealed doors she was told to walk past');
    await page.getByRole('button', { name: 'Next' }).click();

    await page.getByRole('button', { name: 'Create Character' }).click();
    await expect(page.locator('.landing-my-characters')).toContainText(characterName);

    await page.getByRole('button', { name: 'Start new' }).click();
    await expect(page.getByRole('heading', { name: 'Start a new chronicle' })).toBeVisible();

    await page.getByRole('button', { name: /Luminous Quay/ }).click();
    await page.getByRole('button', { name: 'Next' }).click();

    await page.getByRole('button', { name: 'hopeful' }).click();
    await page.getByLabel('Tone notes').fill('quiet discovery under pressure');
    await page.getByRole('button', { name: 'Next' }).click();

    await page.getByRole('button', { name: /Glass Wardens/ }).click();
    await page.getByRole('button', { name: 'Next' }).click();

    await page.getByLabel('Title').fill(chronicleTitle);
    await page.getByLabel('Seed text').fill(seedText);
    await page.getByRole('button', { name: 'Next' }).click();

    const createStep = page.locator('.create-step');
    await expect(createStep).toContainText('Luminous Quay');
    await expect(createStep).toContainText('Glass Wardens');
    await expect(createStep).toContainText(characterName);
    await expect(createStep).toContainText('hopeful');
    await page.getByRole('button', { name: 'Create Chronicle' }).click();

    await expect(page).toHaveURL(/\/chron\/[0-9a-f-]+$/u);
    await expect(page.getByRole('heading', { name: chronicleTitle })).toBeVisible();
    await expect(page.locator('.location-pill-value')).toContainText('Luminous Quay');
    await expect(page.locator('.chat-entry-gm').filter({ hasText: openingText })).toBeVisible();
    await expect(page.locator('.chat-entry-gm').filter({ hasText: seedText })).toHaveCount(0);

    const chatInput = page.getByTestId('chat-input');
    await chatInput.fill(
      '#beat:new #mock:beat:new Follow the fractured beacon into the eastern vault.'
    );
    await page.getByTestId('chat-submit').click();

    await expect(page.locator('.chat-loading-text')).toContainText('GM is working —', {
      timeout: 15_000,
    });
    await expect(page.getByText(GM_RESPONSE_TEXT)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.chat-loading')).toBeVisible();
    await expect(page.getByTestId('chat-submit')).toBeEnabled({ timeout: 15_000 });
    await expect(page.locator('.session-manager-beat')).toContainText('Shattered Chorus');
  });
});
