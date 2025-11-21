/* eslint-env node */
/* global process */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { URL } from 'node:url';

const r = (p) => path.resolve(process.cwd(), p);

const baseTarget = process.env.VITE_API_TARGET || 'http://localhost';
const ensureUrl = (value) => (value.includes('://') ? value : `http://${value}`);
const normalizedBase = ensureUrl(baseTarget);
const isLocalHost = (hostname) =>
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0';
const buildTarget = (port) => {
  const url = new URL(normalizedBase);
  if (!url.port && isLocalHost(url.hostname)) {
    url.port = String(port);
  }
  return url.toString().replace(/\/$/, '');
};

const chroniclePort = Number(process.env.CHRONICLE_API_PORT ?? process.env.NARRATIVE_PORT ?? 7000);
const gmPort = Number(process.env.GM_API_PORT ?? 7001);
const promptPort = Number(process.env.PROMPT_API_PORT ?? 7400);
const worldSchemaPort = Number(process.env.WORLD_SCHEMA_API_PORT ?? 4015);
const atlasPort = Number(process.env.ATLAS_API_PORT ?? 4016);

const proxy = {
  '/chronicle': {
    target: buildTarget(chroniclePort),
    changeOrigin: true,
    rewrite: (p) => p.replace(/^\/chronicle/, ''),
  },
  '/prompt': {
    target: buildTarget(promptPort),
    changeOrigin: true,
    rewrite: (p) => p.replace(/^\/prompt/, ''),
  },
  '/gm': {
    target: buildTarget(gmPort),
    changeOrigin: true,
    rewrite: (p) => p.replace(/^\/gm/, ''),
  },
  '/world-schema-api': {
    target: buildTarget(worldSchemaPort),
    changeOrigin: true,
    rewrite: (p) => p.replace(/^\/world-schema-api/, ''),
  },
  '/atlas-api': {
    target: buildTarget(atlasPort),
    changeOrigin: true,
    rewrite: (p) => p.replace(/^\/atlas-api/, ''),
  },
};

export default defineConfig({
  plugins: [react()],
  define: {
    global: 'globalThis',
  },
  server: {
    port: 5173,
    fs: { strict: true, allow: [r('.')] },
    proxy,
  },
  build: {
    outDir: './dist',
    emptyOutDir: true,
    minify: 'esbuild',
    target: 'es2020',
    sourcemap: false,
    // Drop dev noise and help DCE
    rollupOptions: {
      // Fine-tune Rollup tree-shake
      treeshake: {
        // treat unused imports as side-effect free
        moduleSideEffects: false,
        // allow property reads on pure objects to be removed
        propertyReadSideEffects: false,
        // try harder across modules
        tryCatchDeoptimization: false
      },
      output: {
        // ensure deterministic chunks; helpful when auditing
        manualChunks: undefined
      }
    },
    // Remove dev-only artifacts
    // (esbuild handles minification and DCE of dead branches)
    terserOptions: undefined,
  },
  resolve: {
    alias: {
      '@': r('src'),
      react: r('node_modules/react'),
      'react-dom': r('node_modules/react-dom'),
      'react/jsx-runtime': r('node_modules/react/jsx-runtime.js'),
    },
    dedupe: ['react', 'react-dom'],
    preserveSymlinks: false, // treat linked packages by symlink path, avoid /@fs dupes
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
  },
});
/* eslint-env node */
