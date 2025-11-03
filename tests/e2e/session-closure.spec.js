"use strict";

import { test, expect } from "@playwright/test";
import { createSession, loginAsAdminViaUi } from "../helpers/auth.js";

function uniqueSessionId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

test.describe("session closure management", () => {
  test("admin closes a session via the dashboard and UI reflects closure state", async ({ page }) => {
    const sessionId = uniqueSessionId("playwright-closure");
    const { token } = await loginAsAdminViaUi(page);
    await createSession(page, token, {
      sessionId,
      title: "Playwright Closure Verification"
    });
    await page.getByTestId("nav-dashboard").click();

    const dashboard = page.getByTestId("session-dashboard");
    await expect(dashboard).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Refresh" }).click();
    const resumeButton = page.getByTestId(`resume-${sessionId}`);
    await resumeButton.waitFor({ state: "visible", timeout: 10000 });
    await resumeButton.click();
    await expect(page.getByTestId("chat-composer")).toBeVisible({ timeout: 10000 });
    await page.getByTestId("nav-dashboard").click();
    await expect(dashboard).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Refresh" }).click();

    const closeButton = page.getByTestId(`close-${sessionId}`);
    await expect(closeButton).toBeVisible({ timeout: 10000 });
    await closeButton.click();

    const confirmDialog = page.getByTestId(`close-confirm-${sessionId}`);
    await expect(confirmDialog).toBeVisible({ timeout: 10000 });

    await page.fill(`#close-reason-${sessionId}`, "Playwright dashboard closure test");
    await confirmDialog.getByRole("button", { name: /Confirm closure/i }).click();

    await expect(confirmDialog).toBeHidden({ timeout: 10000 });
    await expect(closeButton).toBeDisabled({ timeout: 10000 });

    const sessionCard = dashboard.locator("article").filter({ hasText: sessionId });
    await expect(sessionCard).toHaveAttribute("data-status", "closed", { timeout: 10000 });
    await page.getByRole("button", { name: "Refresh" }).click();
    const offlinePipelineText = await sessionCard.locator("dd").nth(4).innerText();
    expect(offlinePipelineText).toMatch(/Reconciliation pending|Last run/i);

    const feedback = page.locator(".session-dashboard-feedback");
    await expect(feedback).toContainText(/Session closure queued/i, { timeout: 10000 });

    await page.getByTestId("dashboard-return").click();

    await expect(page.getByTestId("chat-composer")).toBeVisible({ timeout: 10000 });
    await expect
      .poll(async () => page.getByTestId("chat-submit").innerText(), { timeout: 15000 })
      .toMatch(/Session closed/i);
    await expect(page.getByTestId("chat-submit")).toBeDisabled();
  });
});
