import { useEffect, useState } from 'react'
import { signOutCurrentUser, subscribeToAuth, type AuthUser } from './auth/authClient.js'
import DashboardHeader from './components/Header/Header'
import Sidebar from './components/Sidebar/Sidebar'
import styles from './App.module.css'

function App() {
  const [searchValue, setSearchValue] = useState('')
  const [activeView, setActiveView] = useState('Product Launch')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
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
    <div className={styles.dashboard}>
      <Sidebar
        activeView={activeView}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNavigate={setActiveView}
        onProfileClick={() => setProfileMenuOpen((open) => !open)}
        userAvatarUrl={user.photoURL || undefined}
        userName={user.displayName || user.email || 'Collab member'}
        userRole="Active Member"
      />
      <div className={styles.mainContent}>
        <DashboardHeader
          currentView={activeView}
          isSidebarOpen={sidebarOpen}
          onProfileMenuToggle={setProfileMenuOpen}
          onMenuToggle={setSidebarOpen}
          profileMenuOpen={profileMenuOpen}
          onSignOut={() => {
            void signOutCurrentUser().catch((error: unknown) => {
              console.error('Unable to sign out of the dashboard:', error)
              setAuthError('Sign out failed. Please try again.')
            })
          }}
          onSearchChange={setSearchValue}
          searchValue={searchValue}
          userAvatarUrl={user.photoURL || undefined}
          userEmail={user.email || ''}
          userName={user.displayName || user.email || 'Collab member'}
        />
        <main className={styles.content}>
          <p className={styles.eyebrow}>Workspace overview</p>
          <h1>{activeView === 'Workspace' ? 'All Collaboration Tasks' : activeView}</h1>
          <p className={styles.intro}>
            The new dashboard is being built one component at a time. Your existing
            dashboard and landing page remain unchanged.
          </p>
        </main>
      </div>
    </div>
  )
}

export default App
