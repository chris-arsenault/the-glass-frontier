"use strict";

const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const dns = require("dns");
const { Agent, setGlobalDispatcher } = require("undici");
const EventSource = require("eventsource");

let customCaBuffer = null;

function configureCustomCa() {
  const candidates = [];

  if (process.env.LANGGRAPH_SMOKE_CA_PATH) {
    candidates.push(process.env.LANGGRAPH_SMOKE_CA_PATH);
  }

  candidates.push(
    path.join(
      __dirname,
      "..",
      "infra",
      "stage",
      "data",
      "caddy",
      "pki",
      "authorities",
      "local",
      "root.crt"
    )
  );

  candidates.push(path.join(__dirname, "..", "infra", "stage", "certs", "rootCA.pem"));

  for (const candidate of candidates) {
    const resolved = path.isAbsolute(candidate) ? candidate : path.join(process.cwd(), candidate);
    if (!resolved || !fs.existsSync(resolved)) {
      continue;
    }

    try {
      const ca = fs.readFileSync(resolved);
      customCaBuffer = ca;
      setGlobalDispatcher(
        new Agent({
          allowH2: false,
          connect: {
            ca,
            rejectUnauthorized: true
          }
        })
      );
      return resolved;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn(`[sse-smoke] Failed to configure CA from ${resolved}: ${error.message}`);
    }
  }

  return null;
}

const configuredCaPath = configureCustomCa();
if (configuredCaPath) {
  // eslint-disable-next-line no-console
  console.log(`[sse-smoke] Using custom CA ${configuredCaPath}`);
}

function installHostOverride(hostname, ipv4Address, ipv6Address = "::1") {
  if (!hostname || !ipv4Address) {
    return;
  }

  const target = hostname.toLowerCase();
  const originalLookup = dns.lookup.bind(dns);
  const originalPromisesLookup =
    dns.promises && typeof dns.promises.lookup === "function"
      ? dns.promises.lookup.bind(dns.promises)
      : null;

  dns.lookup = (host, options, callback) => {
    let resolvedOptions = options;
    let resolvedCallback = callback;
    if (typeof resolvedOptions === "function") {
      resolvedCallback = resolvedOptions;
      resolvedOptions = {};
    }

    if (host && host.toLowerCase() === target) {
      if (resolvedOptions?.all) {
        const addresses = [];
        if (ipv4Address) {
          addresses.push({ address: ipv4Address, family: 4 });
        }
        if (ipv6Address) {
          addresses.push({ address: ipv6Address, family: 6 });
        }
        setImmediate(() => resolvedCallback(null, addresses));
        return;
      }

      const family = resolvedOptions?.family === 6 ? 6 : 4;
      const address = family === 6 ? ipv6Address : ipv4Address;
      setImmediate(() => resolvedCallback(null, address, family));
      return;
    }

    return originalLookup(host, resolvedOptions, resolvedCallback);
  };

  if (originalPromisesLookup) {
    dns.promises.lookup = async (host, options = {}) => {
      if (host && host.toLowerCase() === target) {
        if (options.all) {
          const addresses = [];
          if (ipv4Address) {
            addresses.push({ address: ipv4Address, family: 4 });
          }
          if (ipv6Address) {
            addresses.push({ address: ipv6Address, family: 6 });
          }
          return addresses;
        }

        const family = options.family === 6 ? 6 : 4;
        return { address: family === 6 ? ipv6Address : ipv4Address, family };
      }

      return originalPromisesLookup(host, options);
    };
  }
}

