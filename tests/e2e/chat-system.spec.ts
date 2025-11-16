import { expect, test } from '@playwright/test';

import {
  bootstrapChronicle,
  openPlayerMenu,
  resetPlaywrightState,
  resetWiremockScenarios,
  sendTurn,
} from './utils';

const PIPELINE_ORDER = [
  'intent-intake',
  'intent-beat-detector',
  'skill-detector',
  'check-planner',
  'action-resolver',
  'location-delta',
  'gm-summary',
  'beat-tracker',
  'inventory-delta',
  'character-update',
] as const;

test.describe('Chat system', () => {
  test.beforeEach(async ({ request }) => {
    await resetWiremockScenarios(request);
  });

  test.afterEach(async ({ request }) => {
    await resetPlaywrightState(request);
  });

  test('executes the action intent path and propagates feedback across moderation surfaces', async ({
    page,
  }) => {
    const feedbackComment = `Integration feedback ${Date.now()}`;
    const bugSummary = `Playwright bug ${Date.now()}`;
    const bugDetails =
      'Automated bug submission covering moderation surfaces and integration flow.';

    const { chatInput } = await bootstrapChronicle(page, { groups: ['moderator'] });
    const gmEntry = await sendTurn(page, chatInput, 'Sweep the console banks for hidden sensors.');

    const pipelineLocator = gmEntry.locator('.chat-entry-node-trace');
    await expect(pipelineLocator).toBeVisible({ timeout: 15_000 });
    const pipelineText = (await pipelineLocator.textContent()) ?? '';
    const executedNodes = pipelineText
      .replace('GM pipeline:', '')
      .split('→')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    expect(executedNodes).toEqual([...PIPELINE_ORDER]);

    await gmEntry.getByRole('button', { name: 'Share Feedback' }).click();
    const feedbackModal = page.locator('.chat-feedback-modal');
    await expect(feedbackModal).toBeVisible();
    await feedbackModal.getByLabel('Expected intent type').selectOption('inquiry');
    await feedbackModal.getByLabel('Expected Location Change').selectOption('true');
    await feedbackModal.getByPlaceholder('Where should the scene have moved?').fill(
      'Should have pivoted to the Prism Walk.'
    );
    await feedbackModal
      .getByPlaceholder('What stood out or what felt off?')
      .fill(feedbackComment);
    await feedbackModal.getByRole('button', { name: 'Send Feedback' }).click();
    await expect(gmEntry.locator('.chat-entry-feedback-status')).toHaveText('Feedback sent', {
      timeout: 10_000,
    });

    await page.getByRole('button', { name: 'Report Bug' }).click();
    const bugModal = page.locator('.bug-report-modal');
    await expect(bugModal).toBeVisible();
    await bugModal.getByLabel('Summary').fill(bugSummary);
    await bugModal.getByLabel('Details').fill(bugDetails);
    await bugModal.getByRole('button', { name: 'Submit Report' }).click();
    await expect(
      bugModal.getByText('Thanks! Your report has been sent to the Glass Frontier maintainers.')
    ).toBeVisible();
    await bugModal.getByRole('button', { name: 'Close bug report form' }).click();

    const auditMenu = await openPlayerMenu(page);
    await auditMenu.getByRole('button', { name: 'LLM Audit Review' }).click();
    await expect(page.getByRole('heading', { name: 'LLM Audit Review' })).toBeVisible();
    await page.locator('#audit-filter-player').fill('playwright-e2e');
    await page.getByRole('button', { name: 'Apply Filters' }).click();
    const reviewButtons = page.getByRole('button', { name: 'Open Review' });
    await expect(reviewButtons.first()).toBeEnabled({ timeout: 15_000 });
    const reviewCount = await reviewButtons.count();
    let foundFeedback = false;
    for (let index = 0; index < reviewCount; index += 1) {
      await reviewButtons.nth(index).click();
      const reviewDialog = page.getByRole('dialog');
      await expect(reviewDialog).toBeVisible();
      const feedbackItems = reviewDialog.locator('.audit-feedback-item');
      if ((await feedbackItems.count()) > 0) {
        await expect(feedbackItems).toContainText(feedbackComment);
        foundFeedback = true;
        await reviewDialog.getByRole('button', { name: 'Close' }).click();
        break;
      }
      await reviewDialog.getByRole('button', { name: 'Close' }).click();
    }
    expect(foundFeedback).toBeTruthy();
    await page.getByRole('button', { name: 'Back to Chronicle' }).click();
    await expect(page.getByTestId('chat-input')).toBeVisible();

    const bugMenu = await openPlayerMenu(page);
    await bugMenu.getByRole('button', { name: 'Bug Moderation' }).click();
    await expect(page.getByRole('heading', { name: 'Bug Moderation' })).toBeVisible();
    await page.getByLabel('Search bug reports').fill(bugSummary);
    await expect(page.getByRole('row', { name: new RegExp(bugSummary) })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole('button', { name: 'Back to Chronicle' }).click();
  });
});
