import { defineConfig } from 'tsup';

export const tsupConfig = defineConfig({
  bundle: true,
  clean: true,
  entry: {
    ingest: 'src/lambdas/ingest.ts',
    poll: 'src/lambdas/poll.ts',
  },
  // AWS SDK is available in Lambda runtime, don't bundle it
  external: [/^@aws-sdk\/.*/],
  format: 'cjs',
  metafile: true,
  minify: true,
  noExternal: [/^(?!@aws-sdk).*/],
  outDir: 'dist',
  outExtension: () => ({ js: '.js' }),
  platform: 'node',
  sourcemap: false,
  splitting: false,
  target: 'node22',
  treeshake: true,
});

export default tsupConfig;
