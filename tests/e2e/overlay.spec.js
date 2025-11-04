import { test, expect } from "@playwright/test";
import { createSession, loginAsAdminViaUi, loginAsRunnerViaUi } from "../helpers/auth.js";

test.describe("narrative overlays", () => {
  test("player view surfaces check transparency without admin pipeline data", async ({ page }) => {
    const sessionId = `playwright-overlay-${Date.now()}`;
    const { token } = await loginAsRunnerViaUi(page);
    await createSession(page, token, {
      sessionId,
      title: "Playwright Overlay Player View"
    });

    await page.getByTestId("nav-dashboard").click();
    await expect(page.getByTestId("session-dashboard")).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Refresh" }).click();

    const resumeButton = page.getByTestId(`resume-${sessionId}`);
    await resumeButton.waitFor({ state: "visible", timeout: 10000 });
    await resumeButton.click();

    await expect(page.getByTestId("chat-composer")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("overlay-dock")).toBeVisible({ timeout: 10000 });

    const pipelinePanel = page.locator("[data-testid='overlay-pipeline']");
    await expect(pipelinePanel).toHaveCount(0);

    await page.fill("[data-testid='chat-input']", "I hack the signal lattice and risk a roll.");
    await page.click("[data-testid='chat-submit']");

    const resultLocator = page.getByTestId("overlay-check-result");
    await expect(resultLocator).toBeVisible({ timeout: 10000 });
    await expect(resultLocator).toContainText(/hack-the-signal/i);
    await expect(resultLocator).toContainText(/Dice Total/i);
    await expect(resultLocator).toContainText(/Momentum shift/i);
  });

  test("admin view exposes pipeline status overlay", async ({ page }) => {
    const sessionId = `playwright-overlay-admin-${Date.now()}`;
    const { token } = await loginAsAdminViaUi(page);
    await createSession(page, token, {
      sessionId,
      title: "Playwright Overlay Admin View"
    });

    await page.getByTestId("nav-dashboard").click();
    await expect(page.getByTestId("session-dashboard")).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Refresh" }).click();

    const resumeButton = page.getByTestId(`resume-${sessionId}`);
    await resumeButton.waitFor({ state: "visible", timeout: 10000 });
    await resumeButton.click();

    await expect(page.getByTestId("chat-composer")).toBeVisible({ timeout: 10000 });

    const pipelinePanel = page.getByTestId("overlay-pipeline");
    await expect(pipelinePanel).toBeVisible({ timeout: 10000 });
    await expect(pipelinePanel).toContainText(/Pipeline Status/i);
    await expect(pipelinePanel).toContainText(/Moderation queue/i);
    await expect(pipelinePanel).toContainText(/Current status/i);
  });
});
