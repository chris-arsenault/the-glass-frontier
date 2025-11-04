"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

function repoRoot() {
  return path.resolve(__dirname, "..", "..");
}

function readServiceNames() {
  return readServiceDefinitions().map((definition) => definition.name);
}

function readServiceDefinitions() {
  const serviceListPath = path.join(repoRoot(), "infra", "docker", "services.list");
  const contents = fs.readFileSync(serviceListPath, "utf-8");
  return contents
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const [name, ...rest] = line.split(":");
      return {
        name,
        entrypoint: rest.join(":").trim()
      };
    });
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

    try {
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
      expect(
        dockerLogContents.split("\n").filter(Boolean).some((line) => line.includes("build"))
      ).toBe(true);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("logs in and pushes images when CI_PUSH is true", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "publish-services-push-"));
    const dockerBin = path.join(tempDir, "docker");
    const manifestPath = path.join(tempDir, "manifest.json");
    const dockerLog = path.join(tempDir, "docker.log");

    const dockerScript = ["#!/bin/sh", 'printf "%s\\n" "$0 $@" >> "$DOCKER_STUB_LOG"', "exit 0", ""].join(
      "\n"
    );
    fs.writeFileSync(dockerBin, dockerScript, { mode: 0o755 });

    const env = {
      ...process.env,
      CI_PUSH: "true",
      CI_IMAGE_TAG: "push-test",
      CI_REGISTRY: "registry.push",
      CI_IMAGE_MANIFEST: manifestPath,
      CI_REGISTRY_USERNAME: "stage-user",
      CI_REGISTRY_PASSWORD: "stage-pass",
      CI_BUILD_ARGS: "EXTRA_FLAG=1,ANOTHER_FLAG=two",
      CI_IMAGE_PLATFORM: "linux/amd64",
      CI_DOCKER_CLI: dockerBin,
      DOCKER_STUB_LOG: dockerLog,
      PATH: `${tempDir}:${process.env.PATH}`
    };

    try {
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
      const serviceDefinitions = readServiceDefinitions();

      expect(manifest.push).toBe(true);
      serviceDefinitions.forEach((definition) => {
        expect(
          manifest.images.some(
            (entry) =>
              entry.name === definition.name &&
              entry.image === `registry.push/${definition.name}:push-test`
          )
        ).toBe(true);
      });

      const dockerLogContents = fs.readFileSync(dockerLog, "utf-8");
      const logLines = dockerLogContents.split("\n").filter(Boolean);
      const logText = logLines.join(" ");

      expect(logText).toContain("docker login registry.push");
      expect(logText).toContain("--build-arg EXTRA_FLAG=1");
      expect(logText).toContain("--build-arg ANOTHER_FLAG=two");
      expect(logText).toContain("--platform linux/amd64");

      serviceDefinitions.forEach((definition) => {
        expect(logText).toContain(`docker push registry.push/${definition.name}:push-test`);
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("has valid service entrypoints for each service definition", () => {
    const definitions = readServiceDefinitions();
    const seenNames = new Set();

    definitions.forEach(({ name, entrypoint }) => {
      expect(seenNames.has(name)).toBe(false);
      seenNames.add(name);

      const entrypointPath = path.join(repoRoot(), entrypoint);
      expect(fs.existsSync(entrypointPath)).toBe(true);
      expect(fs.statSync(entrypointPath).isFile()).toBe(true);
    });
  });
});
