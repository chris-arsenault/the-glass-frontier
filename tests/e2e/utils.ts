import { expect } from '@playwright/test';
import type { APIRequestContext, Locator, Page } from '@playwright/test';

export const GM_RESPONSE_TEXT =
  'MOCK: The GM describes the scout slipping past the humming consoles.';

export type AuthOptions = {
  groups?: string[];
};

export const authenticate = async (page: Page, options?: AuthOptions) => {
  await page.evaluate(
    async ({ groups }) => {
      const module = await import('/src/stores/authStore.ts');
      const base64Url = (payload: Record<string, unknown>): string => {
        const json = JSON.stringify(payload);
        const encoded = globalThis.btoa(json);
        return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
      };
      const normalizedGroups = Array.isArray(groups)
        ? groups.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        : [];
      const header = base64Url({ alg: 'none', typ: 'JWT' });
      const body = base64Url({
        'cognito:groups': normalizedGroups,
        sub: 'playwright-e2e',
      });
      const idToken = `${header}.${body}.signature`;
      module.useAuthStore.setState({
        challengeUser: null,
        error: null,
        isAuthenticated: true,
        isAuthenticating: false,
        newPasswordRequired: false,
        tokens: {
          accessToken: 'test-access-token',
          idToken,
          refreshToken: 'test-refresh-token',
        },
        username: 'playwright-e2e',
      });
    },
    { groups: options?.groups ?? null }
  );
};

export const seedChronicle = async (page: Page): Promise<{ chronicleId: string }> => {
  return page.evaluate(async () => {
    const { useChronicleStore } = await import('/src/stores/chronicleStore.ts');
    const store = useChronicleStore.getState();

    await store.refreshPlayerResources();
    const refreshed = useChronicleStore.getState();
    const playerId = refreshed.playerId ?? 'playwright-e2e';
    const chronicle =
      refreshed.availableChronicles.find((entry) => entry.playerId === playerId) ??
      refreshed.availableChronicles[0] ??
      null;
    if (!chronicle) {
      throw new Error('Seeded chronicle not found.');
    }
    return { chronicleId: chronicle.id };
  });
};

export const bootstrapChronicle = async (
  page: Page,
  authOptions?: AuthOptions
): Promise<{ chatInput: Locator; chronicleId: string }> => {
  await page.goto('/');
  await authenticate(page, authOptions);
  const { chronicleId } = await seedChronicle(page);
  await page.goto(`/chron/${chronicleId}`);
  await authenticate(page, authOptions);
  const chatInput = page.getByTestId('chat-input');
  await expect(chatInput).toBeEnabled();
  return { chatInput, chronicleId };
};

export const sendTurn = async (page: Page, chatInput: Locator, message: string) => {
  await chatInput.fill(message);
  await page.getByTestId('chat-submit').click();
  await expect(page.getByText(GM_RESPONSE_TEXT)).toBeVisible({ timeout: 15_000 });
  return page.locator('.chat-entry-gm').last();
};

export const openPlayerMenu = async (page: Page) => {
  const toggle = page.getByRole('button', { name: /PLAYWRIGHT-E2E/ });
  await toggle.click();
  return page.locator('.player-menu-panel');
};

export const resetWiremockScenarios = async (request: APIRequestContext) => {
  await request.post('http://localhost:8080/__admin/scenarios/reset');
};

export const resetPlaywrightState = async (request: APIRequestContext) => {
  const port = process.env.PLAYWRIGHT_PORT ? Number(process.env.PLAYWRIGHT_PORT) : 7800;
  await request.post(`http://localhost:${port}/reset`, {
    data: {},
  });
};
