import { test, expect } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import fs from "fs/promises";
import path from "path";
import { createHtmlReport } from "axe-html-reporter";
import { createSession, loginAsAdminViaUi } from "../helpers/auth.js";

const REPORT_ROOT = path.join(process.cwd(), "artifacts", "accessibility");

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function persistAxeResults(name, results) {
  const slug = slugify(name);
  const jsonPath = path.join(REPORT_ROOT, `${slug}.json`);
  const htmlPath = path.join(REPORT_ROOT, `${slug}.html`);

  await fs.mkdir(REPORT_ROOT, { recursive: true });
  await fs.writeFile(jsonPath, JSON.stringify(results, null, 2), "utf-8");

  const htmlContent = createHtmlReport({
    results,
    options: {
      projectKey: "the-glass-frontier",
      reportFileName: slug,
      doNotCreateReportFile: true,
      customSummary: `Axe accessibility report for ${name}`
    }
  });

  await fs.writeFile(htmlPath, htmlContent, "utf-8");
}

async function analyzeAndReport(page, name, includeSelectors = []) {
  let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]);
  includeSelectors.forEach((selector) => {
    builder = builder.include(selector);
  });

  const results = await builder.analyze();
  await persistAxeResults(name, results);

  if (results.violations.length > 0) {
    console.warn(
      `Accessibility violations for ${name}:`,
      results.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        nodes: violation.nodes.map((node) => node.target)
      }))
    );
  }

  expect(results.violations, `Accessibility violations detected for ${name}`).toEqual([]);
  return results;
}

test.describe("accessibility regression", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    const sessionId = `playwright-accessibility-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const { token } = await loginAsAdminViaUi(page);
    await createSession(page, token, {
      sessionId,
      title: "Playwright Accessibility Audit"
    });
    await page.getByTestId("nav-dashboard").click();
    await expect(page.getByTestId("session-dashboard")).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Refresh" }).click();
    const resumeButton = page.getByTestId(`resume-${sessionId}`);
    await resumeButton.waitFor({ state: "visible", timeout: 10000 });
    await resumeButton.click();
    await expect(page.getByTestId("chat-composer")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("overlay-dock")).toBeVisible();
  });

  test.afterEach(async ({ context }) => {
    await context.setOffline(false);
  });

  test("chat shell baseline has no axe-core violations", async ({ page }) => {
    await analyzeAndReport(page, "chat-shell-online", [".app-shell"]);
  });

  test("chat composer offline mode announces state accessibly", async ({ page, context }) => {
    await context.setOffline(true);
    await expect(page.getByTestId("chat-offline-banner")).toBeVisible({ timeout: 10000 });
    await analyzeAndReport(page, "chat-composer-offline", ["[data-testid='chat-composer']"]);
  });

  test("overlay dock remains accessible with queued offline intents", async ({ page, context }) => {
    await context.setOffline(true);
    await expect(page.getByTestId("chat-offline-banner")).toBeVisible({ timeout: 10000 });

    await page.fill("#chat-input", "Queue an intent while offline for accessibility verification.");
    await page.click("[data-testid='chat-submit']");

    await expect(page.getByTestId("overlay-status")).toHaveText(/Offline queue|Offline mode/);

    await analyzeAndReport(page, "overlay-dock-offline-queue", ["[data-testid='overlay-dock']"]);
  });
});
