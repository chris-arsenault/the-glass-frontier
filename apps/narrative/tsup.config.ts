// import { defineConfig } from "tsup";
//
// const target = process.env.TARGET ?? "local"; // "local" | "lambda"
//
// export default defineConfig({
//   entry: target === "lambda"
//     ? { handler: "src/server.lambda.ts" }
//     : { local: "src/server.local.ts" },
//   outDir: "dist",
//   format: "cjs",
//   platform: "node",
//   target: "node20",
//   bundle: true,
//   splitting: false,
//   minify: true,
//   sourcemap: false,
//   treeshake: true,
//   clean: true,
// });
