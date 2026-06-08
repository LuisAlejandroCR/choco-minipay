import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: "apps/web",
  publicDir: path.resolve(dirname, "public"),
  plugins: [react()],
  resolve: {
    alias: {
      "@core": path.resolve(dirname, "packages/core/src"),
    },
  },
  build: {
    outDir: path.resolve(dirname, "dist/web"),
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
});
