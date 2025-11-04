"use strict";

/**
 * Helper script that forces docker publishing runs to target only the Temporal worker.
 * Intended for staging rehearsals while registry credentials are restored.
 */

const path = require("path");
const { spawnSync } = require("child_process");

function repoRoot() {
  return path.resolve(__dirname, "..", "..");
}

function resolvePublishScript() {
  const override = process.env.PUBLISH_SERVICES_BIN;
  if (override && override.trim().length > 0) {
    return path.resolve(override);
  }
  return path.join(repoRoot(), "infra", "docker", "publish-services.sh");
}

function run() {
  const publishScript = resolvePublishScript();
  const env = { ...process.env };

  if (process.env.CI_SERVICE_FILTER || process.env.SERVICES) {
    console.warn(
      "[docker:publish:temporal-worker] Overriding CI service filters to target temporal-worker only."
    );
  }

  env.CI_SERVICES = "temporal-worker";
  delete env.CI_SERVICE_FILTER;
  delete env.SERVICES;
  delete env.PUBLISH_SERVICES_BIN;

  const result = spawnSync("bash", [publishScript], {
    cwd: repoRoot(),
    env,
    stdio: "inherit"
  });

  if (result.error) {
    console.error(
      "[docker:publish:temporal-worker] Failed to execute publish-services.sh:",
      result.error.message
    );
    process.exit(1);
  }

  const exitCode = typeof result.status === "number" ? result.status : 1;
  process.exit(exitCode);
}

run();

