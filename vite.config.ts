import { defineConfig } from "vite";
import dyadComponentTagger from "@dyad-sh/react-vite-component-tagger";
import react from "@vitejs/plugin-react-swc";
import { visualizer } from "rollup-plugin-visualizer";
import path from "path";

export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    dyadComponentTagger(),
    react(),
    // Bundle analyzer — opt-in via ANALYZE=1 so it doesn't add weight to
    // every normal build. Run `ANALYZE=1 pnpm run build` to regenerate
    // dist/bundle-stats.html, then open it in a browser to spot which
    // dependencies are hogging the main bundle. Gzip + brotli sizes
    // included so you can judge real-network cost, not raw bytes.
    process.env.ANALYZE === "1"
      ? visualizer({
          filename: "dist/bundle-stats.html",
          gzipSize: true,
          brotliSize: true,
          template: "treemap",
        })
      : null,
  ].filter(Boolean) as any,
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Inject a build timestamp so the app can compare what it was built
  // with against what's currently being served. The version-check effect
  // (see useVersionCheck) polls the live index.html for a different hash
  // and prompts the user to reload when it sees one — this lets us catch
  // the 'tab open for 8 hours, the user is on an old chunk' case that
  // was making referentes see stale paginated counts.
  define: {
    __BUILD_ID__: JSON.stringify(String(Date.now())),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Keep phone-validation in the main bundle to prevent stale-hash 404s.
        // Vite splits it into its own chunk when used by multiple lazy pages,
        // but the hash changes every time the file is modified — users with
        // an HTTP-cached index.html referencing the old hash get a 404 on load.
        // Split only HEAVY LEAF deps that don't import React at module-load
        // time. The previous attempt also chunked radix/lucide/tanstack and
        // crashed prod with "createContext undefined" because a radix chunk
        // loaded before React. These libs stay in the main bundle.
        manualChunks: (id) => {
          if (id.includes('phone-validation')) return undefined;
          if (id.includes('node_modules/xlsx')) return 'vendor-xlsx';
          if (id.includes('node_modules/papaparse')) return 'vendor-papaparse';
          if (id.includes('node_modules/recharts')) return 'vendor-charts';
          if (id.includes('node_modules/date-fns')) return 'vendor-date';
          return undefined;
        },
      },
    },
    // Disabled in production: with sourcemap: true Vite emits and PUBLISHES
    // a .map for every chunk. We had 52 maps totalling 6.8MB sitting in
    // dist/assets next to 1.9MB of actual JS — bots and devtools requests
    // for those maps were dominating Fast Origin Transfer on Vercel.
    // Crash reporters can still upload maps from a one-off dev build if
    // we ever wire one in; we just stop shipping them on every deploy.
    sourcemap: false,
  },
  base: "/",
}));