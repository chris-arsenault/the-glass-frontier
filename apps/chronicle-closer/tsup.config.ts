import { defineConfig } from 'tsup';

export default defineConfig({
  bundle: true,
  clean: true,
  entry: {
    handler: 'src/handler.ts',
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
