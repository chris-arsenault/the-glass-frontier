"use strict";

const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const { startMdnsAdvertiser } = require("./stage/mdnsAdvertiser");

const REPO_ROOT = path.join(__dirname, "..");
const STAGE_DIR = path.join(REPO_ROOT, "infra", "stage");
const STAGE_COMPOSE_FILE = path.join(STAGE_DIR, "docker-compose.yml");
const STAGE_HOSTNAME = "stage.glass-frontier.local";
const LOCAL_API_URL = "http://127.0.0.1:3000/health";
const STAGE_PROXY_ADDRESS = "127.0.0.1";
const CA_CONTAINER_PATH = "/data/caddy/pki/authorities/local/root.crt";
const CA_PATH = path.join(STAGE_DIR, "certs", "rootCA.pem");
const DEFAULT_STAGE_PROXY_PORT =
  Number.parseInt(process.env.STAGE_PROXY_PREFERRED_PORT || "", 10) || 443;
const FALLBACK_STAGE_PROXY_PORT =
  Number.parseInt(process.env.STAGE_PROXY_FALLBACK_PORT || "", 10) || 4443;

let stageProxyPort = DEFAULT_STAGE_PROXY_PORT;

let composeBinaryCache = null;

function getStageUrl(pathname) {
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (stageProxyPort === 443) {
    return `https://${STAGE_HOSTNAME}${normalized}`;
  }
  return `https://${STAGE_HOSTNAME}:${stageProxyPort}${normalized}`;
}

function resolveComposeBinary() {
  if (composeBinaryCache) {
    return composeBinaryCache;
  }

  const pluginResult = spawnSync("docker", ["compose", "version"], {
    stdio: "ignore"
  });

  if (pluginResult.status === 0) {
    composeBinaryCache = {
      command: "docker",
      args: ["compose"]
    };
    return composeBinaryCache;
  }

  const legacyResult = spawnSync("docker-compose", ["version"], {
    stdio: "ignore"
  });

  if (legacyResult.status === 0) {
    composeBinaryCache = {
      command: "docker-compose",
      args: []
    };
    return composeBinaryCache;
  }

  throw new Error(
    "Docker Compose plugin (docker compose) or docker-compose CLI is required"
  );
}

function runCompose(args, options = {}) {
  const { command, args: baseArgs } = resolveComposeBinary();
  return runCommand(command, [...baseArgs, ...args], options);
}

function runComposeSync(args, options = {}) {
  const { command, args: baseArgs } = resolveComposeBinary();
  return spawnSync(command, [...baseArgs, ...args], options);
}

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      ...options
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
      }
    });
  });
}

function startApiServer() {
  const server = spawn("node", ["src/server/index.js"], {
    cwd: REPO_ROOT,
    stdio: ["ignore", "inherit", "inherit"],
    env: {
      ...process.env,
      PORT: process.env.PORT || "3000",
      LOG_LEVEL: process.env.LOG_LEVEL || "info",
      ENABLE_DEBUG_ENDPOINTS: "true"
    }
  });

  return server;
}

async function waitForLocalApi(retries = 30) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await fetch(LOCAL_API_URL);
      if (response.ok) {
        return;
      }
    } catch (error) {
      // swallow errors until retries exhausted
    }
    await delay(1000);
  }

  throw new Error("Timed out waiting for local API server");
}

async function ensureStageProxy() {
  const attemptedPorts = [];
  const candidates = [DEFAULT_STAGE_PROXY_PORT];
  if (!candidates.includes(FALLBACK_STAGE_PROXY_PORT)) {
    candidates.push(FALLBACK_STAGE_PROXY_PORT);
  }

  for (const candidate of candidates) {
    try {
      await runCompose(["-f", STAGE_COMPOSE_FILE, "up", "-d", "stage-proxy"], {
        cwd: STAGE_DIR,
        env: {
          ...process.env,
          STAGE_PROXY_HOST_PORT: String(candidate)
        }
      });
      stageProxyPort = candidate;
    } catch (error) {
      attemptedPorts.push({ port: candidate, error });
      console.warn(
        `[stage-smoke] Failed to start stage proxy on port ${candidate}: ${error.message}`
      );
      runComposeSync(["-f", STAGE_COMPOSE_FILE, "down"], {
        cwd: STAGE_DIR,
        stdio: "inherit",
        env: {
          ...process.env,
          STAGE_PROXY_HOST_PORT: String(candidate)
        }
      });
      continue;
    }

    for (let attempt = 0; attempt < 30; attempt += 1) {
      const result = runComposeSync(
        ["-f", STAGE_COMPOSE_FILE, "exec", "-T", "stage-proxy", "cat", CA_CONTAINER_PATH],
        {
          cwd: STAGE_DIR,
          encoding: "utf8",
          env: {
            ...process.env,
            STAGE_PROXY_HOST_PORT: String(stageProxyPort)
          }
        }
      );

      if (result.status === 0 && result.stdout) {
        fs.writeFileSync(CA_PATH, result.stdout, "utf8");
        if (stageProxyPort !== DEFAULT_STAGE_PROXY_PORT) {
          console.log(
            `[stage-smoke] Stage proxy running on fallback port ${stageProxyPort}; curl + smoke harness configured accordingly`
          );
        }
        return;
      }

      await delay(1000);
    }

    attemptedPorts.push({
      port: candidate,
      error: new Error("Timed out waiting for stage proxy CA certificate")
    });
    runComposeSync(["-f", STAGE_COMPOSE_FILE, "down"], {
      cwd: STAGE_DIR,
      stdio: "inherit",
      env: {
        ...process.env,
        STAGE_PROXY_HOST_PORT: String(candidate)
      }
    });
  }

  const details = attemptedPorts
    .map((attempt) => `port ${attempt.port}: ${attempt.error?.message || "unknown error"}`)
    .join("; ");
  throw new Error(`Unable to start stage proxy on any configured port (${details})`);
}

