import React, { useEffect, useMemo, useState } from 'react';
import {
  getUserInitials,
  normalizeResourceRecord,
  useDashboard
} from '../../context/DashboardContext';
import { api } from '../../services/api';
import { firebaseAuth } from '../../services/firebase';
import type {
  MediaAttachment,
  Project,
  ProjectSprint,
  TaskItem,
  TaskPriority,
  TaskStatus
} from '../../types/dashboard';
import { createCx } from '../../utils/cx';
import {
  addDaysToDateKey,
  formatRelativeDate,
  getDateDayOffset,
  getEarliestDateTimeInput,
  normalizeDateKey,
  notBeforeTodayDateKey,
  parseLocalDate,
  toLocalDateKey
} from '../../utils/dateUtils';
import { TaskMediaEditor } from '../TaskMediaEditor';
import styles from './Modals.module.css';

const cx = createCx(styles);

const COLLABORATION_TYPES = [
  'Software development',
  'Web development',
  'App development',
  'UI/UX design',
  'Graphic design',
  'Product collaboration',
  'Marketing campaign',
  'Digital marketing',
  'Social media marketing',
  'Content creation',
  'Content strategy',
  'Influencer campaign',
  'Brand partnership',
  'Event partnership',
  'Event planning',
  'Photography',
  'Videography',
  'Video production',
  'Copywriting',
  'Public relations',
  'Advertising',
  'Sales partnership',
  'Business development',
  'Research project',
  'Consulting',
  'Startup collaboration',
  'Community project',
  'Education and training',
  'Music and entertainment',
  'Fashion collaboration',
  'Creative project',
  'Nonprofit / social impact',
  'Other'
];

const PROJECT_COLORS = [
  { value: 'red', label: 'Red', color: '#EF4444' },
  { value: 'blue', label: 'Blue', color: '#3B82F6' },
  { value: 'yellow', label: 'Yellow', color: '#EAB308' },
  { value: 'green', label: 'Green', color: '#22C55E' },
  { value: 'orange', label: 'Orange', color: '#F97316' },
  { value: 'purple', label: 'Purple', color: '#8B5CF6' },
  { value: 'pink', label: 'Pink', color: '#EC4899' },
  { value: 'brown', label: 'Brown', color: '#92400E' },
  { value: 'black', label: 'Black', color: '#111827' },
  { value: 'white', label: 'White', color: '#F8FAFC' },
  { value: 'gray', label: 'Gray', color: '#6B7280' },
  { value: 'violet', label: 'Violet', color: '#7C3AED' },
  { value: 'indigo', label: 'Indigo', color: '#6366F1' },
  { value: 'magenta', label: 'Magenta', color: '#D946EF' },
  { value: 'turquoise', label: 'Turquoise', color: '#14B8A6' },
  { value: 'cyan', label: 'Cyan', color: '#06B6D4' },
  { value: 'teal', label: 'Teal', color: '#0F766E' },
  { value: 'maroon', label: 'Maroon', color: '#7F1D1D' },
  { value: 'beige', label: 'Beige', color: '#D6C3A5' },
  { value: 'burgundy', label: 'Burgundy', color: '#800020' },
  { value: 'lavender', label: 'Lavender', color: '#A78BFA' },
  { value: 'peach', label: 'Peach', color: '#FDBA74' },
  { value: 'lime', label: 'Lime', color: '#84CC16' },
  { value: 'olive', label: 'Olive', color: '#808000' },
  { value: 'coral', label: 'Coral', color: '#E07A5F' },
  { value: 'gold', label: 'Gold', color: '#D97706' },
  { value: 'silver', label: 'Silver', color: '#A3A3A3' },
  { value: 'bronze', label: 'Bronze', color: '#CD7F32' },
  { value: 'amber', label: 'Amber', color: '#F59E0B' },
  { value: 'aqua', label: 'Aqua', color: '#22D3EE' },
  { value: 'navy', label: 'Navy', color: '#1E3A8A' },
  { value: 'mint', label: 'Mint', color: '#10B981' },
  { value: 'charcoal', label: 'Charcoal', color: '#374151' },
  { value: 'crimson', label: 'Crimson', color: '#DC143C' },
  { value: 'fuchsia', label: 'Fuchsia', color: '#E879F9' },
  { value: 'khaki', label: 'Khaki', color: '#C3B091' },
  { value: 'salmon', label: 'Salmon', color: '#FA8072' },
  { value: 'ivory', label: 'Ivory', color: '#FFFFF0' },
  { value: 'saffron', label: 'Saffron', color: '#F4C430' },
  { value: 'mustard', label: 'Mustard', color: '#D4A017' },
  { value: 'rose', label: 'Rose', color: '#E11D48' }
];

const RESOURCE_CATEGORIES = [
  'Design',
  'Engineering',
  'Product',
  'Testing',
  'Meetings',
  'Analytics',
  'Documentation',
  'Research',
  'Marketing',
  'Sales',
  'Customer Support',
  'Operations',
  'Finance',
  'Legal',
  'Human Resources',
  'Recruiting',
  'Strategy',
  'Planning',
  'Roadmaps',
  'Requirements',
  'Specifications',
  'Architecture',
  'APIs & Integrations',
  'Code Repositories',
  'DevOps',
  'Cybersecurity',
  'Data Science',
  'Databases',
  'Infrastructure',
  'Deployment',
  'Monitoring',
  'Incident Response',
  'Quality Assurance',
  'Bug Tracking',
  'User Experience',
  'Prototyping',
  'Branding',
  'Content',
  'SEO',
  'Social Media',
  'Campaigns',
  'Competitor Analysis',
  'Training',
  'Onboarding',
  'Policies',
  'Contracts',
  'Vendor Management',
  'Reports',
  'Presentations',
  'Other'
];

const INVITATION_ROLE_GROUPS = [
  {
    label: 'General',
    roles: [
      'Workspace Admin',
      'Product Lead',
      'Designer',
      'Engineer',
      'QA Specialist',
      'Content Strategist',
      'Member'
    ]
  },
  {
    label: 'Project & delivery',
    roles: [
      'Project Manager',
      'Program Manager',
      'Scrum Master',
      'Agile Coach',
      'Product Owner',
      'Delivery Manager',
      'Release Manager'
    ]
  },
  {
    label: 'Analysis & data',
    roles: [
      'Business Analyst',
      'Systems Analyst',
      'Data Analyst',
      'Data Scientist',
      'Machine Learning Engineer',
      'Researcher'
    ]
  },
  {
    label: 'Engineering & quality',
    roles: [
      'DevOps Engineer',
      'Site Reliability Engineer',
      'Security Engineer',
      'QA Lead',
      'Test Automation Engineer',
      'Frontend Developer',
      'Backend Developer',
      'Full-Stack Developer',
      'Mobile Developer',
      'API Developer',
      'Database Administrator'
    ]
  },
  {
    label: 'Design & research',
    roles: [
      'UX Researcher',
      'UX Writer',
      'UI Designer',
      'Product Designer',
      'Visual Designer',
      'Brand Designer',
      'Motion Designer'
    ]
  },
  {
    label: 'Content & marketing',
    roles: [
      'Technical Writer',
      'Documentation Specialist',
      'Content Writer',
      'Copywriter',
      'Editor',
      'SEO Specialist',
      'Marketing Manager',
      'Growth Marketer',
      'Social Media Manager',
      'Community Manager'
    ]
  },
  {
    label: 'Business & operations',
    roles: [
      'Customer Success Manager',
      'Support Specialist',
      'Sales Lead',
      'Operations Manager',
      'Finance Manager',
      'HR Manager',
      'Legal Advisor',
      'Stakeholder',
      'Business Owner'
    ]
  }
];

const TASK_TAG_OPTIONS = [
  'Design',
  'Development',
  'Marketing',
  'Product',
  'Research',
  'QA',
  'Bug',
  'Feature',
  'Documentation',
  'Urgent',
  'Backend',
  'Frontend',
  'UI/UX',
  'DevOps',
  'Security',
  'Performance',
  'Analytics',
  'Testing',
  'Planning',
  'Content'
];

function formatDurationInMonths(weeks: number): string {
  if (weeks < 4) return 'Less than 1 Month';
  const months = Math.round(weeks / 4);
  return `${months} ${months === 1 ? 'Month' : 'Months'}`;
}

function getSafeMeetingUrl(value?: string | null): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw, window.location.origin);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
    return null;
  } catch {
    return null;
  }
}

function getMeetingProjectMembers(project?: Project | null) {
  if (!project) return [];
  const rawMembers = [
    {
      firebaseUid: project.creatorFirebaseUid || '',
      name: project.creatorName,
      email: project.creatorEmail,
      initials: project.creatorInitials,
      profileImage: project.creatorProfileImage
    },
    ...(project.acceptedMembers || []).map((m) => ({
      firebaseUid: String(m.firebaseUid || m.firebase_uid || m.uid || ''),
      name: m.name || m.displayName || m.email || 'Project member',
      email: m.email || '',
      initials: m.initials || getUserInitials(m.name || m.email || ''),
      profileImage: m.profileImage || m.profile_image || ''
    }))
  ];
  const unique = new Map<string, (typeof rawMembers)[number]>();
  rawMembers
    .filter((m) => m.firebaseUid)
    .forEach((m) => {
      unique.set(m.firebaseUid, m);
    });
  return [...unique.values()];
}

