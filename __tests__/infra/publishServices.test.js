"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

function repoRoot() {
  return path.resolve(__dirname, "..", "..");
}

function readServiceNames() {
  const serviceListPath = path.join(repoRoot(), "infra", "docker", "services.list");
  const contents = fs.readFileSync(serviceListPath, "utf-8");
  return contents
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.split(":")[0]);
}

describe("infra/docker/publish-services.sh", () => {
  it("writes a manifest using a configurable docker CLI", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "publish-services-"));
    const dockerBin = path.join(tempDir, "docker");
    const manifestPath = path.join(tempDir, "manifest.json");
    const dockerLog = path.join(tempDir, "docker.log");

    const dockerScript = ["#!/bin/sh", 'printf "%s\\n" "$0 $@" >> "$DOCKER_STUB_LOG"', "exit 0", ""].join(
      "\n"
    );
    fs.writeFileSync(dockerBin, dockerScript, { mode: 0o755 });

    const env = {
      ...process.env,
      CI_PUSH: "false",
      CI_IMAGE_TAG: "test-tag",
      CI_REGISTRY: "registry.test",
      CI_IMAGE_MANIFEST: manifestPath,
      CI_DOCKER_CLI: dockerBin,
      DOCKER_STUB_LOG: dockerLog,
      PATH: `${tempDir}:${process.env.PATH}`
    };

    const scriptPath = path.join(repoRoot(), "infra", "docker", "publish-services.sh");
    const result = spawnSync("bash", [scriptPath], {
      cwd: repoRoot(),
      env,
      encoding: "utf-8"
    });

    if (result.status !== 0) {
      throw new Error(
        `publish-services.sh failed: ${result.stderr || ""}\nstdout: ${result.stdout || ""}`
      );
    }

    const manifestRaw = fs.readFileSync(manifestPath, "utf-8");
    const manifest = JSON.parse(manifestRaw);
    const expectedServiceNames = readServiceNames();

    expect(manifest.registry).toBe("registry.test");
    expect(manifest.tag).toBe("test-tag");
    expect(manifest.push).toBe(false);
    expect(Array.isArray(manifest.images)).toBe(true);
    expect(manifest.images.map((entry) => entry.name)).toEqual(expectedServiceNames);
    manifest.images.forEach((entry) => {
      expect(entry.image).toBe(`registry.test/${entry.name}:test-tag`);
    });

    const dockerLogContents = fs.readFileSync(dockerLog, "utf-8");
    expect(dockerLogContents.split("\n").filter(Boolean).some((line) => line.includes("build"))).toBe(
      true
    );

    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