async function verifyCurlConnectivity() {
  const healthUrl = getStageUrl("/api/health");
  await runCommand(
    "curl",
    [
      "--fail",
      "--silent",
      "--show-error",
      "--resolve",
      `${STAGE_HOSTNAME}:${stageProxyPort}:${STAGE_PROXY_ADDRESS}`,
      healthUrl
    ],
    {
      env: {
        ...process.env,
        CURL_CA_BUNDLE: CA_PATH
      }
    }
  );
}

async function runSmoke(reportPath) {
  const baseUrl = getStageUrl("/api");
  await runCommand(
    "node",
    [
      "scripts/langgraphSseSmoke.js",
      "--base-url",
      baseUrl,
      "--report",
      reportPath
    ],
    {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        LANGGRAPH_SMOKE_CA_PATH: CA_PATH,
        LANGGRAPH_SMOKE_ADDRESS: STAGE_PROXY_ADDRESS,
        LANGGRAPH_SMOKE_SEED_ADMIN_ALERT: "true",
        LANGGRAPH_SMOKE_AUTO_ADMIN_ALERT: "true",
        LANGGRAPH_SMOKE_ALERT_OBSERVATION_PATH: path.join(
          "artifacts",
          "admin-alert-observations.json"
        )
      }
    }
  );
}

async function shutdownServer(server) {
  if (!server) {
    return;
  }

  return new Promise((resolve) => {
    let resolved = false;

    const cleanup = () => {
      if (resolved) {
        return;
      }
      resolved = true;
      resolve();
    };

    server.once("exit", cleanup);
    server.once("error", cleanup);

    server.kill("SIGINT");

    setTimeout(() => {
      if (!resolved) {
        server.kill("SIGKILL");
        cleanup();
      }
    }, 5000);
  });
}

async function teardownStageProxy() {
  runComposeSync(["-f", STAGE_COMPOSE_FILE, "down"], {
    cwd: STAGE_DIR,
    stdio: "inherit",
    env: {
      ...process.env,
      STAGE_PROXY_HOST_PORT: String(stageProxyPort)
    }
  });
}

async function main() {
  const reportPath = path.join("artifacts", "langgraph-sse-staging.json");

  let server = null;
  let stopMdns = null;

  try {
    console.log("[stage-smoke] Starting local API server");
    server = startApiServer();
    await waitForLocalApi();

    console.log("[stage-smoke] Ensuring stage proxy is running");
    await ensureStageProxy();

    console.log("[stage-smoke] Advertising stage.mDNS hostname");
    stopMdns = startMdnsAdvertiser({ hostname: STAGE_HOSTNAME });

    console.log("[stage-smoke] Verifying curl connectivity");
    await verifyCurlConnectivity();

    console.log("[stage-smoke] Running LangGraph SSE smoke against staging endpoint");
    await runSmoke(reportPath);

    console.log("[stage-smoke] Summarising admin alert observation artefact");
    await runCommand("node", ["scripts/adminAlertStatus.js"], {
      cwd: REPO_ROOT
    });

    console.log("[stage-smoke] Smoke run completed successfully");
  } finally {
    if (stopMdns) {
      stopMdns();
    }
    await shutdownServer(server);
    await teardownStageProxy();
  }
}

main()
  .then(() => {
    console.log("[stage-smoke] Completed");
  })
  .catch((error) => {
    console.error("[stage-smoke] Failed:", error.message);
    process.exitCode = 1;
  });
