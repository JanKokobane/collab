import { createRoot } from "react-dom/client";
import { App } from "./App";

// Keep /auth compatible with the original Firebase page; it owns sign-in and sessions.
if (window.location.pathname === "/auth" || window.location.pathname === "/auth/") {
  window.location.replace(`/legacy/auth/auth.html${window.location.search || "?return=/dashboard"}`);
} else {
  const root = document.getElementById("root");
  if (!root) throw new Error("Dashboard root element is missing");
  // The dashboard boots native module scripts once, so do not double-mount it.
  createRoot(root).render(<App />);
}
