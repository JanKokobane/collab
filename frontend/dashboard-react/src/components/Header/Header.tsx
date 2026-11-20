import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import styles from './Header.module.css'

export type DashboardHeaderProps = {
  currentView?: string
  notificationCount?: number
  userName?: string
  userRole?: string
  userEmail?: string
  userInitials?: string
  userAvatarUrl?: string
  isSidebarOpen?: boolean
  profileMenuOpen?: boolean
  searchValue?: string
  onMenuToggle?: (isOpen: boolean) => void
  onProfileMenuToggle?: (isOpen: boolean) => void
  onSearchChange?: (value: string) => void
  onNotificationsClick?: () => void
  onSettingsClick?: () => void
  onSignOut?: () => void
}

function DashboardHeader({
  currentView = 'Workspace',
  notificationCount = 0,
  userName = '',
  userRole = 'Active Member',
  userEmail = '',
  userInitials,
  userAvatarUrl,
  isSidebarOpen,
  profileMenuOpen: controlledProfileMenuOpen,
  searchValue,
  onMenuToggle,
  onProfileMenuToggle,
  onSearchChange,
  onNotificationsClick,
  onSettingsClick,
  onSignOut,
}: DashboardHeaderProps) {
  const [internalProfileMenuOpen, setInternalProfileMenuOpen] = useState(false)
  const [internalSidebarOpen, setInternalSidebarOpen] = useState(false)
  const profileDropdownOpen = controlledProfileMenuOpen ?? internalProfileMenuOpen
  const sidebarOpen = isSidebarOpen ?? internalSidebarOpen
  const profileDropdownWrap = useRef<HTMLDivElement>(null)
  const initials = userInitials || userName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'AM'

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target as Node
      const sidebarProfile = document.querySelector('#user-profile')
      if (!profileDropdownWrap.current?.contains(target) && !sidebarProfile?.contains(target)) {
        updateProfileMenu(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        updateProfileMenu(false)
        if (sidebarOpen) {
          setInternalSidebarOpen(false)
          onMenuToggle?.(false)
        }
      }
    }

    document.addEventListener('click', handleDocumentClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('click', handleDocumentClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onMenuToggle, onProfileMenuToggle, sidebarOpen])

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    onSearchChange?.(event.target.value)
  }

  const toggleSidebar = () => {
    const nextState = !sidebarOpen
    setInternalSidebarOpen(nextState)
    onMenuToggle?.(nextState)
  }

  const toggleProfileDropdown = () => {
    updateProfileMenu(!profileDropdownOpen)
  }

  const updateProfileMenu = (isOpen: boolean) => {
    if (controlledProfileMenuOpen === undefined) {
      setInternalProfileMenuOpen(isOpen)
    }
    onProfileMenuToggle?.(isOpen)
  }

  return (
    <div className={styles.headerScope}>
      <header className="topbar">
        <button
          aria-controls="main-sidebar"
          aria-expanded={sidebarOpen}
          aria-label="Open navigation menu"
          className="sidebar-menu-toggle"
          id="sidebar-menu-toggle"
          onClick={toggleSidebar}
          title="Open navigation menu"
          type="button"
        >
          <svg
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="18" x2="20" y2="18" />
          </svg>
        </button>

        <div className="breadcrumbs">
          <span>Workspace</span>
          <span>›</span>
          <strong id="breadcrumb-title">{currentView}</strong>
        </div>

        <div className="topbar-center">
          <label className="search">
            <svg
              className="search-icon-svg"
              fill="none"
              height="15"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.5"
              viewBox="0 0 24 24"
              width="15"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              id="search"
              onChange={handleSearchChange}
              value={searchValue || ''}
              placeholder="Search tasks, projects, or team members..."
            />
          </label>
        </div>

        <div className="top-actions">
          <button
            aria-label="Notifications"
            className="notification-btn topbar-notification-btn"
            data-view="Notifications"
            id="topbar-notification-btn"
            onClick={onNotificationsClick}
            title="Open notifications"
            type="button"
          >
            <svg
              aria-hidden="true"
              className="nav-icon"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M10 21h4" />
            </svg>
            <span className="notification-badge" id="topbar-notification-badge">
              {notificationCount}
            </span>
          </button>

          <div
            className="profile-dropdown-wrap"
            id="profile-dropdown-wrap"
            ref={profileDropdownWrap}
          >
            <div className="topbar-profile-group">
              <button
                aria-expanded={profileDropdownOpen}
                aria-label="Account Settings"
                className={`topbar-avatar-btn${profileDropdownOpen ? ' active' : ''}`}
                id="signin-user-btn"
                onClick={toggleProfileDropdown}
                title={`${userName} (${userRole}) — Account Settings`}
                type="button"
              >
                <div className="avatar coral-bg topbar-avatar-circle" id="topbar-avatar-initials">
                  {userAvatarUrl ? (
                    <img alt={userName} src={userAvatarUrl} />
                  ) : initials}
                </div>
              </button>
              <div className="topbar-profile-copy">
                <strong id="topbar-profile-name">{userName}</strong>
                <small id="topbar-profile-role">{userRole}</small>
              </div>
            </div>

            <div
              aria-hidden={!profileDropdownOpen}
              className="profile-dropdown-menu"
              id="profile-dropdown-menu"
              style={{ display: profileDropdownOpen ? 'flex' : 'none' }}
            >
              <div className="profile-dropdown-header">
                <div className="avatar coral-bg profile-dropdown-avatar" id="dropdown-avatar">
                  {userAvatarUrl ? (
                    <img alt={userName} src={userAvatarUrl} />
                  ) : initials}
                </div>
                <div className="profile-dropdown-info">
                  <strong id="dropdown-name">{userName}</strong>
                  <span className="dropdown-email" id="dropdown-email">{userEmail}</span>
                  <span className="dropdown-role-badge" id="dropdown-role">
                    Role: {userRole}
                  </span>
                </div>
              </div>

              <div className="profile-dropdown-divider" />

              <div className="profile-dropdown-actions">
                <button
                  className="dropdown-item"
                  id="dropdown-settings-btn"
                  onClick={() => {
                    updateProfileMenu(false)
                    onSettingsClick?.()
                  }}
                  type="button"
                >
                  <span className="dropdown-item-icon">
                    <svg
                      fill="none"
                      height="15"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                      width="15"
                    >
                      <circle cx="12" cy="12" r="3" />
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                    </svg>
                  </span>
                  <span>Profile &amp; Workspace Settings</span>
                </button>
              </div>

              <div className="profile-dropdown-divider" />

              <div className="profile-dropdown-footer">
                <button
                  className="dropdown-item logout"
                  id="dropdown-logout-btn"
                  onClick={() => {
                    updateProfileMenu(false)
                    onSignOut?.()
                  }}
                  type="button"
                >
                  <span className="dropdown-item-icon">→</span>
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>
    </div>
  )
}

export default DashboardHeader
