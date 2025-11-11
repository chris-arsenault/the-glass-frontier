import { defineConfig } from "tsup";

const target = process.env.TARGET ?? "lambda"; // "local" | "lambda"

export default defineConfig({
  entry: target === "lambda"
    ? { handler: "src/server_lambda.ts" }
    : { local: "src/server_local.ts" },
  outDir: "dist",
  format: "cjs",
  platform: "node",
  target: "node22",
  bundle: true,
  splitting: false,
  minify: true,
  sourcemap: false,
  treeshake: true,
  clean: true,
  noExternal: [/.*/],
  metafile: true,
});
