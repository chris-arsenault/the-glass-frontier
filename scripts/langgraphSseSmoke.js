"use strict";

const { randomUUID } = require("crypto");

function parseArgs(argv) {
  const defaults = {
    baseUrl: process.env.LANGGRAPH_SMOKE_BASE_URL || "http://localhost:3000",
    adminEmail: process.env.LANGGRAPH_SMOKE_ADMIN_EMAIL || "admin@glassfrontier",
    adminPassword: process.env.LANGGRAPH_SMOKE_ADMIN_PASSWORD || "admin-pass",
    sessionTitle:
      process.env.LANGGRAPH_SMOKE_SESSION_TITLE || "LangGraph SSE Smoke Validation",
    sessionId: process.env.LANGGRAPH_SMOKE_SESSION_ID || `langgraph-sse-${Date.now()}`,
    timeoutMs: Number.parseInt(process.env.LANGGRAPH_SMOKE_TIMEOUT_MS || "", 10) || 10000,
    skipAdminAlert: process.env.LANGGRAPH_SMOKE_SKIP_ADMIN_ALERT === "true"
  };

  const config = { ...defaults };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--base-url":
        config.baseUrl = argv[++index] || config.baseUrl;
        break;
      case "--admin-email":
        config.adminEmail = argv[++index] || config.adminEmail;
        break;
      case "--admin-password":
        config.adminPassword = argv[++index] || config.adminPassword;
        break;
      case "--session-title":
        config.sessionTitle = argv[++index] || config.sessionTitle;
        break;
      case "--session-id":
        config.sessionId = argv[++index] || config.sessionId;
        break;
      case "--timeout":
        config.timeoutMs = Number.parseInt(argv[++index] || "", 10) || config.timeoutMs;
        break;
      case "--skip-admin-alert":
        config.skipAdminAlert = true;
        break;
      default:
        if (arg && arg.startsWith("--")) {
          console.warn(`[sse-smoke] Unknown option ${arg} ignored`);
        }
        break;
    }
  }

  return config;
}

function createUrl(baseUrl, path) {
  return new URL(path, baseUrl).toString();
}

async function login(baseUrl, email, password) {
  const response = await fetch(createUrl(baseUrl, "/auth/login"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Authentication failed (${response.status}): ${text}`);
  }

  const payload = await response.json();
  if (!payload?.token) {
    throw new Error("Authentication response missing token");
  }

  return payload;
}

async function createSession(baseUrl, token, sessionId, title) {
  const response = await fetch(createUrl(baseUrl, "/accounts/me/sessions"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ sessionId, title })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Failed to create session (${response.status}): ${text}`);
  }

  const payload = await response.json();
  if (!payload?.session?.sessionId) {
    throw new Error("Session creation response missing session data");
  }

  return payload.session;
}

async function openSseStream(baseUrl, sessionId, token) {
  const url = new URL(`/sessions/${encodeURIComponent(sessionId)}/events`, baseUrl);
  if (token) {
    url.searchParams.set("token", token);
  }

  const controller = new AbortController();
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "text/event-stream"
    },
    signal: controller.signal
  });

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "");
    throw new Error(`Failed to open SSE stream (${response.status}): ${text}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const history = [];
  const listeners = new Set();
  let closed = false;

  const pump = async () => {
    let buffer = "";
    try {
      while (true) {
        // eslint-disable-next-line no-await-in-loop
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        while (buffer.includes("\n\n")) {
          const index = buffer.indexOf("\n\n");
          const rawEvent = buffer.slice(0, index);
          buffer = buffer.slice(index + 2);

          if (!rawEvent.trim()) {
            continue;
          }

          const lines = rawEvent.split("\n");
          let dataPayload = "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("data:")) {
              dataPayload += trimmed.slice(5).trim();
            }
          }

          if (!dataPayload) {
            continue;
          }

          try {
            const event = JSON.parse(dataPayload);
            event.__receivedAt = Date.now();
            history.push(event);
            listeners.forEach((listener) => listener(event));
          } catch {
            // Ignore malformed partial payloads; they will resolve once the buffer completes.
          }
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        listeners.forEach((listener) => listener({ type: "sse.error", error }));
      }
    } finally {
      closed = true;
    }
  };

  // Kick off the stream reader without awaiting so consumers can start listening.
  pump();

  const waitFor = (predicate, timeoutMs) =>
    new Promise((resolve, reject) => {
      const existing = history.find(predicate);
      if (existing) {
        resolve(existing);
        return;
      }

      const timeout = setTimeout(() => {
        listeners.delete(listener);
        reject(new Error("Timed out waiting for SSE event"));
      }, timeoutMs);

      const listener = (event) => {
        if (predicate(event)) {
          clearTimeout(timeout);
          listeners.delete(listener);
          resolve(event);
        }
      };

      listeners.add(listener);
    });

  return {
    waitFor,
    close() {
      if (closed) {
        return;
      }
      controller.abort();
      listeners.clear();
    },
    history
  };
}

async function triggerDebugCheck(baseUrl, token, sessionId, body) {
  const response = await fetch(
    createUrl(baseUrl, `/debug/sessions/${encodeURIComponent(sessionId)}/checks`),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(body)
    }
  );

  if (response.status === 404) {
    throw new Error(
      "Debug check endpoint is unavailable. Set ENABLE_DEBUG_ENDPOINTS=true on the server."
    );
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Debug check request failed (${response.status}): ${text}`);
  }

  return response.json();
}

