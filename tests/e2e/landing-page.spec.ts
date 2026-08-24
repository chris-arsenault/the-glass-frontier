import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { authenticate, resetPlaywrightState } from './utils';

const setSeededChronicleStatus = async (
  page: Page,
  status: 'open' | 'closed'
): Promise<string> => {
  return page.evaluate(async (nextStatus) => {
    const modulePath = '/src/stores/chronicleStore.ts';
    const { useChronicleStore } = await import(modulePath) as typeof import(
      '../../apps/client/src/stores/chronicleStore'
    );
    const initialState = useChronicleStore.getState();
    if (initialState.availableChronicles.length === 0) {
      await initialState.refreshPlayerResources();
    }
    const chronicle = useChronicleStore.getState().availableChronicles[0];
    if (!chronicle) {
      throw new Error('Seeded chronicle not found.');
    }
    useChronicleStore.setState((state) => ({
      availableChronicles: state.availableChronicles.map((entry) =>
        entry.id === chronicle.id ? { ...entry, status: nextStatus } : entry
      ),
    }));
    return chronicle.id;
  }, status);
};

test.describe('Landing page', () => {
  test.beforeEach(async ({ request }) => {
    await resetPlaywrightState(request);
  });

  test('is accessible once authenticated', async ({ page }) => {
    await page.goto('/');
    await authenticate(page);

    await expect(
      page.getByRole('heading', {
        name: 'Welcome back',
      })
    ).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Your chronicles' })).toBeVisible();
    await expect(page.locator('.landing-status-chip').first()).toBeVisible();
  });

  test('shows active chronicles to member-tier players', async ({ page }) => {
    await page.goto('/');
    await authenticate(page, { groups: ['user'] });
    const activityPanel = page.locator('.landing-panel').filter({
      has: page.getByRole('heading', { name: 'Around the frontier' }),
    });

    await expect(activityPanel.getByText('Active', { exact: true })).toBeVisible();
    await expect(activityPanel.getByText('Playwright Chronicle')).toBeVisible();
  });

  test('does not expose active chronicles to free-tier players', async ({ page }) => {
    await page.goto('/');
    await authenticate(page, { groups: ['free'] });
    const activityPanel = page.locator('.landing-panel').filter({
      has: page.getByRole('heading', { name: 'Around the frontier' }),
    });

    await expect(activityPanel.getByText('Active', { exact: true })).toHaveCount(0);
    await expect(activityPanel).toContainText('No chronicle activity yet.');
  });

  test('shows recent lore and newly created entities with Atlas links', async ({ page }) => {
    await page.goto('/');
    await authenticate(page);
    const lorePanel = page.locator('.landing-panel').filter({
      has: page.getByRole('heading', { name: 'New lore' }),
    });
    const entityPanel = page.locator('.landing-panel').filter({
      has: page.getByRole('heading', { name: 'New entities' }),
    });

    await expect(lorePanel.getByText('Fresh Signal')).toBeVisible();
    await expect(lorePanel.getByRole('link', { name: 'Oracle Vessel' })).toBeVisible();
    await expect(entityPanel.getByRole('link', { name: 'Oracle Vessel' })).toBeVisible();

    await entityPanel.getByRole('link', { name: 'Oracle Vessel' }).click();
    await expect(page).toHaveURL(/\/atlas\/oracle_vessel$/);
  });

  test('does not offer to resume completed chronicles', async ({ page }) => {
    await page.goto('/');
    await authenticate(page);
    const chronicleId = await setSeededChronicleStatus(page, 'closed');
    const chroniclesPanel = page.locator('.landing-panel').filter({
      has: page.getByRole('heading', { name: 'Your chronicles' }),
    });

    await expect(chroniclesPanel.locator('.landing-my-chronicle-meta')).toContainText('Completed');
    await expect(chroniclesPanel.getByRole('button', { name: 'Completed' })).toBeDisabled();
    await expect(chroniclesPanel.getByRole('button', { name: 'Resume' })).toHaveCount(0);

    await setSeededChronicleStatus(page, 'open');
    await chroniclesPanel.getByRole('button', { name: 'Resume' }).click();
    await expect(page).toHaveURL(`/chron/${chronicleId}`);
    await expect(page.getByTestId('chat-input')).toBeEnabled();

    await setSeededChronicleStatus(page, 'closed');
    const chronicleManager = page.getByRole('region', { name: 'Chronicle management' });
    const chronicleCard = chronicleManager.locator('.session-manager-card').filter({
      hasText: 'Playwright Chronicle',
    });
    await expect(chronicleCard.getByRole('button', { name: 'Completed' })).toBeDisabled();
    await expect(chronicleCard.getByRole('button', { name: 'Load' })).toHaveCount(0);
  });
});
