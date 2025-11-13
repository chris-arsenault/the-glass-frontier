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
const promptPort = Number(process.env.PROMPT_API_PORT ?? 7400);
const locationPort = Number(process.env.LOCATION_API_PORT ?? 7300);

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
  '/location': {
    target: buildTarget(locationPort),
    changeOrigin: true,
    rewrite: (p) => p.replace(/^\/location/, ''),
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
