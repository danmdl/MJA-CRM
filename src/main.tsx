import { createRoot } from "react-dom/client";
import "@/lib/phone-validation"; // force into main bundle — prevents stale-hash 404
import App from "./App.tsx";
import "./globals.css";

createRoot(document.getElementById("root")!).render(<App />);
