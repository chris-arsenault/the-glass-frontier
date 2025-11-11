import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    connect: "src/lambdas/connect.ts",
    disconnect: "src/lambdas/disconnect.ts",
    subscribe: "src/lambdas/subscribe.ts",
    dispatcher: "src/lambdas/dispatcher.ts"
  },
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
  outExtension: () => ({ js: ".js" })
});
