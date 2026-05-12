import { createRoot } from "react-dom/client";
import "@/lib/phone-validation"; // force into main bundle — prevents stale-hash 404
import App from "./App.tsx";
import "./globals.css";

// Catch 404 / network failures on lazy chunk script tags BEFORE they
// bubble into a React error. When a deploy happens while a tab is open,
// the running JS still references the old /assets/*.js hashes; the new
// deploy's CDN has different hashes, so every dynamic import 404s. React
// only sees this as a Promise rejection a few cycles later, so a global
// listener gives us the earliest possible signal. Setting the URL to
// /reset wipes service workers + caches + localStorage and bounces to
// /login — the only reliable way out of a stale-bundle state.
let recoveringFromStaleBundle = false;
const goToReset = () => {
  if (recoveringFromStaleBundle) return;
  recoveringFromStaleBundle = true;
  window.location.href = '/reset?_v=' + Date.now();
};
window.addEventListener('error', (ev) => {
  // Script tag failed to load (404, network error, blocked by CSP, etc).
  // `target` is the failing <script> element; its `src` confirms the
  // request was for one of our hashed asset URLs.
  const tgt = ev.target as HTMLElement | null;
  if (tgt && tgt.tagName === 'SCRIPT') {
    const src = (tgt as HTMLScriptElement).src || '';
    if (src.includes('/assets/')) goToReset();
  }
}, true);
window.addEventListener('unhandledrejection', (ev) => {
  // Vite's dynamic import() rejects with TypeError when the chunk URL
  // doesn't load; the message in modern browsers is one of:
  //   "Failed to fetch dynamically imported module"
  //   "error loading dynamically imported module"
  //   "Importing a module script failed."
  const msg = String((ev.reason && (ev.reason.message || ev.reason)) || '');
  if (
    msg.includes('dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('Failed to fetch')
  ) {
    goToReset();
  }
});

// Sentry: dynamic import so the ~80KB SDK lands in its own chunk that
// loads AFTER the main bundle has parsed. Same DSN/config as before,
// just decoupled from cold-start time. Errors that happen in the first
// ~100ms before Sentry attaches are still caught by ChunkErrorBoundary
// and our client_logs writer (auth-logger), so coverage stays intact.
if (import.meta.env.PROD) {
  import("@sentry/react").then(({ init }) => {
    init({
      dsn: "https://0d8f0ba2bc11107e93460c799c100dec@o4511371759058944.ingest.us.sentry.io/4511371949309952",
      enabled: true,
    });
  }).catch(() => { /* Sentry load failure shouldn't crash the app */ });
}

createRoot(document.getElementById("root")!).render(<App />);
