import { useEffect } from "react";
import { Sidebar } from "./components/Sidebar/Sidebar";
import { Header } from "./components/Header/Header";
import { Home } from "./components/Home/Home";
import { Messages } from "./components/Messages/Messages";
import { Notifications } from "./components/Notifications/Notifications";
import { Brainstorm } from "./components/Brainstorm/Brainstorm";
import { Workspace } from "./components/Workspace/Workspace";
import { Calendar } from "./components/Calendar/Calendar";
import { Meetings } from "./components/Meetings/Meetings";
import { Team } from "./components/Team/Team";
import { Settings } from "./components/Settings/Settings";

// Original entry script (Firebase auth, Render API calls, view switching, modals).
const LEGACY_ENTRY = "/legacy/dashboard/dashboard.js?v=20261121-task-sprint-decoupling";

declare global {
  interface Window { __collabDashboardBooted?: boolean; __collabDashboardRoot?: HTMLElement | null }
}

export function App() {
  useEffect(() => {
    // The original scripts are ES modules that run once per page load and bind to these
    // elements. Boot after the tree settles; if we come back to a fresh tree after they
    // already ran, reload so they bind again.
    const timer = window.setTimeout(() => {
      const root = document.getElementById("app");
      if (window.__collabDashboardBooted) {
        if (window.__collabDashboardRoot !== root) window.location.reload();
        return;
      }
      window.__collabDashboardBooted = true;
      window.__collabDashboardRoot = root;
      // Loaded as a native module script, exactly like the original page did.
      const script = document.createElement("script");
      script.type = "module";
      script.src = LEGACY_ENTRY;
      script.onerror = () => console.error("Collab dashboard scripts failed to load");
      document.body.appendChild(script);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <>
      <div id="app" className="app-shell">
        <Sidebar />
        <main className="main-content">
          <Header />
          <div id="project-sticky-note-layer" className="project-sticky-note-layer" aria-label="Project sticky notes" hidden />
          <section className="workspace">
            <Home />
            <Messages />
            <Notifications />
            <Brainstorm />
            <Workspace />
            <Calendar />
            <Meetings />
            <Team />
            <Settings />
          </section>
        </main>
        <div id="modal-root" />
      </div>
      <div id="messages-call-root" className="collab-call-portal" hidden aria-live="polite" />
    </>
  );
}
