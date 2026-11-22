import React from 'react';
import styles from './App.module.css';
import { Brainstorm } from './components/Brainstorm';
import { CallOverlay } from './components/CallOverlay';
import { Header } from './components/Header';
import { Home } from './components/Home';
import { MeetingModal } from './components/MeetingModal';
import { Meetings } from './components/Meetings';
import { Messages } from './components/Messages';
import { Modals } from './components/Modals';
import { Notifications } from './components/Notifications';
import { ProjectBoard } from './components/ProjectBoard';
import { ProjectProgressAside } from './components/ProjectProgressAside';
import { ProjectStickyNotes } from './components/ProjectStickyNotes';
import { Settings } from './components/Settings';
import { Sidebar } from './components/Sidebar';
import { WorkspaceConsole } from './components/WorkspaceConsole';
import { DashboardProvider, useDashboard } from './context/DashboardContext';
import { MessagesCallProvider } from './context/MessagesCallContext';
import { createClassNames } from './utils/cx';

const cx = createClassNames(styles);

const DashboardShell: React.FC = () => {
  const {
    activeView,
    isMobileSidebarOpen,
    setMobileSidebarOpen,
    asideTaskId,
    projects
  } = useDashboard();

  const isMessagesView = activeView === 'Messages';
  const showStickyNotes =
    activeView === 'My Tasks' ||
    projects.some((p) => p.name === activeView || p.projectId === activeView);

  const renderActiveView = () => {
    switch (activeView) {
      case 'Workspace':
      case 'Overview':
        return <Home />;
      case 'Meetings':
      case 'Calendar':
        return <Meetings />;
      case 'Messages':
        return <Messages />;
      case 'Brainstorm':
        return <Brainstorm />;
      case 'Admin Console':
        return <WorkspaceConsole />;
      case 'Settings':
        return <Settings />;
      case 'Notifications':
        return <Notifications />;
      case 'My Tasks':
      default:
        return <ProjectBoard />;
    }
  };

  return (
    <div className={cx('app-shell')}>
      <Sidebar />

      <button
        type="button"
        className={cx('sidebar-backdrop', isMobileSidebarOpen && 'is-visible')}
        aria-label="Close navigation sidebar"
        onClick={() => setMobileSidebarOpen(false)}
      />

      <div className={cx('main-content', isMessagesView && 'messages-view-active')}>
        <Header />

        <main className={cx('workspace', isMessagesView && 'messages-active')}>
          {isMessagesView ? (
            <Messages />
          ) : (
            <div className={cx('workspace-split-layout')}>
              <div className={cx('workspace-main-panel')}>
                {renderActiveView()}
              </div>
            </div>
          )}

          {showStickyNotes && <ProjectStickyNotes />}
          {asideTaskId !== null && <ProjectProgressAside />}
        </main>
      </div>

      <CallOverlay />
      <MeetingModal />
      <Modals />
    </div>
  );
};

export const App: React.FC = () => (
  <DashboardProvider>
    <MessagesCallProvider>
      <DashboardShell />
    </MessagesCallProvider>
  </DashboardProvider>
);

export default App;
