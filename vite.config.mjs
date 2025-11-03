import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: path.resolve(process.cwd(), "client"),
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/sessions": {
        target: "http://localhost:3000",
        changeOrigin: true
      },
      "/ws": {
        target: "ws://localhost:3000",
        ws: true
      }
    }
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true
  },
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "client/src")
    }
  }
});