function prepareInvitationAvatar(source?: string | null): Promise<string> {
  const value = String(source || '').trim();
  if (!value) return Promise.resolve('');
  if (value.startsWith('https://')) {
    return Promise.resolve(value.length <= 2048 ? value : '');
  }
  if (!/^data:image\/(?:jpeg|png|webp|gif);base64,/.test(value)) {
    return Promise.resolve('');
  }
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const size = 256;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');
      if (!context) {
        resolve('');
        return;
      }
      const scale = Math.max(size / image.width, size / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.75));
    };
    image.onerror = () => resolve('');
    image.src = value;
  });
}

// Dual date range calendar used in Create Project & Task Schedule
const DualDateRangeCalendars: React.FC<{
  startDate: string;
  dueDate: string;
  minDate: string;
  maxDate?: string | null;
  startLabel?: string;
  endLabel?: string;
  onChangeStart: (key: string) => void;
  onChangeDue: (key: string) => void;
}> = ({
  startDate,
  dueDate,
  minDate,
  maxDate = null,
  startLabel = 'Start Date',
  endLabel = 'Due Date',
  onChangeStart,
  onChangeDue
}) => {
  const todayKey = toLocalDateKey();
  const minDateObj = parseLocalDate(minDate);
  const firstMonth = new Date(minDateObj.getFullYear(), minDateObj.getMonth(), 1);
  const maxDateObj = maxDate ? parseLocalDate(maxDate) : null;
  const maxMonth = maxDateObj ? new Date(maxDateObj.getFullYear(), maxDateObj.getMonth(), 1) : null;

  const [startMonthDate, setStartMonthDate] = useState<Date>(() => {
    const d = startDate ? parseLocalDate(startDate) : minDateObj;
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [dueMonthDate, setDueMonthDate] = useState<Date>(() => {
    const d = dueDate ? parseLocalDate(dueDate) : new Date(firstMonth.getFullYear(), firstMonth.getMonth() + 1, 1);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const panels = [
    {
      key: 'start' as const,
      label: startLabel,
      monthDate: startMonthDate,
      setMonthDate: setStartMonthDate,
      selectedKey: startDate
    },
    {
      key: 'due' as const,
      label: endLabel,
      monthDate: dueMonthDate,
      setMonthDate: setDueMonthDate,
      selectedKey: dueDate
    }
  ];

  return (
    <div className="project-time-span-calendar-grid">
      {panels.map((panel) => {
        const year = panel.monthDate.getFullYear();
        const monthIndex = panel.monthDate.getMonth();
        const monthStart = new Date(year, monthIndex, 1);
        const firstWeekday = (monthStart.getDay() + 6) % 7;
        const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
        const prevDisabled = monthStart <= firstMonth;
        const nextDisabled = Boolean(maxMonth && monthStart >= maxMonth);

        return (
          <section key={panel.key} className="project-time-span-calendar">
            <h4 className="project-time-span-calendar-heading">{panel.label}</h4>
            <div className="project-time-span-calendar-navigation">
              <button
                type="button"
                className="project-time-span-calendar-nav"
                disabled={prevDisabled}
                aria-label={`Show previous ${panel.label.toLowerCase()} month`}
                onClick={() =>
                  panel.setMonthDate(new Date(year, monthIndex - 1, 1))
                }
              >
                ‹
              </button>
              <div className="project-time-span-calendar-month">
                {new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(
                  panel.monthDate
                )}
              </div>
              <button
                type="button"
                className="project-time-span-calendar-nav"
                disabled={nextDisabled}
                aria-label={`Show next ${panel.label.toLowerCase()} month`}
                onClick={() =>
                  panel.setMonthDate(new Date(year, monthIndex + 1, 1))
                }
              >
                ›
              </button>
            </div>

            <div className="project-time-span-calendar-weekdays">
              {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((wd) => (
                <span key={wd}>{wd}</span>
              ))}
            </div>

            <div className="project-time-span-calendar-days">
              {Array.from({ length: firstWeekday }, (_, i) => (
                <span key={`b-${i}`} className="project-time-span-calendar-blank" />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1;
                const dateKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const outsideRange =
                  dateKey < minDate || Boolean(maxDate && dateKey > maxDate);
                const beforeStart =
                  panel.key === 'due' && Boolean(startDate && dateKey < startDate);
                const isSelected = dateKey === panel.selectedKey;
                const inRange = Boolean(
                  startDate && dueDate && dateKey > startDate && dateKey < dueDate
                );

                return (
                  <button
                    key={dateKey}
                    type="button"
                    disabled={outsideRange || beforeStart}
                    aria-pressed={isSelected}
                    className={[
                      'project-time-span-calendar-day',
                      dateKey === todayKey ? 'is-today' : '',
                      isSelected
                        ? panel.key === 'start'
                          ? 'is-start-date'
                          : 'is-end-date'
                        : '',
                      inRange ? 'is-in-range' : ''
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => {
                      if (panel.key === 'start') {
                        onChangeStart(dateKey);
                        if (dueDate && dueDate < dateKey) {
                          onChangeDue(dateKey);
                          setDueMonthDate(new Date(year, monthIndex, 1));
                        }
                      } else {
                        onChangeDue(dateKey);
                      }
                    }}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            <output className="project-time-span-selected-date" aria-live="polite">
              {panel.selectedKey
                ? new Intl.DateTimeFormat('en-US', {
                    timeZone: 'UTC',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  }).format(new Date(`${panel.selectedKey}T00:00:00Z`))
                : 'Select a date'}
            </output>
          </section>
        );
      })}
    </div>
  );
};

// ==========================================================
// TOASTS + CONFIRMATION + ACTIVE MODALS
// ==========================================================

export const Modals: React.FC = () => {
  const {
    toasts,
    dismissToast,
    confirmationState,
    resolveConfirmation,
    activeModal,
    closeModal
  } = useDashboard();

  useEffect(() => {
    if (!confirmationState.isOpen && activeModal.type === null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmationState.isOpen) {
          resolveConfirmation(false);
        } else if (activeModal.type !== null) {
          closeModal();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeModal.type, closeModal, confirmationState.isOpen, resolveConfirmation]);

  return (
    <>
      {/* Toast Notifications */}
      <div id="dashboard-toast-container" aria-live="polite">
        {toasts.map((toast, idx) => (
          <div
            key={toast.id}
            className={cx('dashboard-toast', toast.tone === 'error' && 'is-error')}
            style={{ bottom: `${24 + idx * 58}px` }}
            role="status"
          >
            <span className={cx('dashboard-toast-message')}>{toast.message}</span>
            <button
              type="button"
              className={cx('dashboard-toast-close')}
              aria-label="Dismiss notification"
              onClick={() => dismissToast(toast.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Confirmation Dialog */}
      {confirmationState.isOpen && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) resolveConfirmation(false);
          }}
        >
          <section
            className="modal notification-confirmation-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirmation-modal-title"
          >
            <header className="notification-confirmation-header">
              <div
                className={`notification-confirmation-icon ${confirmationState.destructive ? 'destructive' : ''}`}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <span className="notification-confirmation-eyebrow">
                {confirmationState.eyebrow || 'Confirm Action'}
              </span>
              <h2 id="confirmation-modal-title">{confirmationState.title}</h2>
              <button
                type="button"
                className="close-modal"
                aria-label="Close confirmation"
                onClick={() => resolveConfirmation(false)}
              >
                ×
              </button>
            </header>
            <div className="notification-confirmation-body">
              <p className="modal-copy">{confirmationState.message}</p>
              <div className="notification-confirmation-actions">
                <button
                  type="button"
                  className="outline-button notification-confirmation-cancel"
                  onClick={() => resolveConfirmation(false)}
                >
                  {confirmationState.cancelLabel || 'Cancel'}
                </button>
                <button
                  type="button"
                  className={`primary-button notification-confirmation-submit ${
                    confirmationState.destructive ? 'notification-confirmation-danger' : 'gold'
                  }`}
                  onClick={() => resolveConfirmation(true)}
                >
                  {confirmationState.confirmLabel || 'Confirm'}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Active Feature Modals */}
      {activeModal.type === 'createProject' && <CreateProjectModal />}
      {activeModal.type === 'editProject' && (
        <EditProjectModal projectId={activeModal.projectId} />
      )}
      {activeModal.type === 'addSprint' && <AddSprintModal projectId={activeModal.projectId} />}
      {activeModal.type === 'inviteCollaborator' && (
        <InviteCollaboratorModal initialProjectId={activeModal.projectId} />
      )}
      {activeModal.type === 'manageCollaborators' && (
        <ManageCollaboratorsModal projectId={activeModal.projectId} />
      )}
      {(activeModal.type === 'createTask' || activeModal.type === 'editTask') && (
        <TaskEditorModal modalState={activeModal} />
      )}
      {activeModal.type === 'scheduleMeeting' && (
        <ScheduleMeetingModal
          initialProjectId={activeModal.projectId}
          defaultDate={activeModal.defaultDate}
          isInstant={Boolean(activeModal.isInstant)}
        />
      )}
      {activeModal.type === 'createReminder' && (
        <CreateReminderModal
          initialProjectId={activeModal.projectId}
          defaultDate={activeModal.defaultDate}
        />
      )}
      {activeModal.type === 'daySchedule' && (
        <DayScheduleModal dateKey={activeModal.dateKey} />
      )}
      {activeModal.type === 'createResource' && (
        <CreateResourceModal
          initialProjectId={activeModal.projectId}
          resourceId={activeModal.resourceId}
        />
      )}
      {activeModal.type === 'permissionNotice' && (
        <PermissionNoticeModal
          eyebrow={activeModal.eyebrow}
          title={activeModal.title}
          message={activeModal.message}
        />
      )}
      {activeModal.type === 'profileOnboarding' && <ProfileOnboardingModal />}
    </>
  );
};

// ==========================================================
// CREATE PROJECT MODAL
// ==========================================================

const CreateProjectModal: React.FC = () => {
  const {
    projects,
    currentUser,
    closeModal,
    loadProjectsFromAPI,
    loadNotificationsFromAPI,
    switchView,
    addAuditLog,
    showDashboardToast
  } = useDashboard();

  const todayKey = toLocalDateKey();
  const [name, setName] = useState('');
  const [projectType, setProjectType] = useState('');
  const [startDate, setStartDate] = useState(todayKey);
  const [dueDate, setDueDate] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('yellow');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const timeSpanFormatted = useMemo(() => {
    if (!startDate || !dueDate) return '';
    const s = new Date(`${startDate}T00:00:00Z`);
    const e = new Date(`${dueDate}T00:00:00Z`);
    const days = (e.getTime() - s.getTime()) / 86400000;
    if (days < 0) return '';
    const weeks = Math.round(days / 7);
    const unit = weeks === 1 ? 'Week' : 'Weeks';
    const monthLabel = formatDurationInMonths(weeks);
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
    return `${weeks} ${unit} (about ${monthLabel}; ${fmt.format(s)} – ${fmt.format(e)})`;
  }, [startDate, dueDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMsg('Enter a project name.');
      return;
    }
    if (!timeSpanFormatted) {
      setErrorMsg('Select both a start date and a due date for the project.');
      return;
    }
    if (!description.trim()) {
      setErrorMsg('Enter a project description.');
      return;
    }
    if (projects.some((p) => p.name.trim().toLowerCase() === trimmedName.toLowerCase())) {
      setErrorMsg('A project with this name already exists.');
      return;
    }

    setErrorMsg('');
    setSubmitting(true);
    try {
      const response = await api.post('/projects', {
        project_id: `p_${Date.now()}`,
        name: trimmedName,
        project_type: projectType || 'General Collaboration',
        time_span: timeSpanFormatted,
        start_date: startDate,
        due_date: dueDate,
        description: description.trim(),
        color,
        invited_members: [],
        sprints: []
      });
      if (!response?.data?.project) {
        throw new Error('The server did not return the created project.');
      }
      await Promise.allSettled([loadProjectsFromAPI({ silent: true }), loadNotificationsFromAPI()]);
      closeModal();
      switchView(trimmedName);
      addAuditLog(
        'Project created',
        `${currentUser?.name || 'Admin'} created ${projectType || 'General Collaboration'} project "${trimmedName}".`,
        'sync'
      );
      showDashboardToast(`Project "${trimmedName}" created.`, 'success');
    } catch (err: any) {
      setErrorMsg(err?.message || 'The project could not be created. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      <form className="modal" id="create-group-project-form" onSubmit={handleSubmit}>
        <button type="button" className="close-modal" aria-label="Close" onClick={closeModal}>
          ×
        </button>
        <div className="modal-body">
          <p className="eyebrow">NEW GROUP PROJECT</p>
          <h2>Create Group Project</h2>
          <p className="modal-copy">
            Start a shared board for your team to plan, break into sprints, assign, and track work.
          </p>

          <label>
            Project Name
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Mobile App v2"
              autoFocus
            />
          </label>

          <label>
            Collaboration Type
            <select
              required
              value={projectType}
              onChange={(e) => setProjectType(e.target.value)}
            >
              <option value="" disabled>
                Choose a collaboration type
              </option>
              {COLLABORATION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <div className={cx('project-time-span-field')}>
            <span className={cx('project-time-span-label')}>Time Span</span>
            <DualDateRangeCalendars
              startDate={startDate}
              dueDate={dueDate}
              minDate={todayKey}
              onChangeStart={setStartDate}
              onChangeDue={setDueDate}
            />
            <output className={cx('project-time-span-preview')} aria-live="polite">
              {timeSpanFormatted || 'Choose an end date to preview the time span.'}
            </output>
          </div>

          <label>
            Description
            <textarea
              rows={3}
              maxLength={10000}
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief purpose of this project board"
            />
          </label>

          <label>
            Color Accent
            <div className={cx('project-color-picker')}>
              <span
                className={cx('project-color-swatch')}
                style={{
                  backgroundColor:
                    PROJECT_COLORS.find((c) => c.value === color)?.color || '#EAB308'
                }}
              />
              <select
                className={cx('project-color-select')}
                value={color}
                onChange={(e) => setColor(e.target.value)}
                aria-label="Project color accent"
              >
                {PROJECT_COLORS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </label>

          {errorMsg && (
            <p className={cx('project-form-error')} role="alert">
              {errorMsg}
            </p>
          )}

          <button type="submit" className="primary-button full gold" disabled={submitting}>
            {submitting ? 'Creating project…' : 'Create Project Board'}
          </button>
        </div>
      </form>
    </div>
  );
};

// ==========================================================
// EDIT PROJECT MODAL
// ==========================================================

const EditProjectModal: React.FC<{ projectId: string }> = ({ projectId }) => {
  const {
    projects,
    activeView,
    switchView,
    closeModal,
    loadProjectsFromAPI,
    loadAllProjectTasks,
    addAuditLog,
    showDashboardToast
  } = useDashboard();

  const project = projects.find((p) => p.projectId === projectId || p.id === projectId);
  const [name, setName] = useState(project?.name || '');
  const [projectType, setProjectType] = useState(project?.projectType || '');
  const [timeSpan, setTimeSpan] = useState(project?.timeSpan || '');
  const [description, setDescription] = useState(project?.description || '');
  const [color, setColor] = useState<string>(project?.color || 'yellow');
  const [submitting, setSubmitting] = useState(false);

  if (!project) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || !description.trim()) return;
    if (
      projects.some(
        (p) =>
          p.projectId !== project.projectId &&
          p.name.trim().toLowerCase() === trimmedName.toLowerCase()
      )
    ) {
      showDashboardToast('Another project already uses that name.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await api.put(`/projects/${encodeURIComponent(project.projectId)}`, {
        name: trimmedName,
        project_type: projectType || project.projectType,
        time_span: timeSpan.trim() || 'Ongoing',
        description: description.trim(),
        color
      });
      await loadProjectsFromAPI({ silent: true });
      await loadAllProjectTasks();
      if (activeView === project.name) {
        switchView(trimmedName);
      }
      addAuditLog('Project updated', `Updated settings for "${trimmedName}".`, 'sync');
      showDashboardToast(`Project "${trimmedName}" updated.`, 'success');
      closeModal();
    } catch (err: any) {
      showDashboardToast(err?.message || 'Unable to update project.', 'error');
      setSubmitting(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      <form className="modal" onSubmit={handleSubmit}>
        <button type="button" className="close-modal" aria-label="Close" onClick={closeModal}>
          ×
        </button>
        <div className="modal-body">
          <h2>Edit Group Project</h2>
          <p className="modal-copy">
            Update project name, collaboration type, timeline schedule, description, or color theme.
          </p>

          <label>
            Project Name
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <label>
            Collaboration Type
            <select
              required
              value={projectType}
              onChange={(e) => setProjectType(e.target.value)}
            >
              {COLLABORATION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <label>
            Time Span (Optional)
            <input
              type="text"
              value={timeSpan}
              onChange={(e) => setTimeSpan(e.target.value)}
              placeholder="e.g. 6 weeks, Q4 2026"
            />
          </label>

          <label>
            Description
            <textarea
              rows={3}
              maxLength={10000}
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

          <label>
            Color Accent
            <div className={cx('project-color-picker')}>
              <span
                className={cx('project-color-swatch')}
                style={{
                  backgroundColor:
                    PROJECT_COLORS.find((c) => c.value === color)?.color || '#EAB308'
                }}
              />
              <select
                className={cx('project-color-select')}
                value={color}
                onChange={(e) => setColor(e.target.value)}
              >
                {PROJECT_COLORS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </label>

          <button type="submit" className="primary-button full gold" disabled={submitting}>
            {submitting ? 'Saving changes…' : 'Save Project Changes'}
          </button>
        </div>
      </form>
    </div>
  );
};

// ==========================================================
// ADD SPRINT MODAL
// ==========================================================

const AddSprintModal: React.FC<{ projectId: string }> = ({ projectId }) => {
  const {
    projects,
    closeModal,
    loadProjectsFromAPI,
    addAuditLog,
    pushNotification,
    showDashboardToast
  } = useDashboard();

  const project = projects.find((p) => p.projectId === projectId || p.id === projectId);
  const [name, setName] = useState('');
  const [status, setStatus] = useState('Active');
  const [submitting, setSubmitting] = useState(false);

  if (!project) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sName = name.trim();
    if (!sName) return;
    setSubmitting(true);
    const updatedSprints = [
      ...(project.sprints || []),
      { id: `s_${Date.now()}`, name: sName, status }
    ];
    try {
      await api.put(`/projects/${encodeURIComponent(project.projectId)}`, {
        sprints: updatedSprints
      });
      await loadProjectsFromAPI({ silent: true });
      addAuditLog('Sprint created', `Added "${sName}" to ${project.name}.`, 'flag');
      pushNotification('Sprint Created', `"${sName}" added to ${project.name}`, '⚡', 'blue-bg');
      showDashboardToast(`Sprint "${sName}" added to ${project.name}.`, 'success');
      closeModal();
    } catch (err: any) {
      showDashboardToast(err?.message || 'The sprint could not be saved.', 'error');
      setSubmitting(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      <form className="modal" onSubmit={handleSubmit}>
        <button type="button" className="close-modal" aria-label="Close" onClick={closeModal}>
          ×
        </button>
        <div className="modal-body">
          <p className="eyebrow">PROJECT MILESTONE</p>
          <h2>Add Sprint to {project.name}</h2>
          <p className="modal-copy">
            Define a new sprint milestone to organize deliverables on this board.
          </p>

          <label>
            Sprint Name
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sprint 2: API Integration"
              autoFocus
            />
          </label>

          <label>
            Sprint Status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="Active">Active</option>
              <option value="Upcoming">Upcoming</option>
              <option value="Completed">Completed</option>
            </select>
          </label>

          <button type="submit" className="primary-button full gold" disabled={submitting}>
            {submitting ? 'Adding sprint…' : 'Add Sprint to Project'}
          </button>
        </div>
      </form>
    </div>
  );
};

// ==========================================================
// INVITE COLLABORATOR MODAL
// ==========================================================

interface SearchedUser {
  firebaseUid: string;
  name: string;
  email: string;
}

const InviteCollaboratorModal: React.FC<{ initialProjectId?: string }> = ({
  initialProjectId
}) => {
  const {
    projects,
    activeProject,
    currentUser,
    closeModal,
    openPermissionNotice,
    addAuditLog,
    pushNotification,
    showDashboardToast
  } = useDashboard();

  const uid = firebaseAuth.currentUser?.uid || currentUser?.uid || '';
  const ownedProjects = useMemo(
    () => projects.filter((p) => p.creatorFirebaseUid && p.creatorFirebaseUid === uid),
    [projects, uid]
  );

  const [selectedProjectId, setSelectedProjectId] = useState(
    () =>
      ownedProjects.find((p) => p.projectId === initialProjectId)?.projectId ||
      ownedProjects.find((p) => p.projectId === activeProject?.projectId)?.projectId ||
      ownedProjects[0]?.projectId ||
      ''
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [searchStatus, setSearchStatus] = useState('Enter at least 2 characters to search.');
  const [results, setResults] = useState<SearchedUser[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<SearchedUser[]>([]);
  const [role, setRole] = useState('Workspace Admin');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!ownedProjects.length) {
      closeModal();
      openPermissionNotice();
    }
  }, [closeModal, openPermissionNotice, ownedProjects.length]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setResults([]);
      setSearchStatus('Enter at least 2 characters to search.');
      return;
    }
    let cancelled = false;
    setSearchStatus('Searching registered users...');
    const timer = window.setTimeout(async () => {
      try {
        const res = await api.get(`/users/search?q=${encodeURIComponent(q)}`);
        if (cancelled) return;
        const users = Array.isArray(res?.users) ? res.users : [];
        const mapped = users
          .map((u: any) => {
            const fUid = u?.firebaseUid || u?.firebase_uid || u?.uid;
            const email = u?.email;
            const name = u?.name || u?.displayName || u?.display_name || email;
            return fUid && email && name ? { firebaseUid: fUid, email, name } : null;
          })
          .filter(Boolean) as SearchedUser[];
        setResults(mapped);
        setSearchStatus(
          mapped.length
            ? `${mapped.length} user${mapped.length === 1 ? '' : 's'} found. Select one to invite.`
            : 'No users found.'
        );
      } catch (err: any) {
        if (!cancelled) {
          setSearchStatus(err?.message || 'User search failed. Please try again.');
        }
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchQuery]);

  if (!ownedProjects.length) return null;

  const targetProj = ownedProjects.find((p) => p.projectId === selectedProjectId) || ownedProjects[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUsers.length) {
      setErrorMsg('Search for and select at least one registered Collab user first.');
      return;
    }
    setErrorMsg('');
    setSubmitting(true);
    try {
      const inviterAvatar = await prepareInvitationAvatar(
        currentUser.profileImage || currentUser.photoURL || firebaseAuth.currentUser?.photoURL
      );
      await api.post('/invitations', {
        firebaseUids: selectedUsers.map((u) => u.firebaseUid),
        firebaseUid: selectedUsers.length === 1 ? selectedUsers[0].firebaseUid : undefined,
        users: selectedUsers.map((u) => ({ firebaseUid: u.firebaseUid, email: u.email })),
        emails: selectedUsers.map((u) => u.email),
        role,
        projectId: selectedProjectId,
        inviterAvatar
      });
      addAuditLog(
        'Member invited',
        `${currentUser.name || 'Project creator'} invited ${selectedUsers.map((u) => u.name).join(', ')} to ${targetProj?.name}.`,
        'userPlus'
      );
      pushNotification(
        'Invitation Sent',
        `${selectedUsers.length} ${selectedUsers.length === 1 ? 'person has' : 'people have'} been invited to ${targetProj?.name}.`,
        '✉️',
        'blue-bg'
      );
      closeModal();
      showDashboardToast(
        `Invitation${selectedUsers.length === 1 ? '' : 's'} sent to ${selectedUsers.map((u) => u.name).join(', ')}.`,
        'success'
      );
    } catch (err: any) {
      setErrorMsg(
        err?.code ? `${err.message} (${err.code})` : err?.message || 'The invitation could not be sent.'
      );
      setSubmitting(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      <form
        className={cx('modal', 'messages-create-modal', 'project-invite-modal')}
        role="dialog"
        aria-modal="true"
        onSubmit={handleSubmit}
      >
        <header className={cx('messages-create-header', 'project-invite-header')}>
          <span className="messages-create-eyebrow">PROJECT COLLABORATOR</span>
          <h2>Invite Member to {targetProj?.name || 'Workspace'}</h2>
          <p className="modal-copy">
            Search for an existing Collab user. They will receive an invitation in their dashboard
            and can accept or decline it there.
          </p>
          <button type="button" className="close-modal" aria-label="Close dialog" onClick={closeModal}>
            ×
          </button>
        </header>

        <label className="messages-create-label">
          Search registered Collab users
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or email..."
            autoComplete="off"
            autoFocus
          />
        </label>

        <p className={cx('project-invite-search-status')} role="status" aria-live="polite">
          {searchStatus}
        </p>

        {results.length > 0 && (
          <div className={cx('invite-user-search-results')}>
            {results.map((u) => {
              const already = selectedUsers.some((s) => s.firebaseUid === u.firebaseUid);
              return (
                <button
                  key={u.firebaseUid}
                  type="button"
                  disabled={already}
                  className={cx('invite-user-search-result')}
                  onClick={() => {
                    if (!already) setSelectedUsers((prev) => [...prev, u]);
                  }}
                >
                  <span className="messages-create-avatar">{getUserInitials(u.name)}</span>
                  <strong>{u.name}</strong>
                  <small>{u.email}</small>
                  <span className={cx('project-invite-result-action')}>
                    {already ? 'Already selected' : 'Add'}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {selectedUsers.length > 0 && (
          <>
            <p className={cx('messages-create-label', 'project-invite-section-label')}>
              Selected users
            </p>
            <div className={cx('invite-selected-users')}>
              {selectedUsers.map((u) => (
                <div key={u.firebaseUid} className={cx('invite-selected-user')}>
                  <span>
                    {u.name} ({u.email})
                  </span>
                  <button
                    type="button"
                    className={cx('invite-selected-user-remove')}
                    onClick={() =>
                      setSelectedUsers((prev) =>
                        prev.filter((item) => item.firebaseUid !== u.firebaseUid)
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        <label className="messages-create-label">
          Role &amp; Permissions
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {INVITATION_ROLE_GROUPS.map((grp) => (
              <optgroup key={grp.label} label={grp.label}>
                {grp.roles.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <label className="messages-create-label">
          Assign to Project
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
          >
            {ownedProjects.map((p) => (
              <option key={p.projectId} value={p.projectId}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        {errorMsg && (
          <p className={cx('project-form-error')} role="alert">
            {errorMsg}
          </p>
        )}

        <button
          type="submit"
          className="primary-button full gold messages-create-submit"
          disabled={!selectedUsers.length || submitting}
        >
          <span className="invite-submit-spinner" aria-hidden="true" hidden={!submitting} />
          <span>{submitting ? 'Sending invitations...' : 'Send Invitation'}</span>
        </button>
      </form>
    </div>
  );
};

// ==========================================================
// MANAGE COLLABORATORS MODAL
// ==========================================================

const ManageCollaboratorsModal: React.FC<{ projectId: string }> = ({ projectId }) => {
  const {
    projects,
    closeModal,
    setActiveModal,
    showDashboardConfirmation,
    showDashboardToast,
    loadProjectsFromAPI
  } = useDashboard();

  const project = projects.find((p) => p.projectId === projectId || p.id === projectId);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [removingId, setRemovingId] = useState<string | null>(null);

  const loadInvitations = async () => {
    if (!project) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await api.get(
        `/projects/${encodeURIComponent(project.projectId)}/invitations`
      );
      setInvitations(Array.isArray(res?.data?.invitations) ? res.data.invitations : []);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Invitations could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvitations();
  }, [projectId]);

  if (!project) return null;

  const handleRemove = async (inv: any) => {
    const isPending = inv.status === 'pending';
    const confirmed = await showDashboardConfirmation({
      title: isPending ? 'Revoke invitation?' : 'Remove collaborator?',
      message: `Are you sure you want to ${isPending ? 'revoke this invitation for' : 'remove access for'} ${inv.invited_name || inv.invited_email}?`,
      confirmLabel: isPending ? 'Revoke invitation' : 'Remove access',
      destructive: true
    });
    if (!confirmed) return;
    setRemovingId(String(inv.invitation_id));
    try {
      await api.delete(
        `/projects/${encodeURIComponent(project.projectId)}/invitations/${encodeURIComponent(inv.invitation_id)}`
      );
      await loadInvitations();
      await loadProjectsFromAPI({ silent: true });
      showDashboardToast(
        isPending ? 'Invitation revoked.' : 'Collaborator access removed.',
        'success'
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'The invitation or access could not be removed.');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      <section
        className={cx('modal', 'messages-create-modal', 'project-invitations-modal')}
        role="dialog"
        aria-modal="true"
      >
        <header className={cx('messages-create-header', 'project-invitations-header')}>
          <span className="messages-create-eyebrow">PROJECT TEAM</span>
          <h2>{project.name} — Invitations</h2>
          <p className="modal-copy">
            Review invite status. Removing an accepted collaborator revokes their project access.
          </p>
          <button type="button" className="close-modal" aria-label="Close dialog" onClick={closeModal}>
            ×
          </button>
        </header>

        {errorMsg && (
          <p className={cx('project-form-error')} role="alert">
            {errorMsg}
          </p>
        )}

        <div className="admin-table-wrapper invitation-table-wrapper">
          <table className="admin-table invitation-table">
            <thead>
              <tr>
                <th>Collaborator</th>
                <th>Role</th>
                <th>Status</th>
                <th>Invited</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="notification-empty-state">
                    Loading invitations…
                  </td>
                </tr>
              ) : invitations.length === 0 ? (
                <tr>
                  <td colSpan={5} className="notification-empty-state">
                    No invitations for this project yet.
                  </td>
                </tr>
              ) : (
                invitations.map((inv) => {
                  const normalizedStatus = String(inv.status || 'unknown').toLowerCase();
                  const statusClass =
                    normalizedStatus === 'accepted'
                      ? 'active'
                      : normalizedStatus === 'pending'
                        ? 'pending'
                        : 'invitation-status-other';
                  const d = new Date(inv.created_at);
                  return (
                    <tr key={inv.invitation_id}>
                      <td>
                        <div className="member-info invitation-identity">
                          <strong>{inv.invited_name || 'Collab user'}</strong>
                          <small>{inv.invited_email || 'Email unavailable'}</small>
                        </div>
                      </td>
                      <td>
                        <span className="invitation-role">{inv.role || 'Member'}</span>
                      </td>
                      <td>
                        <span className={`status-badge invitation-status ${statusClass}`}>
                          {normalizedStatus}
                        </span>
                      </td>
                      <td className="invitation-date">
                        {Number.isNaN(d.getTime()) ? 'Date unavailable' : d.toLocaleDateString()}
                      </td>
                      <td>
                        {normalizedStatus === 'pending' || normalizedStatus === 'accepted' ? (
                          <button
                            type="button"
                            className={cx('action-btn', 'delete', 'invitation-remove-button')}
                            disabled={removingId === String(inv.invitation_id)}
                            onClick={() => handleRemove(inv)}
                          >
                            {removingId === String(inv.invitation_id)
                              ? 'Removing…'
                              : normalizedStatus === 'pending'
                                ? 'Revoke'
                                : 'Remove'}
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <button
          type="button"
          className="primary-button gold messages-create-submit"
          onClick={() => setActiveModal({ type: 'inviteCollaborator', projectId: project.projectId })}
        >
          + Invite another member
        </button>
      </section>
    </div>
  );
};

// ==========================================================
// CREATE / EDIT TASK MODAL
// ==========================================================

const TaskEditorModal: React.FC<{
  modalState:
    | {
        type: 'createTask';
        projectId?: string;
        defaultStatus?: TaskStatus;
        defaultDate?: string;
        prefill?: {
          title?: string;
          description?: string;
          priority?: TaskPriority;
          dueDate?: string;
          chatMessageId?: string;
          attachments?: MediaAttachment[];
        };
      }
    | { type: 'editTask'; taskId: string | number; projectId?: string };
}> = ({ modalState }) => {
  const {
    projects,
    accessibleTasks,
    activeProject,
    currentUser,
    closeModal,
    loadProjectsFromAPI,
    loadAllProjectTasks,
    addAuditLog,
    showDashboardToast
  } = useDashboard();

  const editingTask: TaskItem | null =
    modalState.type === 'editTask'
      ? accessibleTasks.find(
          (t) =>
            String(t.id) === String(modalState.taskId) ||
            String(t.taskId || '') === String(modalState.taskId)
        ) || null
      : null;

  const isEdit = Boolean(editingTask);
  const ownedProjects = useMemo(
    () =>
      projects.filter(
        (p) => p.creatorFirebaseUid && p.creatorFirebaseUid === (firebaseAuth.currentUser?.uid || currentUser?.uid)
      ),
    [projects, currentUser?.uid]
  );

  const selectableProjects = isEdit ? projects : ownedProjects.length ? ownedProjects : projects;
  const initialProjectId =
    modalState.projectId ||
    editingTask?.projectId ||
    activeProject?.projectId ||
    selectableProjects[0]?.projectId ||
    '';

  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId);
  const targetProject =
    projects.find((p) => p.projectId === selectedProjectId) || selectableProjects[0];

  const todayKey = toLocalDateKey();
  const minProjectDate = useMemo(() => {
    const pStart = normalizeDateKey(targetProject?.startDate);
    return pStart && pStart > todayKey ? pStart : todayKey;
  }, [targetProject?.startDate, todayKey]);
  const maxProjectDate = useMemo(
    () => normalizeDateKey(targetProject?.dueDate),
    [targetProject?.dueDate]
  );

  const clampDate = (val?: string | null) => {
    const dk = normalizeDateKey(val);
    if (!dk) return minProjectDate;
    if (dk < minProjectDate) return minProjectDate;
    if (maxProjectDate && dk > maxProjectDate) return maxProjectDate;
    return dk;
  };

  const prefill = modalState.type === 'createTask' ? modalState.prefill : undefined;
  const defaultDue =
    editingTask?.due_date ||
    editingTask?.date ||
    (modalState.type === 'createTask' ? modalState.defaultDate : '') ||
    prefill?.dueDate ||
    todayKey;

  const [title, setTitle] = useState(editingTask?.title || prefill?.title || '');
  const [description, setDescription] = useState(
    editingTask?.description || prefill?.description || ''
  );
  const [status, setStatus] = useState<TaskStatus>(
    editingTask?.status ||
      (modalState.type === 'createTask' && modalState.defaultStatus) ||
      'To do'
  );
  const [priority, setPriority] = useState<TaskPriority>(
    editingTask?.priority || prefill?.priority || 'medium'
  );
  const [selectedTags, setSelectedTags] = useState<string[]>(() => {
    if (editingTask?.tags?.length) return editingTask.tags;
    if (editingTask?.tag) return [editingTask.tag];
    return ['Product'];
  });
  const [tagSearch, setTagSearch] = useState('');
  const [sprintName, setSprintName] = useState(editingTask?.sprint || '');
  const [startDate, setStartDate] = useState(() =>
    clampDate(editingTask?.startDate || editingTask?.start_date || todayKey)
  );
  const [dueDate, setDueDate] = useState(() => clampDate(defaultDue));
  const [attachments, setAttachments] = useState<MediaAttachment[]>(
    () => editingTask?.descriptionAttachments || prefill?.attachments || []
  );

  // Inline create sprint panel
  const [sprintPanelOpen, setSprintPanelOpen] = useState(false);
  const [newSprintName, setNewSprintName] = useState('');
  const [newSprintDesc, setNewSprintDesc] = useState('');
  const [newSprintDue, setNewSprintDue] = useState(() => clampDate(todayKey));
  const [savingSprint, setSavingSprint] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  const projectSprints: ProjectSprint[] = targetProject?.sprints || [];

  const filteredTags = useMemo(() => {
    const q = tagSearch.trim().toLowerCase();
    return q ? TASK_TAG_OPTIONS.filter((t) => t.toLowerCase().includes(q)) : TASK_TAG_OPTIONS;
  }, [tagSearch]);

  const handleSaveInlineSprint = async () => {
    if (!targetProject || !newSprintName.trim()) return;
    setSavingSprint(true);
    try {
      const nextIndex = projectSprints.length + 1;
      const cleanName = newSprintName.trim().replace(/^Sprint\s+\d+\s*:\s*/i, '');
      const fullSprintName = `Sprint ${nextIndex}: ${cleanName}`;
      const nextSprints: ProjectSprint[] = [
        ...projectSprints,
        {
          id: `s_${Date.now()}`,
          name: fullSprintName,
          description: newSprintDesc.trim(),
          status: 'Active',
          dueDate: newSprintDue,
          due_date: newSprintDue
        }
      ];
      await api.put(`/projects/${encodeURIComponent(targetProject.projectId)}`, {
        sprints: nextSprints
      });
      await loadProjectsFromAPI({ silent: true });
      setSprintName(fullSprintName);
      setNewSprintName('');
      setNewSprintDesc('');
      setSprintPanelOpen(false);
      showDashboardToast(`Created "${fullSprintName}".`, 'success');
    } catch (err: any) {
      showDashboardToast(err?.message || 'Unable to save sprint.', 'error');
    } finally {
      setSavingSprint(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetProject) {
      showDashboardToast('Create or select a project first.', 'error');
      return;
    }
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    setSubmitting(true);
    const primaryTag = selectedTags[0] || 'Product';
    const payload = {
      title: trimmedTitle,
      description: description.trim(),
      status,
      priority,
      category: primaryTag,
      tag: primaryTag,
      tags: selectedTags,
      sprint: sprintName || null,
      start_date: startDate,
      due_date: dueDate,
      description_attachments: attachments
    };

    try {
      if (isEdit && editingTask) {
        await api.put(
          `/projects/${encodeURIComponent(targetProject.projectId)}/tasks/${encodeURIComponent(String(editingTask.taskId || editingTask.id))}`,
          payload
        );
        addAuditLog('Task updated', `Updated "${trimmedTitle}".`, 'checkCircle');
        showDashboardToast('Task updated.', 'success');
      } else {
        await api.post(
          `/projects/${encodeURIComponent(targetProject.projectId)}/tasks`,
          payload
        );
        addAuditLog('Task created', `Created "${trimmedTitle}" in ${targetProject.name}.`, 'plus');
        showDashboardToast(`Task "${trimmedTitle}" created.`, 'success');
      }
      await loadAllProjectTasks();
      closeModal();
    } catch (err: any) {
      showDashboardToast(err?.message || 'Task could not be saved.', 'error');
      setSubmitting(false);
    }
  };

  const tomorrowKey = addDaysToDateKey(todayKey, 1);
  const todayObj = parseLocalDate(todayKey);
  const thisWeekEnd = addDaysToDateKey(todayKey, 6 - todayObj.getDay());
  const nextWeekStart = addDaysToDateKey(thisWeekEnd, 1);
  const nextWeekEnd = addDaysToDateKey(nextWeekStart, 6);
  const presets = [
    { label: 'Today', start: todayKey, due: todayKey },
    { label: 'Tomorrow', start: todayKey, due: tomorrowKey },
    { label: 'This Week', start: todayKey, due: thisWeekEnd },
    { label: 'Next Week', start: nextWeekStart, due: nextWeekEnd }
  ];

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      <form
        className="modal project-task-parent-form"
        style={{ maxWidth: '640px', width: 'min(640px, calc(100vw - 32px))' }}
        onSubmit={handleSubmit}
      >
        <button type="button" className="close-modal" aria-label="Close" onClick={closeModal}>
          ×
        </button>
        <div className="modal-body">
          <p className="eyebrow">{isEdit ? 'EDIT TASK' : 'NEW DELIVERABLE'}</p>
          <h2>{isEdit ? 'Edit Task Details' : 'Create Project Task'}</h2>
          <p className="modal-copy">
            Set deliverables, schedule dates, sprint assignment, priority, and media context.
          </p>

          <label>
            Project Board
            <select
              value={selectedProjectId}
              disabled={isEdit}
              onChange={(e) => setSelectedProjectId(e.target.value)}
            >
              {selectableProjects.map((p) => (
                <option key={p.projectId} value={p.projectId}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Task Title
            <input
              type="text"
              required
              maxLength={255}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Build authentication flow"
              autoFocus
            />
          </label>

          <div className="form-row project-task-tags-priority-row">
            <div className="project-task-tag-field">
              <span className="project-task-tag-label">Tags</span>
              <details className="project-task-tag-picker">
                <summary className="project-task-tag-picker-summary">
                  {selectedTags.length ? selectedTags.join(', ') : 'Select tags'}
                </summary>
                <div className="project-task-tag-options">
                  <input
                    type="search"
                    className="project-task-tag-search"
                    value={tagSearch}
                    onChange={(e) => setTagSearch(e.target.value)}
                    placeholder="Filter tags…"
                  />
                  <div className="project-task-tag-option-list">
                    {filteredTags.length === 0 ? (
                      <div className="project-task-tag-empty">No matching tags</div>
                    ) : (
                      filteredTags.map((tag) => (
                        <label key={tag} className="project-task-tag-option">
                          <span>{tag}</span>
                          <input
                            type="checkbox"
                            checked={selectedTags.includes(tag)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedTags((prev) => [...prev, tag]);
                              } else {
                                setSelectedTags((prev) => prev.filter((x) => x !== tag));
                              }
                            }}
                          />
                        </label>
                      ))
                    )}
                  </div>
                </div>
              </details>
            </div>

            <label>
              Priority
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
          </div>

          <div className="form-row project-task-assignment-row">
            <label>
              Status
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
              >
                <option value="To do">To do</option>
                <option value="In progress">In progress</option>
                <option value="Blocked">Blocked</option>
                <option value="Done">Done</option>
                <option value="Backlog">Backlog</option>
              </select>
            </label>

            <div className="project-task-sprint-field" style={{ gridColumn: 'span 2' }}>
              <label>
                Sprint
                <select value={sprintName} onChange={(e) => setSprintName(e.target.value)}>
                  <option value="">No Sprint</option>
                  {projectSprints.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <button
              type="button"
              className="outline-button project-task-create-sprint-toggle"
              onClick={() => setSprintPanelOpen((p) => !p)}
            >
              {sprintPanelOpen ? 'Close' : '+ Sprint'}
            </button>
          </div>

          {sprintPanelOpen && (
            <div className="project-task-create-sprint-panel">
              <div className="project-task-sprint-panel-header">
                <h4>Quick Add Sprint</h4>
                <button
                  type="button"
                  className="project-task-close-sprint"
                  onClick={() => setSprintPanelOpen(false)}
                >
                  Cancel
                </button>
              </div>
              <label>
                Sprint Name
                <input
                  type="text"
                  value={newSprintName}
                  onChange={(e) => setNewSprintName(e.target.value)}
                  placeholder="e.g. Design Signoff"
                />
              </label>
              <label>
                Description
                <textarea
                  rows={2}
                  value={newSprintDesc}
                  onChange={(e) => setNewSprintDesc(e.target.value)}
                  placeholder="Sprint goals and scope…"
                />
              </label>
              <div className="project-task-sprint-due-date-row">
                <label>
                  Due Date
                  <input
                    type="date"
                    value={newSprintDue}
                    min={minProjectDate}
                    max={maxProjectDate || undefined}
                    onChange={(e) => setNewSprintDue(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="primary-button gold project-task-save-sprint"
                  disabled={savingSprint || !newSprintName.trim()}
                  onClick={handleSaveInlineSprint}
                >
                  {savingSprint ? 'Saving…' : 'Save Sprint'}
                </button>
              </div>
            </div>
          )}

          {/* Schedule Calendar Picker */}
          <div className="cal-schedule-picker-card">
            <div className="cal-schedule-header">
              <div className="cal-schedule-title">
                <span>🗓️ Due Date / Schedule Timeline</span>
              </div>
              <div className="cal-schedule-summary">
                <strong>
                  {formatRelativeDate(dueDate)} ({Math.max(1, getDateDayOffset(dueDate, parseLocalDate(startDate)) + 1)}d)
                </strong>
              </div>
            </div>
            <div className="cal-schedule-presets">
              {presets.map((p) => {
                const ps = clampDate(p.start);
                let pd = clampDate(p.due);
                if (pd < ps) pd = ps;
                const active = ps === startDate && pd === dueDate;
                return (
                  <button
                    key={p.label}
                    type="button"
                    className={`cal-preset-pill ${active ? 'active' : ''}`}
                    onClick={() => {
                      setStartDate(ps);
                      setDueDate(pd);
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            <DualDateRangeCalendars
              startDate={startDate}
              dueDate={dueDate}
              minDate={minProjectDate}
              maxDate={maxProjectDate}
              onChangeStart={setStartDate}
              onChangeDue={setDueDate}
            />
          </div>

          <label>
            Description
            <textarea
              rows={3}
              maxLength={10000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Acceptance criteria, links, or deliverable instructions…"
            />
          </label>

          <TaskMediaEditor
            attachments={attachments}
            onChange={setAttachments}
            label="Task Attachments & Recordings"
          />

          <button type="submit" className="primary-button full gold" disabled={submitting}>
            {submitting ? 'Saving Task…' : isEdit ? 'Save Task Changes' : 'Create Task'}
          </button>
        </div>
      </form>
    </div>
  );
};

// ==========================================================
// SCHEDULE MEETING MODAL
// ==========================================================

const ScheduleMeetingModal: React.FC<{
  initialProjectId?: string;
  defaultDate?: string;
  isInstant?: boolean;
}> = ({ initialProjectId, defaultDate, isInstant = false }) => {
  const {
    projects,
    activeProject,
    closeModal,
    createProjectMeeting,
    openMeteredMeetingModal,
    addAuditLog,
    showDashboardToast
  } = useDashboard();

  const timeStep = isInstant ? 60 : 900;
  const earliest = getEarliestDateTimeInput(timeStep);
  const formatTime = (d: Date) =>
    `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  const [selectedProjectId, setSelectedProjectId] = useState(
    () => initialProjectId || activeProject?.projectId || projects[0]?.projectId || ''
  );
  const selectedProject = projects.find((p) => p.projectId === selectedProjectId) || projects[0];
  const projectMembers = useMemo(
    () => getMeetingProjectMembers(selectedProject),
    [selectedProject]
  );

  const [attendeeUids, setAttendeeUids] = useState<string[]>(() =>
    projectMembers.map((m) => m.firebaseUid)
  );
  useEffect(() => {
    setAttendeeUids(projectMembers.map((m) => m.firebaseUid));
  }, [selectedProjectId]);

  const initialDates = useMemo(() => {
    const start = new Date();
    start.setSeconds(0, 0);
    if (isInstant) start.setMinutes(start.getMinutes() + 1);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    return {
      date: notBeforeTodayDateKey(isInstant ? toLocalDateKey(start) : defaultDate, earliest.date),
      startTime: isInstant ? formatTime(start) : '10:00',
      endTime: isInstant ? formatTime(end) : '11:00'
    };
  }, [defaultDate, earliest.date, isInstant]);

  const [title, setTitle] = useState(isInstant ? 'Instant team meeting' : '');
  const [date, setDate] = useState(initialDates.date);
  const [startTime, setStartTime] = useState(initialDates.startTime);
  const [endTime, setEndTime] = useState(initialDates.endTime);
  const [pinned, setPinned] = useState(true);
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId) {
      showDashboardToast('Choose a project before scheduling a meeting.', 'error');
      return;
    }
    const startDt = new Date(`${date}T${startTime}:00`);
    const endDt = new Date(`${date}T${endTime}:00`);
    if (startDt <= new Date()) {
      showDashboardToast('Start time must be in the future.', 'error');
      return;
    }
    if (endDt <= startDt) {
      showDashboardToast('End time must be later than start time.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const created = await createProjectMeeting(selectedProjectId, {
        title: title.trim(),
        date,
        startTime,
        endTime,
        pinned,
        location: location.trim(),
        notes: notes.trim(),
        attendeeFirebaseUids: attendeeUids
      });
      closeModal();
      addAuditLog(
        'Project meeting scheduled',
        `${created.title} scheduled for ${created.date}.`,
        'sync'
      );
      if (isInstant) {
        openMeteredMeetingModal(created);
      } else {
        showDashboardToast('Meeting scheduled.', 'success');
      }
    } catch (err: any) {
      showDashboardToast(err?.message || 'Unable to schedule this meeting.', 'error');
      setSubmitting(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      <form className="modal" onSubmit={handleSubmit}>
        <button type="button" className="close-modal" aria-label="Close" onClick={closeModal}>
          ×
        </button>
        <div className="modal-body">
          <h2>{isInstant ? 'Start Instant Meeting' : 'Schedule Team Meeting'}</h2>
          <p className="modal-copy">
            {!projects.length
              ? 'Create or join a project before scheduling a project meeting.'
              : isInstant
                ? 'Create a video meeting room and invite your project members to join now.'
                : 'Schedule a meeting for a project you own or have joined.'}
          </p>

          <label>
            Project
            <select
              required
              disabled={!projects.length}
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
            >
              {projects.map((p) => (
                <option key={p.projectId} value={p.projectId}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="meeting-attendees-fieldset" disabled={!projects.length}>
            <legend>Invite project members</legend>
            <div className="meeting-attendees-options">
              {projectMembers.map((person) => {
                const uid = String(person.firebaseUid || '');
                return (
                  <label key={uid} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={attendeeUids.includes(uid)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setAttendeeUids((prev) => [...prev, uid]);
                        } else {
                          setAttendeeUids((prev) => prev.filter((id) => id !== uid));
                        }
                      }}
                    />
                    <span>{String(person.name || person.email || 'Member')}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <label>
            Meeting Title
            <input
              type="text"
              required
              maxLength={255}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Sprint 2 Planning & Review"
            />
          </label>

          <label>
            Date
            <input
              type="date"
              required
              min={earliest.date}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>

          <div className="form-row meeting-time-range">
            <label>
              Start time
              <input
                type="time"
                required
                step={timeStep}
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </label>
            <label>
              End time
              <input
                type="time"
                required
                step={timeStep}
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </label>
          </div>

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={pinned}
              onChange={(e) => setPinned(e.target.checked)}
            />
            <span>📍 Pin this meeting on the Calendar for all team members</span>
          </label>

          <label>
            Additional Link / Physical Location
            <input
              type="text"
              maxLength={2048}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Optional: address or another meeting link"
            />
          </label>

          <label>
            Agenda &amp; Discussion Topics
            <textarea
              rows={2}
              maxLength={10000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Key discussion points for this collaborative sync..."
            />
          </label>

          <button
            type="submit"
            className="primary-button gold"
            disabled={!projects.length || submitting}
          >
            {submitting
              ? isInstant
                ? 'Creating room…'
                : 'Scheduling…'
              : isInstant
                ? 'Create meeting'
                : 'Schedule & Pin Meeting'}
          </button>
        </div>
      </form>
    </div>
  );
};

// ==========================================================
// CREATE REMINDER MODAL
// ==========================================================

const CreateReminderModal: React.FC<{ initialProjectId?: string; defaultDate?: string }> = ({
  initialProjectId,
  defaultDate
}) => {
  const {
    projects,
    activeProject,
    closeModal,
    createProjectReminder,
    addAuditLog,
    showDashboardToast
  } = useDashboard();

  const earliest = getEarliestDateTimeInput(900);
  const [selectedProjectId, setSelectedProjectId] = useState(
    () => initialProjectId || activeProject?.projectId || projects[0]?.projectId || ''
  );
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() => notBeforeTodayDateKey(defaultDate, earliest.date));
  const [time, setTime] = useState(() =>
    date === earliest.date && '09:00' < earliest.time ? earliest.time : '09:00'
  );
  const [priority, setPriority] = useState('Normal');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId) {
      showDashboardToast('Choose a project before adding a reminder.', 'error');
      return;
    }
    const dt = new Date(`${date}T${time}:00`);
    if (Number.isNaN(dt.getTime()) || dt <= new Date()) {
      showDashboardToast('Reminder time must be in the future.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const rem = await createProjectReminder(selectedProjectId, {
        title: title.trim(),
        date,
        time,
        priority
      });
      addAuditLog(
        'Project reminder added',
        `${rem.title} on ${rem.date} in ${rem.projectName}.`,
        'bell'
      );
      showDashboardToast('Reminder saved.', 'success');
      closeModal();
    } catch (err: any) {
      showDashboardToast(err?.message || 'Unable to save this reminder.', 'error');
      setSubmitting(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      <form className="modal" onSubmit={handleSubmit}>
        <button type="button" className="close-modal" aria-label="Close" onClick={closeModal}>
          ×
        </button>
        <div className="modal-body">
          <h2>Add Team Reminder</h2>
          <p className="modal-copy">
            {projects.length
              ? 'Set a project reminder visible to everyone with access to that project.'
              : 'Create or join a project before adding a reminder.'}
          </p>

          <label>
            Project
            <select
              required
              disabled={!projects.length}
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
            >
              {projects.map((p) => (
                <option key={p.projectId} value={p.projectId}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Reminder Title
            <input
              type="text"
              required
              maxLength={255}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Submit newsletter draft copy"
              autoFocus
            />
          </label>

          <label>
            Date
            <input
              type="date"
              required
              min={earliest.date}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>

          <label>
            Time
            <input
              type="time"
              required
              step={900}
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </label>

          <label>
            Priority
            <select value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="Normal">Normal</option>
              <option value="High">High</option>
              <option value="Urgent">Urgent</option>
            </select>
          </label>

          <button
            type="submit"
            className="primary-button gold"
            disabled={!projects.length || submitting}
          >
            {submitting ? 'Saving Reminder…' : 'Save Reminder'}
          </button>
        </div>
      </form>
    </div>
  );
};

// ==========================================================
// DAY SCHEDULE MODAL
// ==========================================================

const DayScheduleModal: React.FC<{ dateKey: string }> = ({ dateKey }) => {
  const {
    meetings,
    accessibleTasks,
    reminders,
    closeModal,
    setActiveModal,
    openMeteredMeetingModal,
    openTaskDetails
  } = useDashboard();

  const dayMeetings = meetings.filter((m) => m.date === dateKey);
  const dayTasks = accessibleTasks.filter((t) => t.date === dateKey);
  const dayReminders = reminders.filter((r) => r.date === dateKey);

  const todayKey = toLocalDateKey();
  const tomorrowKey = addDaysToDateKey(todayKey, 1);
  const formatted = `${dateKey === todayKey ? 'Today (' : dateKey === tomorrowKey ? 'Tomorrow (' : ''}${new Intl.DateTimeFormat(
    undefined,
    { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' }
  ).format(parseLocalDate(dateKey))}${dateKey === todayKey || dateKey === tomorrowKey ? ')' : ''}`;

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      <div className="modal" style={{ maxWidth: '560px' }} role="dialog" aria-modal="true">
        <button type="button" className="close-modal" aria-label="Close" onClick={closeModal}>
          ×
        </button>
        <div className="modal-body">
          <h2>Schedule for {formatted}</h2>
          <p className="modal-copy">
            Pinned collaboration syncs, deliverable deadlines, and reminders for this day.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <h4 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>
                📍 Pinned Team Meetings ({dayMeetings.length})
              </h4>
              {dayMeetings.length === 0 ? (
                <p className="modal-copy">No meetings scheduled for this date.</p>
              ) : (
                <div style={{ display: 'grid', gap: '8px' }}>
                  {dayMeetings.map((m) => {
                    const safeUrl = getSafeMeetingUrl(m.location);
                    const canJoin =
                      !m.isEnded && new Date(`${m.date}T${m.endTime || '23:59'}:00`) >= new Date();
                    return (
                      <div
                        key={m.id}
                        style={{
                          background: '#FFFBEB',
                          border: '1px solid #FDE68A',
                          borderRadius: '8px',
                          padding: '8px 12px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '8px'
                        }}
                      >
                        <div>
                          <strong style={{ fontSize: '12px', color: '#92400E', display: 'block' }}>
                            📍 {m.title}
                          </strong>
                          <small style={{ color: '#71717A', fontSize: '11px' }}>
                            {m.time || `${m.startTime} - ${m.endTime}`} • Host: {m.host}
                          </small>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          {canJoin ? (
                            <button
                              type="button"
                              className="pinned-join-btn"
                              onClick={() => openMeteredMeetingModal(m)}
                            >
                              Join Meeting
                            </button>
                          ) : m.isEnded ? (
                            <span className="meeting-ended-label">Meeting ended</span>
                          ) : null}
                          {safeUrl && !m.isEnded && (
                            <a
                              href={safeUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="pinned-join-btn"
                            >
                              Open link
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <h4 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>
                📋 Scheduled Work Deliverables ({dayTasks.length})
              </h4>
              {dayTasks.length === 0 ? (
                <p className="modal-copy">No deliverable deadlines for this date.</p>
              ) : (
                <div style={{ display: 'grid', gap: '8px' }}>
                  {dayTasks.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        closeModal();
                        openTaskDetails(t.id);
                      }}
                      style={{
                        background: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        cursor: 'pointer',
                        textAlign: 'left'
                      }}
                    >
                      <div>
                        <strong style={{ fontSize: '12px', color: '#1E293B', display: 'block' }}>
                          📋 {t.title}
                        </strong>
                        <small style={{ color: '#64748B', fontSize: '11px' }}>{t.project}</small>
                      </div>
                      <span
                        className={`status-badge ${t.status.toLowerCase().replace(' ', '-')}`}
                      >
                        {t.status}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {dayReminders.length > 0 && (
              <div>
                <h4 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>
                  🔔 Reminders ({dayReminders.length})
                </h4>
                <div style={{ display: 'grid', gap: '6px' }}>
                  {dayReminders.map((r) => (
                    <div
                      key={r.id}
                      style={{
                        background: '#FAF5FF',
                        border: '1px solid #F3E8FF',
                        borderRadius: '6px',
                        padding: '6px 10px',
                        fontSize: '12px',
                        color: '#6B21A8'
                      }}
                    >
                      🔔 {r.title} • {r.time} ({r.priority} Priority) · {r.projectName}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
            <button
              type="button"
              className="primary-button gold"
              onClick={() =>
                setActiveModal({ type: 'scheduleMeeting', defaultDate: dateKey })
              }
            >
              + Schedule Meeting
            </button>
            <button
              type="button"
              className="outline-button"
              style={{ width: 'auto', color: 'var(--ink)', borderColor: 'var(--line)' }}
              onClick={() => setActiveModal({ type: 'createReminder', defaultDate: dateKey })}
            >
              + Add Reminder
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==========================================================
// CREATE / EDIT RESOURCE MODAL
// ==========================================================

const CreateResourceModal: React.FC<{ initialProjectId?: string; resourceId?: string }> = ({
  initialProjectId,
  resourceId
}) => {
  const {
    projects,
    teamResources,
    activeProject,
    currentUser,
    closeModal,
    upsertResourceLocal,
    showDashboardToast
  } = useDashboard();

  const uid = firebaseAuth.currentUser?.uid || currentUser?.uid || '';
  const ownedProjects = useMemo(
    () => projects.filter((p) => p.creatorFirebaseUid && p.creatorFirebaseUid === uid),
    [projects, uid]
  );
  const existing = resourceId ? teamResources.find((r) => r.id === resourceId) : undefined;
  const editing = Boolean(existing);

  const [selectedProjectId, setSelectedProjectId] = useState(
    () =>
      existing?.projectId ||
      initialProjectId ||
      ownedProjects.find((p) => p.projectId === activeProject?.projectId)?.projectId ||
      ownedProjects[0]?.projectId ||
      ''
  );
  const [title, setTitle] = useState(existing?.title || '');
  const [url, setUrl] = useState(existing?.url || '');
  const [category, setCategory] = useState(existing?.category || RESOURCE_CATEGORIES[0]);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetProject = ownedProjects.find((p) => p.projectId === selectedProjectId);
    if (!targetProject) {
      showDashboardToast('Create a project first before pinning resources.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        url: url.trim(),
        category
      };
      const response = editing && existing
        ? await api.put(
            `/projects/${encodeURIComponent(targetProject.projectId)}/resources/${encodeURIComponent(existing.id)}`,
            payload
          )
        : await api.post(
            `/projects/${encodeURIComponent(targetProject.projectId)}/resources`,
            payload
          );
      const record = response?.data?.resource;
      if (record) {
        upsertResourceLocal(normalizeResourceRecord(record, targetProject), editing);
      }
      showDashboardToast(editing ? 'Resource updated.' : 'Resource pinned to project.', 'success');
      closeModal();
    } catch (err: any) {
      showDashboardToast(err?.message || 'Unable to save project resource.', 'error');
      setSubmitting(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      <form className="modal" onSubmit={handleSubmit}>
        <button type="button" className="close-modal" aria-label="Close" onClick={closeModal}>
          ×
        </button>
        <div className="modal-body">
          <h2>{editing ? 'Edit Pinned Resource' : 'Add Pinned Resource'}</h2>
          <p className="modal-copy">
            {editing
              ? 'Update this project resource. Project members will be notified.'
              : 'Pin a resource to one of your projects. Only that project’s members can view it.'}
          </p>

          <label>
            Project
            <select
              disabled={editing || !ownedProjects.length}
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
            >
              {ownedProjects.map((p) => (
                <option key={p.projectId} value={p.projectId}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Resource Title
            <input
              type="text"
              required
              maxLength={255}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Design Tokens Figma"
              autoFocus
            />
          </label>

          <label>
            Resource URL
            <input
              type="url"
              required
              maxLength={2048}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://figma.com/@your-project"
            />
          </label>

          <label>
            Category
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {RESOURCE_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            className="primary-button gold full"
            disabled={!ownedProjects.length || submitting}
          >
            {submitting
              ? 'Saving…'
              : editing
                ? 'Save Resource Changes'
                : 'Pin Resource to Project'}
          </button>
        </div>
      </form>
    </div>
  );
};

// ==========================================================
// PERMISSION NOTICE & PROFILE ONBOARDING MODALS
// ==========================================================

const PermissionNoticeModal: React.FC<{
  eyebrow?: string;
  title: string;
  message: string;
}> = ({ eyebrow = 'PROJECT ACCESS', title, message }) => {
  const { closeModal } = useDashboard();
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      <section
        className={cx('modal', 'create-project-first-notice')}
        role="dialog"
        aria-modal="true"
      >
        <header className={cx('dashboard-modal-header')}>
          <span className="eyebrow" style={{ color: '#A7F3D0' }}>
            {eyebrow}
          </span>
          <h2>{title}</h2>
          <button type="button" className="close-modal" aria-label="Close" onClick={closeModal}>
            ×
          </button>
        </header>
        <div className="modal-body">
          <p className="modal-copy">{message}</p>
          <button type="button" className="primary-button gold full" onClick={closeModal}>
            Got it
          </button>
        </div>
      </section>
    </div>
  );
};

const ProfileOnboardingModal: React.FC = () => {
  const { currentUser, closeModal, switchView } = useDashboard();

  const dismiss = () => {
    if (currentUser?.uid) {
      localStorage.removeItem('collab-profile-onboarding-uid');
    }
    closeModal();
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <section
        className={cx('modal', 'notification-confirmation-modal', 'profile-onboarding-modal')}
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-onboarding-title"
        aria-describedby="profile-onboarding-copy"
      >
        <header className={cx('notification-confirmation-header', 'profile-onboarding-header')}>
          <button type="button" className="close-modal" aria-label="Close" onClick={dismiss}>
            ×
          </button>
          <div className="notification-confirmation-icon">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M20 21a8 8 0 0 0-16 0m8-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
            </svg>
          </div>
          <span className="notification-confirmation-eyebrow">Profile setup</span>
          <h2 id="profile-onboarding-title">Your account is ready</h2>
        </header>
        <div className="notification-confirmation-body">
          <p className="modal-copy" id="profile-onboarding-copy">
            Review your profile details in Settings so teammates can see your name, company, role,
            and collaboration preferences.
          </p>
          <div className={cx('notification-confirmation-actions', 'profile-onboarding-actions')}>
            <button
              type="button"
              className="outline-button notification-confirmation-cancel"
              onClick={dismiss}
            >
              I&apos;ll do this later
            </button>
            <button
              type="button"
              className="primary-button gold notification-confirmation-submit"
              onClick={() => {
                dismiss();
                switchView('Settings');
                window.setTimeout(() => {
                  (document.querySelector('#profile-name-input') as HTMLInputElement | null)?.focus();
                }, 50);
              }}
            >
              Update my profile
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
