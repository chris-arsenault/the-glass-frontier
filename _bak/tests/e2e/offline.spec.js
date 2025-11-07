import { test, expect } from "@playwright/test";
import { createSession, loginAsAdminViaUi } from "../helpers/auth.js";

test.describe("offline continuity", () => {
  test("queues and flushes intents across offline transitions", async ({ page, context }) => {
    const sessionId = `playwright-offline-${Date.now()}`;
    const { token } = await loginAsAdminViaUi(page);
    await createSession(page, token, {
      sessionId,
      title: "Playwright Offline Continuity"
    });

    await page.getByTestId("nav-dashboard").click();
    await expect(page.getByTestId("session-dashboard")).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Refresh" }).click();
    const resumeButton = page.getByTestId(`resume-${sessionId}`);
    await resumeButton.waitFor({ state: "visible", timeout: 10000 });
    await resumeButton.click();
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
