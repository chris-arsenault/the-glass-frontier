"use strict";

import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync  } from "child_process.js";

function repoRoot() {
  return path.resolve(__dirname, "..", "..");
}

describe("scripts/docker/publishTemporalWorker.js", () => {
  it("forces temporal-worker filter and clears conflicting overrides", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "publish-temporal-worker-"));
    const stubPath = path.join(tempDir, "publish-services.sh");
    const logPath = path.join(tempDir, "env.log");

    const stubContents = `#!/usr/bin/env bash
set -euo pipefail
{
  echo "CI_SERVICES=\${CI_SERVICES:-}"
  echo "CI_SERVICE_FILTER=\${CI_SERVICE_FILTER:-}"
  echo "SERVICES=\${SERVICES:-}"
} >> "\${PUBLISH_TEMPORAL_WORKER_LOG}"
`;
    fs.writeFileSync(stubPath, stubContents, { mode: 0o755 });

    const env = {
      ...process.env,
      PUBLISH_SERVICES_BIN: stubPath,
      PUBLISH_TEMPORAL_WORKER_LOG: logPath,
      CI_SERVICE_FILTER: "langgraph",
      SERVICES: "langgraph"
    };

    try {
      const result = spawnSync(
        "node",
        [path.join(repoRoot(), "scripts/docker/publishTemporalWorker.js")],
        {
          cwd: repoRoot(),
          env,
          encoding: "utf-8"
        }
      );

      if (result.status !== 0) {
        throw new Error(`docker:publish:temporal-worker failed: ${result.stderr || ""}`);
      }

      const log = fs.readFileSync(logPath, "utf-8").trim().split("\n");
      expect(log).toContain("CI_SERVICES=temporal-worker");
      expect(log).toContain("CI_SERVICE_FILTER=");
      expect(log).toContain("SERVICES=");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("propagates non-zero exit codes from publish-services", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "publish-temporal-worker-exit-"));
    const stubPath = path.join(tempDir, "publish-services.sh");

    const stubContents = `#!/usr/bin/env bash
exit 7
`;
    fs.writeFileSync(stubPath, stubContents, { mode: 0o755 });

    const env = {
      ...process.env,
      PUBLISH_SERVICES_BIN: stubPath
    };

    try {
      const result = spawnSync(
        "node",
        [path.join(repoRoot(), "scripts/docker/publishTemporalWorker.js")],
        {
          cwd: repoRoot(),
          env,
          encoding: "utf-8"
        }
      );

      expect(result.status).toBe(7);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

