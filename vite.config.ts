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
        // loaded before React. Now we still keep React + react-dom +
        // scheduler in the main bundle so they're guaranteed available
        // before any chunk that uses createContext executes. Vite/Rollup
        // emits <link rel="modulepreload"> for declared chunk deps so the
        // browser parallel-fetches them in the right order.
        manualChunks: (id) => {
          if (id.includes('phone-validation')) return undefined;
          // React + react-dom + scheduler MUST share one chunk that any
          // React-using vendor chunk (radix, etc) imports from. Without
          // this, Rollup sees that vendor-radix is the only "manual"
          // chunk consuming react and hoists react into vendor-radix.
          // Main bundle then imports its own copy from node_modules,
          // leaving the app with two React instances → createContext
          // returns different objects → Provider/Consumer mismatch
          // → the "createContext is undefined" / blank-screen crash we
          // saw on the previous attempt. Naming this chunk first also
          // means Rollup writes its modulepreload before vendor-radix
          // in index.html.
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/scheduler/')
          ) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/xlsx')) return 'vendor-xlsx';
          if (id.includes('node_modules/papaparse')) return 'vendor-papaparse';
          if (id.includes('node_modules/recharts')) return 'vendor-charts';
          if (id.includes('node_modules/date-fns')) return 'vendor-date';
          // Radix is 35+ small packages, all in the "uses createContext
          // on import" tier. They share one chunk + depend on vendor-react.
          if (id.includes('node_modules/@radix-ui')) return 'vendor-radix';
          // Sentry is dynamically imported in main.tsx, but isolate
          // anything @sentry-namespaced regardless of how it gets reached.
          if (id.includes('node_modules/@sentry') || id.includes('node_modules/@sentry-internal')) {
            return 'vendor-sentry';
          }
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