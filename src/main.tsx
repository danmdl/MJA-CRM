import { createRoot } from "react-dom/client";
import "@/lib/phone-validation"; // force into main bundle — prevents stale-hash 404
import App from "./App.tsx";
import "./globals.css";

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
