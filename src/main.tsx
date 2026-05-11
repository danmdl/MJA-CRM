import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import "@/lib/phone-validation"; // force into main bundle — prevents stale-hash 404
import App from "./App.tsx";
import "./globals.css";

if (import.meta.env.PROD) {
  Sentry.init({
    dsn: "https://0d8f0ba2bc11107e93460c799c100dec@o4511371759058944.ingest.us.sentry.io/4511371949309952",
    enabled: true,
  });
}

createRoot(document.getElementById("root")!).render(<App />);
