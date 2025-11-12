"use strict";

import { expect } from "@playwright/test";

const AUTH_STORAGE_KEY = "glass-frontier.auth";
const SESSION_STORAGE_KEY = "glass-frontier.session";
const ADMIN_CREDENTIALS = Object.freeze({
  email: "admin@glassfrontier",
  password: "admin-pass"
});
const RUNNER_CREDENTIALS = Object.freeze({
  email: "runner@glassfrontier",
  password: "runner-pass"
});

/**
 * Authenticate as the seeded admin account and seed localStorage
 * so the client boots in an authenticated state.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ sessionId?: string | null }} [options]
 * @returns {Promise<{ token: string, account: any }>}
 */
export async function authenticateAsAdmin(page) {
  const response = await page.request.post("/auth/login", {
    data: {
      email: ADMIN_CREDENTIALS.email,
      password: ADMIN_CREDENTIALS.password
    }
  });

  expect(response.ok(), "Admin authentication should succeed").toBeTruthy();
  const payload = await response.json();
  const token = payload?.token;

  expect(typeof token === "string" && token.length > 0, "Login response must include token").toBe(
    true
  );

  return {
    token,
    account: payload?.account ?? null
  };
}

/**
 * Create a session for the authenticated admin via the accounts API.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} token
 * @param {{ sessionId?: string, title?: string }} [options]
 * @returns {Promise<any>}
 */
export async function createSession(page, token, options = {}) {
  const response = await page.request.post("/accounts/me/sessions", {
    data: {
      sessionId: options.sessionId,
      title: options.title
    },
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  expect(response.ok(), "Session creation should succeed").toBeTruthy();
  const payload = await response.json();
  expect(payload?.session?.sessionId, "New session must include an id").toBeTruthy();
  return payload.session;
}

/**
 * Perform a real UI login using the admin credentials and return the issued token.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{ token: string }>}
 */
async function loginViaUi(page, credentials = ADMIN_CREDENTIALS) {
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");

  const composer = page.getByTestId("chat-composer");
  if ((await composer.count()) === 0) {
    const loginForm = page.getByTestId("account-form");
    await loginForm.waitFor({ state: "visible", timeout: 10000 });
    await page.fill("#account-email", credentials.email);
    await page.fill("#account-password", credentials.password);
    const loginResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/auth/login") && response.request().method() === "POST"
    );
    await page.click('[data-testid="account-submit"]');
    const loginResponse = await loginResponsePromise;
    expect(
      loginResponse.ok(),
      `${credentials.email} UI login request should succeed`
    ).toBeTruthy();
  }

  const dashboard = page.getByTestId("session-dashboard");
  const authFeedback = page.getByTestId("account-feedback");
  const start = Date.now();
  const timeoutMs = 20000;
  let authenticated = false;
  while (Date.now() - start < timeoutMs) {
    if ((await composer.count()) > 0 && (await composer.isVisible())) {
      authenticated = true;
      break;
    }
    if ((await dashboard.count()) > 0 && (await dashboard.isVisible())) {
      authenticated = true;
      break;
    }
    if ((await authFeedback.count()) > 0) {
      const feedbackText = await authFeedback.innerText();
      if (feedbackText && feedbackText.includes("failed")) {
        throw new Error(`${credentials.email} UI login failed. Feedback: ${feedbackText}`);
      }
    }
    await page.waitForTimeout(200);
  }

  if (!authenticated) {
    const feedback = (await authFeedback.innerText().catch(() => "")) || "none";
    throw new Error(
      `${credentials.email} UI login did not complete within ${timeoutMs}ms. Feedback: ${feedback}.`
    );
  }

  const token = await page.evaluate((storageKey) => {
    try {
      const record = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
      return typeof record?.token === "string" ? record.token : null;
    } catch (error) {
      return null;
    }
  }, AUTH_STORAGE_KEY);

  expect(token, "UI login should populate auth token in storage").toBeTruthy();

  return { token };
}

export async function loginAsAdminViaUi(page) {
  return loginViaUi(page, ADMIN_CREDENTIALS);
}

export async function loginAsRunnerViaUi(page) {
  return loginViaUi(page, RUNNER_CREDENTIALS);
}
