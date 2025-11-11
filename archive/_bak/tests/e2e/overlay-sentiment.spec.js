import { test, expect } from "@playwright/test";
import { createSession, loginAsAdminViaUi } from "../helpers/auth.js";

test.describe("overlay sentiment refresh", () => {
  test("admin sentiment panel auto-refreshes when telemetry becomes stale", async ({ page }) => {
    await page.addInitScript(() => {
      window.__GF_SENTIMENT_STALE_THRESHOLD_MS = 400;
      window.__GF_SENTIMENT_REFRESH_MIN_DELAY_MS = 75;
    });

    let callCount = 0;
    let releaseSecondResponse = () => {};
    const secondResponseReady = new Promise((resolve) => {
      releaseSecondResponse = resolve;
    });
    const responses = [
      (timestamp) => ({
        generatedAt: new Date(timestamp - 100).toISOString(),
        cooldown: {
          activeSamples: 4,
          negativeDuringCooldown: 1,
          maxRemainingCooldownMs: 9000,
          frustrationRatio: 0.25,
          frustrationLevel: "watch"
        }
      }),
      (timestamp) => ({
        generatedAt: new Date(timestamp).toISOString(),
        cooldown: {
          activeSamples: 6,
          negativeDuringCooldown: 3,
          maxRemainingCooldownMs: 6000,
          frustrationRatio: 0.5,
          frustrationLevel: "elevated"
        }
      })
    ];

    await page.route("**/admin/moderation/contest/sentiment*", async (route) => {
      const now = Date.now();
      const index = Math.min(callCount, responses.length - 1);
      const payload = responses[index](now);
      callCount += 1;
      if (index > 0) {
        await secondResponseReady;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(payload)
      });
    });

    const sessionId = `overlay-sentiment-${Date.now()}`;
    const { token } = await loginAsAdminViaUi(page);
    await createSession(page, token, {
      sessionId,
      title: "Playwright Overlay Sentiment Refresh"
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

    const contestCard = page.getByTestId("overlay-contest-timeline");
    await expect(contestCard).toBeVisible({ timeout: 10000 });

    await expect.poll(() => callCount, { timeout: 4000 }).toBeGreaterThanOrEqual(1);

    await expect.poll(() => callCount, { timeout: 5000 }).toBeGreaterThanOrEqual(2);

    releaseSecondResponse();

    const sentimentSummary = page.getByTestId("contest-sentiment-summary");
    await expect(sentimentSummary).toBeVisible({ timeout: 5000 });
    await expect(sentimentSummary).toContainText(/Cooldown sentiment: Elevated\./i, {
      timeout: 5000
    });
    await expect(sentimentSummary).toContainText(
      /50% of cooldown chatter shows frustration \(3\/6\)\./i
    );
    await expect(sentimentSummary).toContainText(
      /Negative cooldown samples signal players struggling to re-enter contests\./i
    );
  });
});
