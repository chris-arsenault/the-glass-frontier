import { defineConfig } from 'tsup';

export const tsupConfig = defineConfig({
  bundle: true,
  clean: true,
  entry: {
    connect: 'src/lambdas/connect.ts',
    disconnect: 'src/lambdas/disconnect.ts',
    dispatcher: 'src/lambdas/dispatcher.ts',
    subscribe: 'src/lambdas/subscribe.ts',
  },
  format: 'cjs',
  metafile: true,
  minify: true,
  noExternal: [/.*/],
  outDir: 'dist',
  outExtension: () => ({ js: '.js' }),
  platform: 'node',
  sourcemap: false,
  splitting: false,
  target: 'node22',
  treeshake: true,
});

export default tsupConfig;
