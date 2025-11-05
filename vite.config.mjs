import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

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
  root: path.resolve(process.cwd(), "client"),
  plugins: [react()],
  server: {
    port: 5173,
    proxy
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true
  },
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "client/src"),
      react: path.resolve(process.cwd(), "node_modules/react"),
      "react-dom": path.resolve(process.cwd(), "node_modules/react-dom")
    },
    dedupe: ["react", "react-dom"]
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react-dom/client"]
  }
});
