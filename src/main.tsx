import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./globals.css";

// DEV-ONLY: Debug React.Children.only calls
if (process.env.NODE_ENV !== 'production') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const React = require('react');
  const origOnly = React.Children.only;
  React.Children.only = function(children) {
    const count = React.Children.count(children);
    if (count !== 1) {
      console.error('React.Children.only called with', count, 'children:', children);
      console.trace(); // will show source-mapped stack frames
      // Also show component stack
      console.error('Component stack:', new Error().stack);
    }
    return origOnly(children);
  };
}

createRoot(document.getElementById("root")!).render(<App />);