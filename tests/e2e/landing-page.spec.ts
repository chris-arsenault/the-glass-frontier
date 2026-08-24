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

  test('hides the login screen while stored credentials are being checked', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(async () => {
      const modulePath = '/src/stores/authStore.ts';
      const { useAuthStore } = (await import(
        modulePath
      )) as typeof import('../../apps/client/src/stores/authStore');
      useAuthStore.setState({
        isAuthenticated: false,
        isCheckingCredentials: true,
      });
    });

    await expect(page.getByRole('status')).toContainText('Loading Glass Frontier…');
    await expect(page.getByRole('button', { name: 'Sign In' })).toHaveCount(0);

    await page.evaluate(async () => {
      const modulePath = '/src/stores/authStore.ts';
      const { useAuthStore } = (await import(
        modulePath
      )) as typeof import('../../apps/client/src/stores/authStore');
      useAuthStore.setState({ isCheckingCredentials: false });
    });

    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  });

  test('is accessible once authenticated', async ({ page }) => {
    await page.goto('/');
    await authenticate(page);

    await expect(
      page.getByRole('heading', {
        name: 'Welcome back',
      })
    ).toBeVisible();

    const mainRail = page.getByRole('navigation', { name: 'Main' });
    await expect(mainRail.getByRole('heading', { name: 'Characters' })).toBeVisible();
    await expect(mainRail.getByRole('heading', { name: 'Chronicles' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Chronicle' })).toHaveCount(0);
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
    const atlasLink = entityPanel.getByRole('link', { name: 'Oracle Vessel' });
    await expect(atlasLink).toHaveAttribute('href', '/atlas/oracle_vessel');

    await atlasLink.click();
    await expect(page).toHaveURL(/\/$/);
    const atlasModal = page.getByRole('dialog', { name: 'World Atlas entry' });
    await expect(atlasModal).toBeVisible();
    await expect(
      atlasModal.getByRole('heading', { level: 1, name: 'Oracle Vessel' })
    ).toBeVisible();

    const fullPageLink = atlasModal.getByRole('link', { name: 'Open full page' });
    await expect(fullPageLink).toHaveAttribute('href', '/atlas/oracle_vessel');
    await fullPageLink.click();
    await expect(page).toHaveURL(/\/atlas\/oracle_vessel$/);
    await expect(page.getByRole('dialog', { name: 'World Atlas entry' })).toHaveCount(0);
  });

  test('does not offer to resume completed chronicles', async ({ page }) => {
    await page.goto('/');
    await authenticate(page);
    const chronicleId = await setSeededChronicleStatus(page, 'closed');
    const mainRail = page.getByRole('navigation', { name: 'Main' });
    const chronicleCard = mainRail.locator('.player-directory-chronicle').filter({
      hasText: 'Playwright Chronicle',
    });

    await expect(chronicleCard).toContainText('Completed');
    await expect(chronicleCard.getByRole('button', { name: 'Completed' })).toBeDisabled();
    await expect(chronicleCard.getByRole('button', { name: 'Resume' })).toHaveCount(0);

    await setSeededChronicleStatus(page, 'open');
    await chronicleCard.getByRole('button', { name: 'Resume' }).click();
    await expect(page).toHaveURL(`/chron/${chronicleId}`);
    await expect(page.getByTestId('chat-input')).toBeEnabled();
    await expect(page.getByRole('navigation', { name: 'Chronicle' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Beats' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Nearby entities' })).toBeVisible();
  });
});
