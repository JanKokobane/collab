import { useEffect, useState } from 'react'
import {
  signOutCurrentUser,
  subscribeToAuth,
  type AuthUser,
} from './auth/authClient.js'
import { DashboardDataProvider, useDashboardData } from './state/DashboardDataContext.js'
import DashboardHeader from './components/Header/Header'
import Sidebar from './components/Sidebar/Sidebar'
import Home from './components/Home/Home'
import styles from './App.module.css'

function App() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    return subscribeToAuth(
      (authenticatedUser) => {
        setUser(authenticatedUser)
        setAuthLoading(false)
        setAuthError('')

        if (!authenticatedUser) {
          const returnUrl = window.location.href
          const authUrl = new URL('/auth/auth.html', window.location.origin)
          authUrl.searchParams.set('return', returnUrl)
          window.location.replace(authUrl.toString())
        }
      },
      (error) => {
        console.error('Unable to check the dashboard sign-in state:', error)
        setAuthError('We could not verify your sign-in. Please reload and try again.')
        setAuthLoading(false)
      },
    )
  }, [])

  if (authLoading) {
    return (
      <main aria-live="polite" className={styles.authState}>
        Checking your sign-in…
      </main>
    )
  }

  if (authError) {
    return (
      <main aria-live="assertive" className={styles.authState}>
        <p>{authError}</p>
        <button onClick={() => window.location.reload()} type="button">
          Try again
        </button>
      </main>
    )
  }

  if (!user) return null

  return (
    <DashboardDataProvider key={user.uid} user={user}>
      <DashboardContent user={user} />
    </DashboardDataProvider>
  )
}

function DashboardContent({ user }: { user: AuthUser }) {
  const [searchValue, setSearchValue] = useState('')
  const [activeView, setActiveView] = useState('Workspace')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [authError, setAuthError] = useState('')
  const dashboard = useDashboardData()

  const profileName = dashboard.profile.data?.name || user.displayName || user.email || 'Collab member'
  const profileRole = dashboard.profile.data?.role || 'Active Member'
  const unreadNotifications = dashboard.notifications.data.filter((notification) => !notification.is_read).length
  const unreadMessages = dashboard.conversations.data.reduce(
    (total, conversation) => total + Math.max(0, Number(conversation.unread_count) || 0),
    0,
  )

  useEffect(() => {
    setActiveView((currentView) =>
      dashboard.projects.data.some((project) => project.name === currentView)
        ? currentView
        : dashboard.projects.data[0]?.name || 'Workspace',
    )
  }, [dashboard.projects.data])

  return (
    <div className={styles.dashboard}>
      <Sidebar
        activeView={activeView}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNavigate={setActiveView}
        onProfileClick={() => setProfileMenuOpen((open) => !open)}
        projects={dashboard.projects.data}
        projectLoadError={dashboard.projects.error || undefined}
        notificationCount={unreadNotifications}
        messageCount={unreadMessages}
        userAvatarUrl={dashboard.profileImage.data || user.photoURL || undefined}
        userName={profileName}
        userRole={profileRole}
      />
      <div className={styles.mainContent}>
        <DashboardHeader
          currentView={activeView}
          isSidebarOpen={sidebarOpen}
          onProfileMenuToggle={setProfileMenuOpen}
          onMenuToggle={setSidebarOpen}
          profileMenuOpen={profileMenuOpen}
          notificationCount={unreadNotifications}
          onSignOut={() => {
            void signOutCurrentUser().catch((error: unknown) => {
              console.error('Unable to sign out of the dashboard:', error)
              setAuthError('Sign out failed. Please try again.')
            })
          }}
          onSearchChange={setSearchValue}
          searchValue={searchValue}
          userAvatarUrl={dashboard.profileImage.data || user.photoURL || undefined}
          userEmail={user.email || ''}
          userName={profileName}
          userRole={profileRole}
        />
        <main className={`${styles.content}${activeView === 'Workspace' ? ` ${styles.workspace}` : ''}`}>
          {authError && <p role="alert">{authError}</p>}
          {activeView === 'Workspace' ? (
            <Home user={user} onNavigate={setActiveView} />
          ) : (
            <>
              <p className={styles.eyebrow}>Workspace overview</p>
              <h1>{activeView}</h1>
              <p className={styles.intro}>This section is next in the React migration.</p>
            </>
          )}
        </main>
      </div>
    </div>
  )
}

export default App
