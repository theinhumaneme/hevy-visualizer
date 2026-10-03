import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Static build for Cloudflare Pages: `npm run build` → dist/
export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist", sourcemap: false, chunkSizeWarningLimit: 900 },
  server: { port: 5173 },
});
