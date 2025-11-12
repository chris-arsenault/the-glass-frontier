import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const r = p => path.resolve(process.cwd(), p)

const apiTarget = process.env.VITE_API_TARGET || "http://localhost:7000";
const wsTarget = apiTarget.replace(/^http/, "ws");

const proxyRoutes = [
  "/auth",
  "/accounts",
  "/sessions",
  "/admin",
  "/offline",
  "/debug"
];

const proxy = Object.fromEntries(
  proxyRoutes.map((route) => [
    route,
    {
      target: apiTarget,
      changeOrigin: true
    }
  ])
);

proxy["/ws"] = {
  target: wsTarget,
  ws: true,
  changeOrigin: true
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    fs: { strict: true, allow: [r('.')] },
    proxy
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true
  },
  resolve: {
    alias: {
      '@': r('src'),
      react: r('node_modules/react'),
      'react-dom': r('node_modules/react-dom'),
      'react/jsx-runtime': r('node_modules/react/jsx-runtime.js')
    },
    dedupe: ["react", "react-dom"],
    preserveSymlinks: false  // treat linked packages by symlink path, avoid /@fs dupes
  },
  optimizeDeps: {
    include: ["react", "react-dom"]
  }
});
