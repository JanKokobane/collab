import { useEffect } from 'react'
import logo from '../../../../images/logo.png'
import Icon from '../Icon/Icon'
import styles from './Sidebar.module.css'
import type { Project } from '../../types/dashboard.js'

type SidebarProps = {
  activeView: string
  isOpen: boolean
  userName: string
  userRole: string
  userAvatarUrl?: string
  projects: Project[]
  projectLoadError?: string
  notificationCount: number
  messageCount: number
  onNavigate: (view: string) => void
  onClose: () => void
  onProfileClick: () => void
  onCreateProject?: () => void
}

const primaryItems = [
  { view: 'Workspace', label: 'Home', icon: 'home' as const },
  { view: 'Meetings', label: 'Meetings', icon: 'video' as const },
  { view: 'Messages', label: 'Messages', icon: 'messages' as const },
  { view: 'Brainstorm', label: 'Team Brainstorm', icon: 'team' as const },
  { view: 'Admin Console', label: 'Workspace', icon: 'workspace' as const, id: 'admin-nav-item' },
]

function Sidebar({
  activeView,
  isOpen,
  userName,
  userRole,
  userAvatarUrl,
  projects,
  projectLoadError,
  notificationCount,
  messageCount,
  onNavigate,
  onClose,
  onProfileClick,
  onCreateProject,
}: SidebarProps) {
  const initials = userName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'AM'

  useEffect(() => {
    document.body.classList.toggle('sidebar-open', isOpen)
    return () => document.body.classList.remove('sidebar-open')
  }, [isOpen])

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  const navigate = (view: string) => {
    onNavigate(view)
    onClose()
  }

  return (
    <>
      <aside
        aria-label="Main navigation"
        className={`${styles.sidebar}${isOpen ? ` ${styles.isOpen}` : ''}`}
        id="main-sidebar"
      >
        <a className={styles.brandLink} href="../index.html" title="Back to Collab Home">
          <img alt="Collab." className={styles.brandLogo} src={logo} />
        </a>

        <nav aria-label="Main" className={styles.primaryNav}>
          {primaryItems.map((item) => (
            <button
              aria-current={activeView === item.view ? 'page' : undefined}
              className={`${styles.navItem}${activeView === item.view ? ` ${styles.active}` : ''}`}
              data-view={item.view}
              id={item.id}
              key={item.view}
              onClick={() => navigate(item.view)}
              type="button"
            >
              <Icon className={styles.navIcon} name={item.icon} />
              <span>{item.label}</span>
              {item.view === 'Messages' && (
                <span
                  aria-label={`${messageCount} unread messages`}
                  className={styles.messagesBadge}
                  hidden={messageCount === 0}
                >
                  {messageCount > 99 ? '99+' : messageCount}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className={styles.navLabel}>
          <span>PROJECTS</span>
          <button
            aria-label="Create group project"
            className={styles.tinyPlus}
            onClick={onCreateProject}
            title="Create group project"
            type="button"
          >
            +
          </button>
        </div>

        <nav aria-label="Projects" className={styles.projectNav}>
          {projects.map((project, index) => {
            const color = project.color || ['coral', 'blue', 'green'][index % 3]
            const dotClass = styles[color] || styles.blue
            return (
              <button
                aria-current={activeView === project.name ? 'page' : undefined}
                className={`${styles.navItem} ${styles.project}${activeView === project.name ? ` ${styles.active}` : ''}`}
                data-view={project.name}
                key={project.project_id || project.id || project.name}
                onClick={() => navigate(project.name)}
                type="button"
              >
                <i aria-hidden="true" className={`${styles.dot} ${dotClass}`} />
                <span>{project.name}</span>
              </button>
            )
          })}
          {projectLoadError && <p className={styles.loadError}>{projectLoadError}</p>}
          {!projectLoadError && projects.length === 0 && (
            <p className={styles.emptyProjects}>No projects yet.</p>
          )}
        </nav>

        <div className={styles.sidebarBottom}>
          <button
            aria-current={activeView === 'Settings' ? 'page' : undefined}
            className={`${styles.navItem}${activeView === 'Settings' ? ` ${styles.active}` : ''}`}
            data-view="Settings"
            id="settings-nav-item"
            onClick={() => navigate('Settings')}
            title="Collaboration & Workspace Settings"
            type="button"
          >
            <Icon className={styles.navIcon} name="settings" />
            <span>Settings</span>
          </button>
          <button
            aria-current={activeView === 'Notifications' ? 'page' : undefined}
            aria-label="Notifications"
            className={`${styles.navItem} ${styles.notificationButton}${activeView === 'Notifications' ? ` ${styles.active}` : ''}`}
            data-view="Notifications"
            id="notification-btn"
            onClick={() => navigate('Notifications')}
            title="Open notifications"
            type="button"
          >
            <Icon className={styles.navIcon} name="bell" />
            <span>Notifications</span>
            {notificationCount > 0 && (
              <span className={styles.notificationBadge} id="notification-badge">
                {notificationCount > 99 ? '99+' : notificationCount}
              </span>
            )}
          </button>
          <button
            className={styles.profile}
            id="user-profile"
            onClick={onProfileClick}
            title="Account settings & logout"
            type="button"
          >
            <div className={`${styles.avatar} ${styles.coralBg}`} id="sidebar-avatar">
              {userAvatarUrl ? <img alt={userName} src={userAvatarUrl} /> : initials}
            </div>
            <div className={styles.profileCopy}>
              <strong id="sidebar-name">{userName}</strong>
              <small id="sidebar-role">{userRole}</small>
            </div>
          </button>
        </div>
      </aside>
      <button
        aria-label="Close navigation menu"
        className={`${styles.backdrop}${isOpen ? ` ${styles.backdropVisible}` : ''}`}
        onClick={onClose}
        tabIndex={isOpen ? 0 : -1}
        type="button"
      />
    </>
  )
}

export default Sidebar
