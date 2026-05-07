import { defineConfig } from "vite";
import dyadComponentTagger from "@dyad-sh/react-vite-component-tagger";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [dyadComponentTagger(), react()],
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