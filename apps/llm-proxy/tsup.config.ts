import { defineConfig } from 'tsup';

const target = process.env.TARGET ?? 'lambda'; // "local" | "lambda"

const entry =
  target === 'lambda' ? { handler: 'src/server_lambda.ts' } : { local: 'src/server_local.ts' };

export const tsupConfig = defineConfig({
  bundle: true,
  clean: true,
  entry,
  format: 'cjs',
  metafile: true,
  minify: true,
  noExternal: [/.*/],
  outDir: 'dist',
  platform: 'node',
  sourcemap: false,
  splitting: false,
  target: 'node22',
  treeshake: true,
});

export default tsupConfig;