import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getAvatarSource, useDashboard } from '../../context/DashboardContext';
import { api } from '../../services/api';
import type { Project, ProjectMember, TaskItem, TaskPriority } from '../../types/dashboard';
import { createCx } from '../../utils/cx';
import { toLocalDateKey } from '../../utils/dateUtils';
import styles from './Header.module.css';

const cx = createCx(styles);

export const Header: React.FC = () => {
  const {
    activeView,
    switchView,
    searchQuery,
    setSearchQuery,
    accessibleTasks,
    projects,
    activeProject,
    accessibleMembers,
    currentUser,
    unreadNotificationCount,
    isMobileSidebarOpen,
    setMobileSidebarOpen,
    setActiveModal,
    showDashboardToast,
    isDarkThemeActive,
    toggleDarkLightMode,
    signOutUser
  } = useDashboard();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [aiParsing, setAiParsing] = useState(false);

  const searchWrapRef = useRef<HTMLDivElement>(null);
  const profileWrapRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const avatarSrc = getAvatarSource(currentUser);
  const breadcrumbLabel = activeView === 'Workspace' ? 'All Collaboration Tasks' : activeView;

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (profileWrapRef.current && !profileWrapRef.current.contains(target)) {
        setDropdownOpen(false);
      }
      if (searchWrapRef.current && !searchWrapRef.current.contains(target)) {
        setSearchFocused(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDropdownOpen(false);
        setSearchFocused(false);
      }
    };
    document.addEventListener('click', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('click', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query || /^create task\b/i.test(query)) {
      return null;
    }
    const matchedTasks = accessibleTasks
      .filter((task) =>
        [task.title, task.project, task.description, task.tag, task.status, task.sprint]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(query))
      )
      .slice(0, 5);
    const matchedProjects = projects
      .filter((project) =>
        [project.name, project.projectType, project.description]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(query))
      )
      .slice(0, 5);
    const matchedMembers = accessibleMembers
      .filter((member) =>
        [member.name, member.email, member.role]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(query))
      )
      .slice(0, 5);

    return { matchedTasks, matchedProjects, matchedMembers };
  }, [searchQuery, accessibleTasks, projects, accessibleMembers]);

  const showSearchResults = Boolean(
    searchFocused && searchQuery.trim() && !/^create task\b/i.test(searchQuery.trim())
  );

  const handleSelectTaskResult = (task: TaskItem) => {
    setSearchFocused(false);
    const targetView =
      task.project && projects.some((p) => p.name === task.project) ? task.project : 'My Tasks';
    switchView(targetView);
    window.setTimeout(() => {
      const card = document.querySelector<HTMLElement>(
        `.task-card[data-id="${String(task.id).replace(/"/g, '\\"')}"]`
      );
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('search-result-highlight');
        window.setTimeout(() => card.classList.remove('search-result-highlight'), 1800);
      }
    }, 80);
  };

  const handleSelectProjectResult = (project: Project) => {
    setSearchFocused(false);
    switchView(project.name);
  };

  const handleSelectMemberResult = (_member: ProjectMember) => {
    setSearchFocused(false);
    switchView('Admin Console');
  };

  const handleSearchKeyDown = async (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    const rawQuery = searchQuery.trim();
    if (!/^create task\b/i.test(rawQuery)) return;

    event.preventDefault();
    const promptText = rawQuery.replace(/^create task[:\s-]*/i, '').trim() || rawQuery;
    const targetProject =
      activeProject || projects.find((p) => (p.sprints || []).length > 0) || projects[0];
    if (!targetProject) {
      showDashboardToast('Create or join a project first before creating a task.', 'warning');
      return;
    }

    setAiParsing(true);
    try {
      const res = await api.post('/ai/parse-task', { promptText });
      const parsed = res?.parsed || {};
      const todayKey = toLocalDateKey();
      const rawDue =
        typeof parsed.dueDate === 'string' ? parsed.dueDate.slice(0, 10) : '';
      const validDue =
        /^\d{4}-\d{2}-\d{2}$/.test(rawDue) && rawDue >= todayKey ? rawDue : todayKey;
      const priorityValue = String(parsed.priority || 'medium').toLowerCase();
      const priority: TaskPriority =
        priorityValue === 'high' || priorityValue === 'low' || priorityValue === 'medium'
          ? priorityValue
          : 'medium';

      setActiveModal({
        type: 'createTask',
        projectId: targetProject.projectId,
        prefill: {
          title: typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : promptText,
          description:
            typeof parsed.description === 'string' ? parsed.description.trim() : '',
          priority,
          dueDate: validDue
        }
      });
      setSearchQuery('');
      setSearchFocused(false);
    } catch (error: any) {
      showDashboardToast(
        error?.message || 'Could not parse AI task command. Try again.',
        'error'
      );
    } finally {
      setAiParsing(false);
    }
  };

  return (
    <header className={cx('topbar')}>
      <button
        type="button"
        id="sidebar-menu-toggle"
        className={cx('sidebar-menu-toggle')}
        aria-label="Open navigation menu"
        aria-expanded={isMobileSidebarOpen}
        onClick={(e) => {
          e.stopPropagation();
          setMobileSidebarOpen((prev) => !prev);
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <line x1="4" y1="7" x2="20" y2="7" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="17" x2="20" y2="17" />
        </svg>
      </button>

      <div className={cx('breadcrumbs')}>
        <span>Workspace</span>
        <span>›</span>
        <strong id="breadcrumb-title">{breadcrumbLabel}</strong>
      </div>

      <div className={cx('topbar-center')} ref={searchWrapRef}>
        <label className={cx('search')}>
          <span className={cx('search-icon')}>⌕</span>
          <input
            ref={searchInputRef}
            id="search"
            type="search"
            placeholder='Search or type "create task: [request]"'
            autoComplete="off"
            disabled={aiParsing}
            value={aiParsing ? '🤖 Parsing AI task...' : searchQuery}
            onFocus={() => setSearchFocused(true)}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSearchFocused(true);
            }}
            onKeyDown={handleSearchKeyDown}
          />
        </label>

        <div
          id="dashboard-search-results"
          className={cx('dashboard-search-results')}
          hidden={!showSearchResults}
        >
          {showSearchResults && searchResults && (
            <>
              {searchResults.matchedTasks.length === 0 &&
              searchResults.matchedProjects.length === 0 &&
              searchResults.matchedMembers.length === 0 ? (
                <p className={cx('dashboard-search-empty')}>
                  No tasks, projects, or collaborators match &ldquo;{searchQuery.trim()}&rdquo;.
                </p>
              ) : (
                <>
                  {searchResults.matchedTasks.length > 0 && (
                    <>
                      <div className={cx('dashboard-search-group-title')}>Tasks</div>
                      {searchResults.matchedTasks.map((task) => (
                        <button
                          key={`task-${task.id}`}
                          type="button"
                          className={cx('dashboard-search-result')}
                          onClick={() => handleSelectTaskResult(task)}
                        >
                          <strong>{task.title || 'Untitled task'}</strong>
                          <span>
                            {task.project || 'Workspace'} · {task.status || 'To do'}
                          </span>
                        </button>
                      ))}
                    </>
                  )}
                  {searchResults.matchedProjects.length > 0 && (
                    <>
                      <div className={cx('dashboard-search-group-title')}>Projects</div>
                      {searchResults.matchedProjects.map((project) => (
                        <button
                          key={`project-${project.projectId}`}
                          type="button"
                          className={cx('dashboard-search-result')}
                          onClick={() => handleSelectProjectResult(project)}
                        >
                          <strong>{project.name}</strong>
                          <span>{project.projectType || 'Project'}</span>
                        </button>
                      ))}
                    </>
                  )}
                  {searchResults.matchedMembers.length > 0 && (
                    <>
                      <div className={cx('dashboard-search-group-title')}>Collaborators</div>
                      {searchResults.matchedMembers.map((member) => (
                        <button
                          key={`member-${member.email || member.uid || member.name}`}
                          type="button"
                          className={cx('dashboard-search-result')}
                          onClick={() => handleSelectMemberResult(member)}
                        >
                          <strong>{member.name || member.email || 'Member'}</strong>
                          <span>{member.role || 'Collaborator'}</span>
                        </button>
                      ))}
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      <div className={cx('top-actions')}>
        <button
          id="topbar-notification-btn"
          className={`notification-btn ${cx('topbar-notification-btn')}${
            activeView === 'Notifications' ? ' active' : ''
          }`}
          type="button"
          aria-label="Notifications"
          title="Notifications"
          onClick={() => switchView('Notifications')}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          <span
            id="topbar-notification-badge"
            className="notification-badge"
            hidden={unreadNotificationCount === 0}
          >
            {unreadNotificationCount}
          </span>
        </button>

        <div className={cx('profile-dropdown-wrap')} id="profile-dropdown-wrap" ref={profileWrapRef}>
          <div className={cx('topbar-profile-group')}>
            <button
              className={cx('topbar-avatar-btn')}
              id="signin-user-btn"
              type="button"
              title="Account Profile & Settings"
              aria-haspopup="menu"
              aria-expanded={dropdownOpen}
              onClick={(e) => {
                e.stopPropagation();
                setDropdownOpen((prev) => !prev);
              }}
            >
              {avatarSrc ? (
                <img
                  id="topbar-avatar-circle"
                  src={avatarSrc}
                  alt={currentUser.name || 'User'}
                  className={`${cx('topbar-avatar-circle')} avatar ${currentUser.tone || 'coral'}-bg`}
                  style={{ objectFit: 'cover' }}
                />
              ) : (
                <span
                  className={`${cx('topbar-avatar-circle')} ${currentUser.tone || 'coral'}-bg`}
                  id="topbar-avatar-circle"
                >
                  {currentUser.initials}
                </span>
              )}
            </button>
            <div className={cx('topbar-profile-copy')}>
              <strong id="topbar-user-name">{currentUser.name}</strong>
              <small id="topbar-user-role">{currentUser.role || 'Workspace Member'}</small>
            </div>
          </div>

          <div
            className={cx('profile-dropdown-menu')}
            id="profile-dropdown-menu"
            role="menu"
            hidden={!dropdownOpen}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={cx('profile-dropdown-header')}>
              {avatarSrc ? (
                <img
                  id="dropdown-avatar-circle"
                  src={avatarSrc}
                  alt={currentUser.name || 'User'}
                  className={`${cx('profile-dropdown-avatar')} avatar ${currentUser.tone || 'coral'}-bg`}
                  style={{ objectFit: 'cover' }}
                />
              ) : (
                <div
                  className={`${cx('profile-dropdown-avatar')} ${currentUser.tone || 'coral'}-bg`}
                  id="dropdown-avatar-circle"
                >
                  {currentUser.initials}
                </div>
              )}
              <div className={cx('profile-dropdown-info')}>
                <strong id="dropdown-user-name">{currentUser.name}</strong>
                <span id="dropdown-user-email" className={cx('dropdown-email')}>
                  {currentUser.email}
                </span>
                <span id="dropdown-user-role" className={cx('dropdown-role-badge')}>
                  Role: {currentUser.role || 'Workspace Admin'}
                </span>
              </div>
            </div>

            <div className={cx('profile-dropdown-divider')} />

            <div className={cx('profile-dropdown-actions')}>
              <button
                type="button"
                className={cx('dropdown-item')}
                id="dropdown-profile-settings"
                role="menuitem"
                onClick={() => {
                  setDropdownOpen(false);
                  switchView('Settings');
                }}
              >
                <span className={cx('dropdown-item-icon', 'dropdown-item-icon-large', 'dropdown-item-icon-settings')}>
                  <svg viewBox="0 0 56 56" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M28 50.828c.61 0 1.172-.07 1.805-.117l1.36 2.578c.257.516.773.797 1.405.703c.586-.117 1.008-.539 1.078-1.172l.422-2.836c1.149-.304 2.297-.75 3.422-1.242l2.11 1.899c.445.422 1.007.515 1.593.187c.516-.281.727-.844.61-1.453l-.586-2.812a21.5 21.5 0 0 0 2.789-2.32l2.625 1.1c.586.235 1.125.118 1.57-.421c.399-.422.445-1.031.117-1.547l-1.523-2.437c.703-.985 1.266-2.04 1.805-3.165l2.86.141c.608.023 1.124-.305 1.335-.89c.187-.587 0-1.149-.492-1.524l-2.227-1.781c.305-1.125.54-2.344.633-3.61l2.719-.843c.586-.211.96-.657.96-1.29c0-.609-.374-1.054-.96-1.265l-2.72-.867c-.093-1.266-.327-2.438-.632-3.586l2.226-1.805c.493-.351.68-.89.493-1.476c-.211-.586-.727-.915-1.336-.891l-2.86.117c-.538-1.125-1.1-2.18-1.804-3.164l1.524-2.437c.327-.493.28-1.102-.118-1.524c-.445-.539-.984-.68-1.57-.422l-2.625 1.055a26 26 0 0 0-2.79-2.297l.587-2.789c.117-.633-.094-1.195-.61-1.477c-.586-.304-1.148-.257-1.593.211l-2.11 1.852a27 27 0 0 0-3.422-1.219l-.422-2.836c-.07-.61-.492-1.054-1.078-1.148c-.633-.094-1.148.164-1.406.68l-1.36 2.578c-.632-.047-1.195-.094-1.804-.094c-.633 0-1.195.047-1.852.094l-1.335-2.578c-.258-.516-.774-.774-1.43-.68c-.586.094-.985.539-1.078 1.148l-.399 2.813a28 28 0 0 0-3.422 1.242l-2.109-1.852c-.469-.468-1.031-.515-1.594-.21c-.515.28-.726.843-.61 1.476l.587 2.79a24 24 0 0 0-2.813 2.296l-2.601-1.055c-.586-.258-1.149-.117-1.594.422a1.235 1.235 0 0 0-.117 1.5L9.18 15.04c-.703.984-1.266 2.04-1.805 3.164l-2.883-.117c-.61-.023-1.125.305-1.312.89c-.188.587-.024 1.126.468 1.477l2.25 1.805c-.304 1.148-.562 2.32-.632 3.586l-2.72.867c-.608.187-.937.633-.937 1.266c0 .632.329 1.078.938 1.289l2.719.867c.07 1.242.328 2.46.633 3.586l-2.25 1.78c-.493.375-.657.938-.47 1.523c.188.586.704.914 1.313.891l2.883-.14c.54 1.124 1.102 2.18 1.781 3.163l-1.5 2.438c-.351.516-.304 1.125.094 1.547c.445.539 1.008.656 1.594.422l2.601-1.102c.868.867 1.829 1.64 2.813 2.32l-.586 2.813c-.117.61.094 1.172.61 1.453c.585.328 1.148.234 1.593-.187l2.086-1.899c1.125.492 2.273.938 3.445 1.242l.399 2.836c.093.633.492 1.055 1.078 1.172c.656.094 1.172-.187 1.43-.703l1.335-2.578c.633.047 1.22.117 1.852.117M33.883 26.5c-1.102-2.953-3.258-4.57-5.953-4.57c-.399 0-.867.047-1.617.21l-6.727-11.484C22.094 9.414 24.953 8.734 28 8.734c10.219 0 18.234 7.758 18.961 17.766ZM8.969 28c0-6.516 3.07-12.258 7.922-15.726l6.773 11.554c-1.266 1.313-1.851 2.742-1.851 4.266c0 1.476.562 2.836 1.851 4.195l-6.937 11.344C11.992 40.14 8.969 34.469 8.969 28m16.148.07c0-1.593 1.36-2.836 2.86-2.836c1.593 0 2.906 1.243 2.906 2.836c0 1.57-1.313 2.86-2.906 2.86c-1.5 0-2.86-1.29-2.86-2.86M28 47.266c-3.117 0-6.023-.727-8.578-1.992L26.312 34c.727.188 1.22.234 1.618.234c2.718 0 4.875-1.664 5.953-4.687H46.96c-.75 9.96-8.766 17.719-18.961 17.719"
                    />
                  </svg>
                </span>
                <span>Profile &amp; Workspace Settings</span>
              </button>
              <button
                type="button"
                className={cx('dropdown-item')}
                role="menuitem"
                onClick={() => {
                  toggleDarkLightMode();
                  setDropdownOpen(false);
                }}
              >
                <span className={cx('dropdown-item-icon', 'dropdown-item-icon-large')}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <g
                      fill="none"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                    >
                      <circle cx="12" cy="12" r="4.48" />
                      <path
                        d="M12 4.72V2.7m5.15 4.15l1.42-1.42m.71 6.57h2.02m-4.15 5.15l1.42 1.42m-6.57.71v2.02m-5.15-4.15l-1.42 1.42M4.72 12H2.7m4.15-5.15L5.43 5.43"
                        opacity=".5"
                      />
                    </g>
                  </svg>
                </span>
                <span>{isDarkThemeActive ? 'Switch to Light Mode' : 'Switch to Dark Mode'}</span>
              </button>
            </div>

            <div className={cx('profile-dropdown-divider')} />

            <div className={cx('profile-dropdown-footer')}>
              <button
                type="button"
                className={cx('dropdown-item', 'logout')}
                id="dropdown-signout-btn"
                role="menuitem"
                onClick={async () => {
                  setDropdownOpen(false);
                  await signOutUser();
                }}
              >
                <span className={cx('dropdown-item-icon', 'dropdown-item-icon-large')}>
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M11 3.5a.5.5 0 0 0-.576-.494l-7 1.07A.5.5 0 0 0 3 4.57v10.86a.5.5 0 0 0 .424.494l7 1.071a.5.5 0 0 0 .576-.494V10h5.172l-.997.874a.5.5 0 0 0 .658.752l1.996-1.75a.5.5 0 0 0 0-.752l-1.996-1.75a.499.499 0 1 0-.658.752l.997.874H11zm-2.5 7.75a.75.75 0 1 1 0-1.5a.75.75 0 0 1 0 1.5m4 4.75H12v-5h1v4.5a.5.5 0 0 1-.5.5M12 8V4h.5a.5.5 0 0 1 .5.5V8z"
                    />
                  </svg>
                </span>
                <span>Sign out</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
