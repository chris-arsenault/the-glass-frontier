import { test, expect } from "@playwright/test";

const SESSION_QUERY = "?sessionId=playwright-offline";

test.describe("offline continuity", () => {
  test("queues and flushes intents across offline transitions", async ({ page, context }) => {
    await page.goto(`/${SESSION_QUERY}`);
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("chat-composer")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("chat-status")).toHaveText(/Live session|Connecting/);

    await context.setOffline(true);
    await expect(page.getByTestId("chat-offline-banner")).toBeVisible();
    await expect(page.getByTestId("chat-status")).toHaveText(/Offline mode/);

    await page.fill("#chat-input", "Scout the relay for hidden drones.");
    await page.click("[data-testid='chat-submit']");

    await expect(page.getByTestId("chat-offline-banner")).toHaveText(/1 pending/);
    await expect(page.getByTestId("overlay-status")).toContainText("Offline queue");

    await context.setOffline(false);

    await expect.poll(() => page.getByTestId("overlay-status").innerText()).toContain("Live");

    await expect(page.locator("[data-testid='chat-offline-banner']")).toHaveCount(0);
  });
});
