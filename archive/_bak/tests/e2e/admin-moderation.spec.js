import { test, expect } from "@playwright/test";
import { createSession, loginAsAdminViaUi } from "../helpers/auth.js";

test.describe("admin moderation dashboard", () => {
  test("admin reviews alert and records a decision", async ({ page }) => {
    const { token } = await loginAsAdminViaUi(page);
    const sessionId = `moderation-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    await createSession(page, token, {
      sessionId,
      title: "Moderation Dashboard QA"
    });

    const alertResponse = await page.request.post(
      `/debug/sessions/${encodeURIComponent(sessionId)}/admin-alerts`,
      {
        data: {
          reason: "offline.workflow_failed",
          severity: "high",
          data: {
            safetyFlags: ["prohibited-capability"],
            hubId: "hub-moderation",
            contestId: "contest-auto"
          }
        },
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    expect(alertResponse.ok(), "debug admin alert creation should succeed").toBeTruthy();
    const payload = await alertResponse.json();
    const alertId = payload?.alert?.id;
    expect(alertId, "debug admin alert response should include id").toBeTruthy();

    await page.getByTestId("nav-admin").click();
    const dashboard = page.getByTestId("moderation-dashboard");
    await expect(dashboard).toBeVisible({ timeout: 10000 });

    const cadenceStrip = page.getByTestId("moderation-cadence");
    await expect(cadenceStrip).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("No sessions pending moderation.")).toBeVisible({ timeout: 10000 });

    await expect(page.getByTestId("moderation-count-live")).toHaveText(/Live:\s*1/, {
      timeout: 10000
    });

    const alertButton = page.getByTestId(`moderation-alert-${alertId}`);
    await alertButton.waitFor({ state: "visible", timeout: 10000 });
    await alertButton.click();

    await expect(page.getByTestId("moderation-detail-status")).toHaveText(/Status:\s*live/i, {
      timeout: 10000
    });

    await page.getByTestId("moderation-decision-approve").click();

    await expect(page.getByTestId("moderation-detail-status")).toHaveText(/Status:\s*resolved/i, {
      timeout: 10000
    });
    await expect(page.getByTestId("moderation-count-live")).toHaveText(/Live:\s*0/, {
      timeout: 10000
    });
    await expect(page.getByTestId("moderation-count-resolved")).toHaveText(/Resolved:\s*1/, {
      timeout: 10000
    });
  });
});
