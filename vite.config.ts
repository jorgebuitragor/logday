import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { visualizer } from "rollup-plugin-visualizer";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    // `pnpm run build:analyze` — treemap del bundle de producción, no se
    // activa en el build normal para no añadir overhead ni abrir el
    // reporte sin pedirlo.
    mode === "analyze" &&
      visualizer({
        filename: "dist/bundle-report.html",
        open: true,
        gzipSize: true,
        template: "treemap",
      }),
  ],
  define: {
    global: 'globalThis',
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
