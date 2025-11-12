/* eslint-env node */
/* global process */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const r = (p) => path.resolve(process.cwd(), p);

const apiTarget = process.env.VITE_API_TARGET || 'http://localhost:7000';

const proxyRoutes = ['/trpc'];

const proxy = Object.fromEntries(
  proxyRoutes.map((route) => [
    route,
    {
      target: apiTarget,
      changeOrigin: true,
      rewrite: (p) => p.replace(/^\/trpc/, ''),
    },
  ])
);

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