async function closeSession(baseUrl, token, sessionId, reason = "session.closed") {
  const response = await fetch(
    createUrl(baseUrl, `/sessions/${encodeURIComponent(sessionId)}/close`),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ reason })
    }
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Session closure failed (${response.status}): ${text}`);
  }

  return response.json();
}

function logStep(message) {
  console.log(`[sse-smoke] ${message}`);
}

async function run() {
  if (typeof fetch !== "function") {
    throw new Error("Global fetch is unavailable. Run this script with Node.js 18 or newer.");
  }

  const config = parseArgs(process.argv);
  logStep(`Starting SSE smoke against ${config.baseUrl}`);

  const auth = await login(config.baseUrl, config.adminEmail, config.adminPassword);
  logStep(`Authenticated as ${auth?.account?.email || config.adminEmail}`);

  const session = await createSession(
    config.baseUrl,
    auth.token,
    config.sessionId,
    config.sessionTitle
  );
  logStep(`Created session ${session.sessionId}`);

  const stream = await openSseStream(config.baseUrl, session.sessionId, auth.token);
  logStep("SSE stream connected");

  try {
    const checkStart = Date.now();
    const checkResponse = await triggerDebugCheck(config.baseUrl, auth.token, session.sessionId, {
      move: "langgraph-smoke-probe",
      stat: "finesse",
      statValue: 2
    });
    const checkId = checkResponse?.check?.id;
    logStep(`Dispatched debug check ${checkId}`);

    const resolvedEvent = await stream.waitFor(
      (event) => event.type === "event.checkResolved" && event.payload?.id === checkId,
      config.timeoutMs
    );
    const resolvedLatency = (resolvedEvent.__receivedAt || Date.now()) - checkStart;
    logStep(
      `Received check resolution (${resolvedEvent.payload?.tier}) in ${resolvedLatency}ms`
    );

    await stream
      .waitFor((event) => event.type === "overlay.characterSync", config.timeoutMs)
      .then(() => logStep("Overlay snapshot sync received"))
      .catch(() => logStep("Overlay snapshot not observed within timeout"));

    if (!config.skipAdminAlert) {
      const safetyStart = Date.now();
      const safetyCheck = await triggerDebugCheck(
        config.baseUrl,
        auth.token,
        session.sessionId,
        {
          move: "langgraph-smoke-safety",
          safetyFlags: ["prohibited-capability"],
          stat: "grit",
          statValue: 1
        }
      );
      const safetyCheckId = safetyCheck?.check?.id;
      logStep(`Dispatched safety-flagged debug check ${safetyCheckId}`);

      await stream
        .waitFor(
          (event) => event.type === "event.checkVetoed" && event.payload?.id === safetyCheckId,
          config.timeoutMs
        )
        .then(() => logStep("Check veto event received"))
        .catch(() => logStep("Check veto event not observed within timeout"));

      const alertEvent = await stream.waitFor(
        (event) => event.type === "admin.alert" && event.payload?.data?.checkId === safetyCheckId,
        config.timeoutMs
      );
      const alertLatency = (alertEvent.__receivedAt || Date.now()) - safetyStart;
      logStep(
        `Admin alert ${alertEvent.payload?.reason} received in ${alertLatency}ms (severity ${alertEvent.payload?.severity})`
      );
    } else {
      logStep("Skipping admin alert validation");
    }

    const closureStart = Date.now();
    await closeSession(config.baseUrl, auth.token, session.sessionId, "debug.validation");
    logStep("Session closure requested");

    const closedEvent = await stream.waitFor(
      (event) => event.type === "session.closed",
      config.timeoutMs
    );
    const closureLatency = (closedEvent.__receivedAt || Date.now()) - closureStart;
    logStep(`Session closed event received in ${closureLatency}ms`);

    await stream
      .waitFor(
        (event) => event.type === "offline.sessionClosure.queued",
        config.timeoutMs
      )
      .then((event) => {
        const queuedLatency = (event.__receivedAt || Date.now()) - closureStart;
        logStep(
          `Offline workflow queued (job ${event.payload?.jobId || "unknown"}) in ${queuedLatency}ms`
        );
      })
      .catch(() => logStep("Offline queue event not observed within timeout"));
  } finally {
    stream.close();
  }

  logStep("SSE smoke completed successfully");
}

run().catch((error) => {
  console.error(`[sse-smoke] Error: ${error.message}`);
  process.exitCode = 1;
});