function parseArgs(argv) {
  const defaults = {
    baseUrl: process.env.LANGGRAPH_SMOKE_BASE_URL || "http://localhost:3000",
    adminEmail: process.env.LANGGRAPH_SMOKE_ADMIN_EMAIL || "admin@glassfrontier",
    adminPassword: process.env.LANGGRAPH_SMOKE_ADMIN_PASSWORD || "admin-pass",
    sessionTitle:
      process.env.LANGGRAPH_SMOKE_SESSION_TITLE || "LangGraph SSE Smoke Validation",
    sessionId: process.env.LANGGRAPH_SMOKE_SESSION_ID || `langgraph-sse-${Date.now()}`,
    timeoutMs: Number.parseInt(process.env.LANGGRAPH_SMOKE_TIMEOUT_MS || "", 10) || 10000,
    skipAdminAlert: process.env.LANGGRAPH_SMOKE_SKIP_ADMIN_ALERT === "true",
    reportPath: process.env.LANGGRAPH_SMOKE_REPORT_PATH || "",
    skipSse: process.env.LANGGRAPH_SMOKE_SKIP_SSE === "true"
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
      case "--report":
        config.reportPath = argv[++index] || config.reportPath;
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

function createUrl(baseUrl, resourcePath) {
  const base = new URL(baseUrl);
  let targetPath = resourcePath;

  if (resourcePath.startsWith("/")) {
    const basePath = base.pathname.endsWith("/")
      ? base.pathname.slice(0, -1)
      : base.pathname;
    targetPath = `${basePath}${resourcePath}`;
  }

  return new URL(targetPath, `${base.origin}/`).toString();
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
  const resourcePath = `/sessions/${encodeURIComponent(sessionId)}/events`;
  const url = new URL(createUrl(baseUrl, resourcePath));
  if (token) {
    url.searchParams.set("token", token);
  }

  const options = {
    headers: {
      Accept: "text/event-stream"
    }
  };

  if (customCaBuffer) {
    options.https = {
      ca: customCaBuffer,
      rejectUnauthorized: true
    };
  }

  return new Promise((resolve, reject) => {
    const history = [];
    const listeners = new Set();
    let closed = false;
    let resolved = false;

    const notify = (event) => {
      listeners.forEach((listener) => listener(event));
    };

    const cleanup = (source) => {
      if (closed) {
        return;
      }
      closed = true;
      listeners.clear();
      try {
        source.close();
      } catch {
        // ignore
      }
    };

    let eventSource = null;
    try {
      eventSource = new EventSource(url.toString(), options);
    } catch (error) {
      reject(new Error(`Failed to open SSE stream: ${error.message}`));
      return;
    }

    eventSource.onmessage = (event) => {
      if (!event?.data) {
        return;
      }
      try {
        const payload = JSON.parse(event.data);
        payload.__receivedAt = Date.now();
        history.push(payload);
        notify(payload);
      } catch (error) {
        if (process.env.LANGGRAPH_SMOKE_DEBUG === "true") {
          console.warn(`[sse-smoke] Failed to parse SSE payload: ${error.message}`);
        }
        notify({ type: "sse.parseError", error });
      }
    };

    eventSource.onerror = (error) => {
      if (!resolved) {
        resolved = true;
        cleanup(eventSource);
        reject(
          new Error(
            `Failed to open SSE stream${
              error?.status ? ` (${error.status})` : ""
            }: ${error?.message || "unknown error"}`
          )
        );
        return;
      }
      notify({ type: "sse.error", error });
    };

    eventSource.onopen = () => {
      if (resolved) {
        return;
      }
      resolved = true;

      const waitFor = (predicate, timeoutMs) =>
        new Promise((resolveWait, rejectWait) => {
          const existing = history.find(predicate);
          if (existing) {
            resolveWait(existing);
            return;
          }

          const timeout = setTimeout(() => {
            listeners.delete(listener);
            rejectWait(new Error("Timed out waiting for SSE event"));
          }, timeoutMs);

          const listener = (event) => {
            if (predicate(event)) {
              clearTimeout(timeout);
              listeners.delete(listener);
              resolveWait(event);
            }
          };

          listeners.add(listener);
        });

      resolve({
        waitFor,
        close() {
          cleanup(eventSource);
        },
        history
      });
    };
  });
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

function writeReport(reportPath, summary) {
  if (!reportPath) {
    return;
  }

  try {
    const directory = path.dirname(reportPath);
    if (directory && directory !== ".") {
      fs.mkdirSync(directory, { recursive: true });
    }
    fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2));
    logStep(`Report written to ${reportPath}`);
  } catch (error) {
    console.warn(`[sse-smoke] Failed to write report: ${error.message}`);
  }
}

async function run(argv = process.argv) {
  if (typeof fetch !== "function") {
    throw new Error("Global fetch is unavailable. Run this script with Node.js 18 or newer.");
  }

  const config = parseArgs(argv);
  const startTime = Date.now();
  try {
    const baseHostname = new URL(config.baseUrl).hostname;
    installHostOverride(
      baseHostname,
      process.env.LANGGRAPH_SMOKE_ADDRESS || null,
      process.env.LANGGRAPH_SMOKE_ADDRESS_V6 || "::1"
    );
  } catch (error) {
    throw new Error(`Invalid base URL provided: ${config.baseUrl}`);
  }
  const summary = {
    runId: randomUUID(),
    startedAt: new Date(startTime).toISOString(),
    baseUrl: config.baseUrl,
    config: {
      timeoutMs: config.timeoutMs,
      skipAdminAlert: config.skipAdminAlert,
      reportPath: config.reportPath || null,
      skipSse: config.skipSse
    },
    metrics: {},
    eventCounts: {}
  };

  logStep(`Starting SSE smoke against ${config.baseUrl}`);

  const auth = await login(config.baseUrl, config.adminEmail, config.adminPassword);
  summary.account = {
    id: auth?.account?.id || null,
    email: auth?.account?.email || config.adminEmail || null,
    role: auth?.account?.role || null
  };
  logStep(`Authenticated as ${auth?.account?.email || config.adminEmail}`);

  const session = await createSession(
    config.baseUrl,
    auth.token,
    config.sessionId,
    config.sessionTitle
  );
  summary.session = {
    id: session.sessionId,
    title: session.title || config.sessionTitle,
    createdAt: session.createdAt || null
  };
  logStep(`Created session ${session.sessionId}`);

  if (config.skipSse) {
    logStep("Skipping SSE stream validation per configuration");

    const checkStart = Date.now();
    const checkResponse = await triggerDebugCheck(
      config.baseUrl,
      auth.token,
      session.sessionId,
      {
        move: "langgraph-smoke-probe",
        stat: "finesse",
        statValue: 2
      }
    );
    const checkId = checkResponse?.check?.id || null;
    summary.metrics.checkDispatch = {
      id: checkId,
      requestedAt: new Date(checkStart).toISOString(),
      move: checkResponse?.check?.move || "unknown"
    };
    summary.metrics.checkResolution = {
      id: checkId,
      tier: null,
      latencyMs: Date.now() - checkStart,
      observed: false,
      skipped: true
    };

    await closeSession(config.baseUrl, auth.token, session.sessionId, "debug.validation");
    logStep("Session closure requested (SSE validation skipped)");

    summary.success = true;
    return summary;
  }

  let stream;
  try {
    stream = await openSseStream(config.baseUrl, session.sessionId, auth.token);
    summary.stream = {
      connectedAt: new Date().toISOString()
    };
    logStep("SSE stream connected");

    const checkStart = Date.now();
    const checkResponse = await triggerDebugCheck(config.baseUrl, auth.token, session.sessionId, {
      move: "langgraph-smoke-probe",
      stat: "finesse",
      statValue: 2
    });
    const checkId = checkResponse?.check?.id;
    summary.metrics.checkDispatch = {
      id: checkId || null,
      requestedAt: new Date(checkStart).toISOString(),
      move: checkResponse?.check?.move || "unknown"
    };
    logStep(`Dispatched debug check ${checkId}`);

    const resolvedEvent = await stream.waitFor(
      (event) => event.type === "event.checkResolved" && event.payload?.id === checkId,
      config.timeoutMs
    );
    const resolvedLatency = (resolvedEvent.__receivedAt || Date.now()) - checkStart;
    summary.metrics.checkResolution = {
      id: checkId || null,
      tier: resolvedEvent.payload?.tier || null,
      latencyMs: resolvedLatency
    };
    logStep(
      `Received check resolution (${resolvedEvent.payload?.tier}) in ${resolvedLatency}ms`
    );

    try {
      const overlayEvent = await stream.waitFor(
        (event) => event.type === "overlay.characterSync",
        config.timeoutMs
      );
      const overlayLatency =
        (overlayEvent.__receivedAt || Date.now()) - checkStart;
      summary.metrics.overlaySync = {
        observed: true,
        latencyMs: overlayLatency
      };
      logStep("Overlay snapshot sync received");
    } catch {
      summary.metrics.overlaySync = {
        observed: false
      };
      logStep("Overlay snapshot not observed within timeout");
    }

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
      summary.metrics.safetyCheck = {
        id: safetyCheckId || null,
        requestedAt: new Date(safetyStart).toISOString(),
        move: safetyCheck?.check?.move || "unknown"
      };
      logStep(`Dispatched safety-flagged debug check ${safetyCheckId}`);

      try {
        const vetoEvent = await stream.waitFor(
          (event) => event.type === "event.checkVetoed" && event.payload?.id === safetyCheckId,
          config.timeoutMs
        );
        summary.metrics.safetyVeto = {
          observed: true,
          latencyMs: (vetoEvent.__receivedAt || Date.now()) - safetyStart
        };
        logStep("Check veto event received");
      } catch {
        summary.metrics.safetyVeto = {
          observed: false
        };
        logStep("Check veto event not observed within timeout");
      }

      const alertEvent = await stream.waitFor(
        (event) => event.type === "admin.alert" && event.payload?.data?.checkId === safetyCheckId,
        config.timeoutMs
      );
      const alertLatency = (alertEvent.__receivedAt || Date.now()) - safetyStart;
      summary.metrics.adminAlert = {
        observed: true,
        latencyMs: alertLatency,
        severity: alertEvent.payload?.severity || null,
        reason: alertEvent.payload?.reason || null
      };
      logStep(
        `Admin alert ${alertEvent.payload?.reason} received in ${alertLatency}ms (severity ${alertEvent.payload?.severity})`
      );
    } else {
      summary.metrics.adminAlert = {
        observed: false,
        skipped: true
      };
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
    summary.metrics.sessionClosure = {
      latencyMs: closureLatency
    };
    logStep(`Session closed event received in ${closureLatency}ms`);

    try {
      const queueEvent = await stream.waitFor(
        (event) => event.type === "offline.sessionClosure.queued",
        config.timeoutMs
      );
      const queuedLatency = (queueEvent.__receivedAt || Date.now()) - closureStart;
      summary.metrics.offlineQueue = {
        observed: true,
        latencyMs: queuedLatency,
        jobId: queueEvent.payload?.jobId || null
      };
      logStep(
        `Offline workflow queued (job ${queueEvent.payload?.jobId || "unknown"}) in ${queuedLatency}ms`
      );
    } catch {
      summary.metrics.offlineQueue = {
        observed: false
      };
      logStep("Offline queue event not observed within timeout");
    }

    summary.success = true;
    logStep("SSE smoke completed successfully");
    return summary;
  } catch (error) {
    summary.success = false;
    summary.error = { message: error.message };
    throw Object.assign(error, { summary });
  } finally {
    if (stream) {
      summary.eventCounts = stream.history.reduce((accumulator, event) => {
        const type = event?.type || "unknown";
        accumulator[type] = (accumulator[type] || 0) + 1;
        return accumulator;
      }, {});
      stream.close();
    } else {
      summary.eventCounts = {};
    }
    summary.completedAt = new Date().toISOString();
    summary.durationMs = Date.now() - startTime;
  }
}

if (require.main === module) {
  run()
    .then((summary) => {
      writeReport(summary.config.reportPath, summary);
    })
    .catch((error) => {
      const summary = error.summary;
      if (summary) {
        writeReport(summary.config?.reportPath, summary);
      }
      console.error(`[sse-smoke] Error: ${error.message}`);
      if (error.cause) {
        console.error(
          `[sse-smoke] Cause: ${error.cause.message || error.cause} ${
            error.cause.code ? `(code: ${error.cause.code})` : ""
          }`
        );
      }
      process.exitCode = 1;
    });
}

module.exports = {
  parseArgs,
  createUrl,
  login,
  createSession,
  openSseStream,
  triggerDebugCheck,
  closeSession,
  run,
  writeReport
};
