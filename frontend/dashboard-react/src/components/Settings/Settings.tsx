import React, { useEffect, useRef, useState } from 'react';
import {
  EmailAuthProvider,
  linkWithCredential,
  reauthenticateWithCredential,
  updateEmail,
  updatePassword,
  updateProfile
} from 'firebase/auth';
import {
  type CollabToolSettings,
  getAvatarSource,
  getUserInitials,
  useDashboard
} from '../../context/DashboardContext';
import { api } from '../../services/api';
import { firebaseAuth } from '../../services/firebase';
import type { AccentTheme, ThemeMode } from '../../types/dashboard';
import { createCx } from '../../utils/cx';
import { SvgIcon } from '../../utils/icons';
import { validatePhoneNumber } from '../../utils/phoneValidation';
import styles from './Settings.module.css';

const cx = createCx(styles);

const COUNTRIES: Array<{ code: string; label: string; countries: string[] }> = [
  { code: '+27', label: 'South Africa (+27)', countries: ['ZA'] },
  { code: '+1', label: 'United States / Canada (+1)', countries: ['US', 'CA'] },
  { code: '+44', label: 'United Kingdom (+44)', countries: ['GB'] },
  { code: '+61', label: 'Australia (+61)', countries: ['AU'] },
  { code: '+91', label: 'India (+91)', countries: ['IN'] },
  { code: '+234', label: 'Nigeria (+234)', countries: ['NG'] },
  { code: '+254', label: 'Kenya (+254)', countries: ['KE'] },
  { code: '+233', label: 'Ghana (+233)', countries: ['GH'] },
  { code: '+20', label: 'Egypt (+20)', countries: ['EG'] },
  { code: '+212', label: 'Morocco (+212)', countries: ['MA'] },
  { code: '+49', label: 'Germany (+49)', countries: ['DE'] },
  { code: '+33', label: 'France (+33)', countries: ['FR'] },
  { code: '+34', label: 'Spain (+34)', countries: ['ES'] },
  { code: '+39', label: 'Italy (+39)', countries: ['IT'] },
  { code: '+31', label: 'Netherlands (+31)', countries: ['NL'] },
  { code: '+46', label: 'Sweden (+46)', countries: ['SE'] },
  { code: '+41', label: 'Switzerland (+41)', countries: ['CH'] },
  { code: '+353', label: 'Ireland (+353)', countries: ['IE'] },
  { code: '+351', label: 'Portugal (+351)', countries: ['PT'] },
  { code: '+55', label: 'Brazil (+55)', countries: ['BR'] },
  { code: '+52', label: 'Mexico (+52)', countries: ['MX'] },
  { code: '+81', label: 'Japan (+81)', countries: ['JP'] },
  { code: '+82', label: 'South Korea (+82)', countries: ['KR'] },
  { code: '+86', label: 'China (+86)', countries: ['CN'] },
  { code: '+65', label: 'Singapore (+65)', countries: ['SG'] },
  { code: '+971', label: 'United Arab Emirates (+971)', countries: ['AE'] },
  { code: '+64', label: 'New Zealand (+64)', countries: ['NZ'] }
];

const INDUSTRIES = [
  'Software & Technology',
  'Design & Creative Agency',
  'Marketing & Advertising',
  'Product Management',
  'Education & Academic',
  'Finance & Consulting',
  'Healthcare & Biotech',
  'Media & Entertainment',
  'E-commerce & Retail',
  'Real Estate & Architecture',
  'Legal & Compliance',
  'Nonprofit & Community',
  'Engineering & Manufacturing',
  'Operations & Logistics',
  'Human Resources & Recruiting',
  'Gaming & Interactive Media',
  'Research & Data Science',
  'Telecommunications',
  'Government & Public Sector',
  'Other'
];

const TONES = [
  { value: 'coral', label: 'Coral Orange (#F46B45)' },
  { value: 'teal', label: 'Teal Green (#2E9D8F)' },
  { value: 'purple', label: 'Royal Purple (#7C3AED)' },
  { value: 'blue', label: 'Ocean Blue (#2563EB)' },
  { value: 'amber', label: 'Golden Amber (#D97706)' },
  { value: 'rose', label: 'Crimson Rose (#E11D48)' }
];

const TIMEZONES = [
  { value: 'UTC-8', label: '(UTC-08:00) Pacific Time (US & Canada)' },
  { value: 'UTC-5', label: '(UTC-05:00) Eastern Time (US & Canada)' },
  { value: 'UTC+0', label: '(UTC+00:00) Greenwich Mean Time (London)' },
  { value: 'UTC+1', label: '(UTC+01:00) Central European Time (Berlin)' },
  { value: 'UTC+2', label: '(UTC+02:00) South Africa Standard Time (SAST)' },
  { value: 'UTC+5:30', label: '(UTC+05:30) India Standard Time (IST)' }
];

const COLLAB_TOGGLES: Array<{
  key: keyof CollabToolSettings;
  title: string;
  desc: string;
}> = [
  {
    key: 'collabSync',
    title: 'Real-time Collaborator Sync',
    desc: 'Broadcast task movements and edits instantly across active members.'
  },
  {
    key: 'calendarPins',
    title: 'Shared Meeting Calendar Pins',
    desc: 'Highlight scheduled group meetings with golden pins on all member calendars.'
  },
  {
    key: 'comments',
    title: 'Task Comments & Mentions',
    desc: 'Allow members to post threaded feedback and mention teammates on tasks.'
  },
  {
    key: 'approvalWorkflow',
    title: 'Admin Approval Workflow',
    desc: 'Allow admins to grant approval badges to verified task deliverables.'
  },
  {
    key: 'sprintCadence',
    title: 'Sprint Cadence Reminders',
    desc: 'Send notification badges 24h before tasks hit target deadlines.'
  },
  {
    key: 'publicShare',
    title: 'Public Share Links',
    desc: 'Permit team members to copy read-only links for external review.'
  },
  {
    key: 'soundNotifs',
    title: 'Live Activity Sound Alerts',
    desc: 'Play a subtle chime when you receive invitations, mentions, or poll alerts.'
  },
  {
    key: 'huddleLinks',
    title: 'Instant Video & Audio Huddle Links',
    desc: 'Auto-attach instant huddle room links when scheduling project meetings.'
  },
  {
    key: 'sprintRollover',
    title: 'Weekly Sprint Auto-Rollover',
    desc: 'Automatically carry unfinished tasks into the next sprint cycle.'
  }
];

function getPasswordStrength(value: string) {
  let score = 0;
  if (value.length >= 6) score += 25;
  if (value.length >= 10) score += 25;
  if (/[A-Z]/.test(value) && /[0-9]/.test(value)) score += 25;
  if (/[^A-Za-z0-9]/.test(value)) score += 25;

  if (!value) {
    return { width: '0%', color: '#EF4444', text: 'Enter at least 6 characters for security' };
  }
  if (score <= 25) {
    return { width: '25%', color: '#EF4444', text: 'Weak password - add numbers and uppercase letters' };
  }
  if (score <= 50) {
    return { width: '50%', color: '#F59E0B', text: 'Moderate strength - consider adding special symbols' };
  }
  if (score <= 75) {
    return { width: '75%', color: '#3B82F6', text: 'Strong password - good for workspace security' };
  }
  return { width: '100%', color: '#10B981', text: 'Very strong password! Secure and ready.' };
}

async function compressProfileImage(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not read the selected image.'));
      el.src = objectUrl;
    });
    const maxSize = 256;
    const ratio = Math.min(maxSize / (img.width || maxSize), maxSize / (img.height || maxSize), 1);
    const width = Math.max(1, Math.round((img.width || maxSize) * ratio));
    const height = Math.max(1, Math.round((img.height || maxSize) * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is unavailable.');
    ctx.drawImage(img, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
    if (dataUrl.length > 350000) {
      return canvas.toDataURL('image/jpeg', 0.55);
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export const Settings: React.FC = () => {
  const {
    firebaseUser,
    currentUser,
    setCurrentUserProfile,
    currentTheme,
    isDarkThemeActive,
    currentAccent,
    collabSettings,
    applyTheme,
    applyAccent,
    toggleDarkLightMode,
    updateCollabSetting,
    auditLogs,
    addAuditLog,
    pushNotification,
    showDashboardToast
  } = useDashboard();

  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'collaboration' | 'audit'>(
    'profile'
  );

  // Profile state
  const [profileName, setProfileName] = useState(currentUser.name || '');
  const [profileEmail, setProfileEmail] = useState(currentUser.email || '');
  const [phoneCountryCode, setPhoneCountryCode] = useState(
    currentUser.phoneCountryCode || '+27'
  );
  const [phoneNumber, setPhoneNumber] = useState(currentUser.phoneNumber || '');
  const [collabType, setCollabType] = useState(currentUser.collaborationType || '');
  const [collabDetails, setCollabDetails] = useState(currentUser.collaborationDetails || '');
  const [workspaceName, setWorkspaceName] = useState(currentUser.workspace || '');
  const [roleTitle, setRoleTitle] = useState(currentUser.role || 'Workspace Admin');
  const [industry, setIndustry] = useState(currentUser.industry || '');
  const [tone, setTone] = useState(currentUser.tone || 'coral');
  const [timezone, setTimezone] = useState(currentUser.timezone || 'UTC+2');
  const [bio, setBio] = useState(currentUser.bio || '');
  const [profileImageUploading, setProfileImageUploading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);

  // Password / security state
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [pwdUpdating, setPwdUpdating] = useState(false);
  const [sessions, setSessions] = useState([
    {
      id: 'session-current',
      device: 'Chrome on Windows 11 (Current Session)',
      meta: 'Cape Town, South Africa · Active now',
      current: true
    },
    {
      id: 'session-mobile',
      device: 'Collab iOS Mobile App',
      meta: 'Johannesburg, South Africa · Last synced 18 mins ago',
      current: false
    }
  ]);

  // Workspace config state
  const [wsName, setWsName] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('collab-workspace-settings') || '{}');
      return saved.workspaceName || 'Collab Workspace';
    } catch {
      return 'Collab Workspace';
    }
  });
  const [wsDefaultRole, setWsDefaultRole] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('collab-workspace-settings') || '{}');
      return saved.defaultRole || 'Collaborator';
    } catch {
      return 'Collaborator';
    }
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Synchronize profile inputs whenever context updates from API
  useEffect(() => {
    setProfileName(currentUser.name || '');
    setProfileEmail(currentUser.email || '');
    setPhoneCountryCode(currentUser.phoneCountryCode || '+27');
    setPhoneNumber(currentUser.phoneNumber || '');
    setCollabType(currentUser.collaborationType || '');
    setCollabDetails(currentUser.collaborationDetails || '');
    setWorkspaceName(currentUser.workspace || '');
    setRoleTitle(currentUser.role || 'Workspace Admin');
    setIndustry(currentUser.industry || '');
    setTone(currentUser.tone || 'coral');
    setTimezone(currentUser.timezone || 'UTC+2');
    setBio(currentUser.bio || '');
  }, [currentUser]);

  const hasPasswordProvider = Boolean(
    (firebaseUser?.providerData || []).some((p) => p.providerId === 'password')
  );
  const previewSrc = getAvatarSource(currentUser);
  const previewInitials = getUserInitials(profileName || currentUser.name);
  const strength = getPasswordStrength(newPwd);

  const handleProfileImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showDashboardToast('Please select a valid image file.', 'error');
      return;
    }
    setProfileImageUploading(true);
    try {
      const compressed = await compressProfileImage(file);
      const res = await api.put('/users/profile-image', { profileImage: compressed });
      const savedUser = res?.data?.user || {};
      const nextProfileImage = savedUser.profileImage || savedUser.profile_image || compressed;
      setCurrentUserProfile({
        ...currentUser,
        ...savedUser,
        profileImage: nextProfileImage,
        photoURL: nextProfileImage
      });
      addAuditLog('Profile photo updated', 'Uploaded a new workspace avatar.', 'user');
      showDashboardToast('Profile photo updated.', 'success');
    } catch (error: any) {
      showDashboardToast(error?.message || 'Unable to upload profile image.', 'error');
    } finally {
      setProfileImageUploading(false);
    }
  };

  const handleRemoveProfileImage = async () => {
    setProfileImageUploading(true);
    try {
      await api.put('/users/profile-image', { profileImage: '' });
      setCurrentUserProfile({
        ...currentUser,
        profileImage: '',
        profile_image: '',
        photoURL: ''
      });
      addAuditLog('Profile photo removed', 'Reverted to initials avatar.', 'user');
      showDashboardToast('Profile photo removed.', 'success');
    } catch (error: any) {
      showDashboardToast(error?.message || 'Unable to remove profile photo.', 'error');
    } finally {
      setProfileImageUploading(false);
    }
  };

  const handleProfileSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanedName = profileName.trim();
    const cleanedEmail = profileEmail.trim();
    const cleanedWorkspace = workspaceName.trim();
    const cleanedRole = roleTitle.trim();

    if (!cleanedName || !cleanedEmail) {
      showDashboardToast('Display name and email are required.', 'warning');
      return;
    }

    const countryMeta = COUNTRIES.find((c) => c.code === phoneCountryCode);
    const phoneCheck = validatePhoneNumber(
      phoneNumber,
      phoneCountryCode,
      countryMeta?.countries || ['ZA']
    );
    if (!phoneCheck.valid) {
      showDashboardToast(phoneCheck.message || 'Enter a valid phone number.', 'warning');
      return;
    }

    if (collabType === 'Other' && !collabDetails.trim()) {
      showDashboardToast('Please describe how you collaborate when selecting Other.', 'warning');
      return;
    }

    setProfileSaving(true);
    try {
      if (firebaseAuth.currentUser) {
        if (cleanedName !== (firebaseAuth.currentUser.displayName || '')) {
          await updateProfile(firebaseAuth.currentUser, { displayName: cleanedName });
        }
        if (cleanedEmail !== (firebaseAuth.currentUser.email || '')) {
          await updateEmail(firebaseAuth.currentUser, cleanedEmail);
        }
      }

      const payload = {
        name: cleanedName,
        email: cleanedEmail,
        phoneCountryCode,
        phoneNumber: phoneCheck.number || phoneNumber.trim(),
        collaborationType: collabType,
        collaborationDetails: collabType === 'Other' ? collabDetails.trim() : '',
        workspace: cleanedWorkspace,
        role: cleanedRole,
        industry,
        tone,
        timezone,
        bio: bio.trim()
      };

      const res = await api.put('/users/profile', payload);
      const savedUser = res?.data?.user || {};
      setCurrentUserProfile({
        ...currentUser,
        ...payload,
        ...savedUser,
        initials: getUserInitials(cleanedName)
      });
      addAuditLog('Profile updated', `${cleanedName} updated workspace profile details.`, 'user');
      pushNotification('Profile Saved', 'Your workspace profile details are up to date.', '✅', 'teal-bg');
      showDashboardToast('Your profile has been updated.', 'success');
    } catch (error: any) {
      showDashboardToast(
        error?.message || 'Could not update your profile. Re-authenticate if you changed email.',
        'error'
      );
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newPwd.length < 6) {
      showDashboardToast('Password must be at least 6 characters long.', 'warning');
      return;
    }
    if (newPwd !== confirmPwd) {
      showDashboardToast('New password and confirmation do not match.', 'warning');
      return;
    }

    const user = firebaseAuth.currentUser;
    if (!user) {
      showDashboardToast('You must be signed in to update your password.', 'error');
      return;
    }

    setPwdUpdating(true);
    try {
      if (hasPasswordProvider) {
        if (!currentPwd) {
          showDashboardToast('Enter your current password first.', 'warning');
          setPwdUpdating(false);
          return;
        }
        const cred = EmailAuthProvider.credential(user.email || currentUser.email, currentPwd);
        await reauthenticateWithCredential(user, cred);
        await updatePassword(user, newPwd);
      } else {
        const cred = EmailAuthProvider.credential(user.email || currentUser.email, newPwd);
        await linkWithCredential(user, cred);
      }
      setCurrentPwd('');
      setNewPwd('');
      setConfirmPwd('');
      addAuditLog('Password updated', 'Account password credentials refreshed.', 'lock');
      pushNotification('Password Updated', 'Your account security credentials were updated.', '🔐', 'teal-bg');
      showDashboardToast('Password updated successfully.', 'success');
    } catch (error: any) {
      showDashboardToast(
        error?.message || 'Unable to update password. Check your current password.',
        'error'
      );
    } finally {
      setPwdUpdating(false);
    }
  };

  const handleWorkspaceConfigSave = (event: React.FormEvent) => {
    event.preventDefault();
    const cleaned = wsName.trim() || 'Collab Workspace';
    try {
      localStorage.setItem(
        'collab-workspace-settings',
        JSON.stringify({ workspaceName: cleaned, defaultRole: wsDefaultRole })
      );
    } catch {
      // Ignore storage error
    }
    addAuditLog(
      'Workspace preferences saved',
      `Updated "${cleaned}" default role to ${wsDefaultRole}.`,
      'sync'
    );
    showDashboardToast('Workspace preferences saved.', 'success');
  };

  const handleExportAuditLog = () => {
    const content = [
      `Collab Workspace Audit Log Export (${new Date().toISOString()})`,
      `Account: ${currentUser.name} <${currentUser.email}>`,
      '',
      ...auditLogs.map((entry) => `[${entry.time}] ${entry.action} — ${entry.detail}`)
    ].join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `collab-audit-log-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showDashboardToast('Audit log downloaded.', 'success');
  };

  return (
    <div id="settings-container" className={cx('settings-container')}>
      <div className={cx('settings-banner')}>
        <div>
          <div className={cx('settings-banner-eyebrow')}>
            <span className={cx('settings-gear-icon')}>⚙️</span>
            <span>WORKSPACE SETTINGS</span>
            <span className={cx('settings-badge-tag')}>Personal &amp; Team</span>
          </div>
          <h2>Account, Security &amp; Appearance</h2>
          <p>
            Manage your collaborator identity, theme mode, password security, and workspace audit trail.
          </p>
        </div>

        <div className={cx('settings-banner-actions')}>
          <button
            type="button"
            id="settings-banner-theme-toggle"
            className={cx('theme-mode-toggle-pill')}
            onClick={toggleDarkLightMode}
          >
            <span className={cx('theme-toggle-icon')}>{isDarkThemeActive ? '☀️' : '🌙'}</span>
            <span>{isDarkThemeActive ? 'Switch to Light Mode' : 'Switch to Dark Mode'}</span>
          </button>
        </div>
      </div>

      {/* Navigation Sub-tabs */}
      <div className="console-tabs" role="tablist" aria-label="Settings sections">
        <button
          type="button"
          className={`console-tab${activeTab === 'profile' ? ' active' : ''}`}
          onClick={() => setActiveTab('profile')}
        >
          Profile &amp; Appearance
        </button>
        <button
          type="button"
          className={`console-tab${activeTab === 'security' ? ' active' : ''}`}
          onClick={() => setActiveTab('security')}
        >
          Security &amp; Sessions
        </button>
        <button
          type="button"
          className={`console-tab${activeTab === 'collaboration' ? ' active' : ''}`}
          onClick={() => setActiveTab('collaboration')}
        >
          Collaboration Preferences
        </button>
        <button
          type="button"
          className={`console-tab${activeTab === 'audit' ? ' active' : ''}`}
          onClick={() => setActiveTab('audit')}
        >
          Workspace Audit Log
        </button>
      </div>

      {activeTab === 'profile' && (
        <div id="settings-tab-profile" className={cx('settings-tab-panel')}>
          {/* Appearance & Theme Card */}
          <div className={cx('settings-card')}>
            <div className={cx('settings-card-header')}>
              <h3>Appearance &amp; Theme</h3>
              <p>Customize workspace theme mode, accent tint, and visual accessibility.</p>
            </div>

            <div className={cx('theme-cards-grid')}>
              {(
                [
                  {
                    id: 'light',
                    name: 'Light Mode',
                    desc: 'Clean bright workspace surfaces for daylight clarity.'
                  },
                  {
                    id: 'dark',
                    name: 'Dark Mode',
                    desc: 'Low-glare charcoal theme tuned for extended focus.'
                  },
                  {
                    id: 'system',
                    name: 'System Default',
                    desc: 'Automatically follows your operating system preference.'
                  }
                ] as Array<{ id: ThemeMode; name: string; desc: string }>
              ).map((t) => (
                <div
                  key={t.id}
                  role="button"
                  tabIndex={0}
                  className={cx('theme-card', { active: currentTheme === t.id })}
                  onClick={() => applyTheme(t.id, true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      applyTheme(t.id, true);
                    }
                  }}
                >
                  <div
                    className={cx(
                      'theme-preview-box',
                      t.id === 'light'
                        ? 'light-preview'
                        : t.id === 'dark'
                          ? 'dark-preview'
                          : 'system-preview'
                    )}
                  >
                    {t.id === 'system' ? (
                      <>
                        <div className={cx('preview-half', 'light-half')} />
                        <div className={cx('preview-half', 'dark-half')} />
                      </>
                    ) : (
                      <>
                        <div className={cx('preview-sidebar')} />
                        <div className={cx('preview-content')}>
                          <div className={cx('preview-header')} />
                          <div className={cx('preview-cards')}>
                            <span />
                            <span />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  <div className={cx('theme-info')}>
                    <div className={cx('theme-name-row')}>
                      <strong>{t.name}</strong>
                      <span className={cx('theme-check')}>✓</span>
                    </div>
                    <p>{t.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div>
              <strong style={{ fontSize: 12, color: 'var(--ink)' }}>Accent Tint</strong>
              <div className={cx('accent-color-options')}>
                {(
                  [
                    { id: 'gold', label: 'Collab Gold' },
                    { id: 'blue', label: 'Ocean Blue' },
                    { id: 'emerald', label: 'Emerald' },
                    { id: 'coral', label: 'Crimson Coral' },
                    { id: 'purple', label: 'Royal Purple' }
                  ] as Array<{ id: AccentTheme; label: string }>
                ).map((acc) => (
                  <button
                    key={acc.id}
                    type="button"
                    className={cx('accent-pill', { active: currentAccent === acc.id })}
                    onClick={() => applyAccent(acc.id, true)}
                  >
                    <span className={cx('accent-dot', acc.id)} />
                    <span>{acc.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className={cx('settings-toggles-list')} style={{ marginTop: 18 }}>
              <div className={cx('settings-toggle-item')}>
                <div className={cx('toggle-text')}>
                  <strong>High-Contrast Mode</strong>
                  <p>Increase border contrast and text legibility across panels.</p>
                </div>
                <label className="switch">
                  <input
                    id="toggle-high-contrast"
                    type="checkbox"
                    checked={Boolean(collabSettings.highContrast)}
                    onChange={(e) => {
                      updateCollabSetting('highContrast', e.target.checked);
                      addAuditLog(
                        'High contrast toggled',
                        `High contrast mode ${e.target.checked ? 'enabled' : 'disabled'}.`,
                        'palette'
                      );
                    }}
                  />
                  <span className="slider round" />
                </label>
              </div>
            </div>
          </div>

          {/* Profile Card */}
          <div className={cx('settings-card')}>
            <div className={`${cx('settings-card-header')} ${cx('profile-card-header')}`}>
              <div>
                <h3>Collaborator Profile</h3>
                <p>Update your personal details, avatar, contact info, and role across projects.</p>
              </div>
              <div className={cx('profile-preview')}>
                {previewSrc ? (
                  <img
                    id="profile-preview-avatar"
                    src={previewSrc}
                    alt={profileName || currentUser.name}
                    className={`${cx('profile-preview-avatar')} avatar ${tone}-bg`}
                    style={{ objectFit: 'cover' }}
                  />
                ) : (
                  <span
                    id="profile-preview-avatar"
                    className={`${cx('profile-preview-avatar')} avatar ${tone}-bg`}
                  >
                    {previewInitials}
                  </span>
                )}
                <div className={cx('profile-preview-info')}>
                  <h4 id="profile-preview-name">{profileName || currentUser.name}</h4>
                  <p id="profile-preview-email">{profileEmail || currentUser.email}</p>
                </div>
              </div>
            </div>

            <form id="profile-settings-form" onSubmit={handleProfileSubmit}>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 10,
                  marginBottom: 18
                }}
              >
                <input
                  ref={fileInputRef}
                  id="profile-image-input"
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={handleProfileImageChange}
                />
                <button
                  type="button"
                  className="outline-button"
                  disabled={profileImageUploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {profileImageUploading ? 'Uploading...' : 'Upload Profile Photo'}
                </button>
                {previewSrc && (
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={profileImageUploading}
                    onClick={handleRemoveProfileImage}
                  >
                    Remove Photo
                  </button>
                )}
              </div>

              <div className="form-grid-2col">
                <div className="form-group">
                  <label htmlFor="profile-name">Display Name</label>
                  <input
                    id="profile-name"
                    type="text"
                    required
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="profile-email">Work Email</label>
                  <input
                    id="profile-email"
                    type="email"
                    required
                    value={profileEmail}
                    onChange={(e) => setProfileEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-grid-2col">
                <div className="form-group">
                  <label htmlFor="profile-phone-country">Country Code</label>
                  <select
                    id="profile-phone-country"
                    value={phoneCountryCode}
                    onChange={(e) => setPhoneCountryCode(e.target.value)}
                  >
                    {COUNTRIES.map((c) => (
                      <option key={`${c.code}-${c.countries.join(',')}`} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="profile-phone-number">Phone Number</label>
                  <input
                    id="profile-phone-number"
                    type="tel"
                    placeholder="e.g. 082 123 4567"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-grid-2col">
                <div className="form-group">
                  <label htmlFor="profile-collab-type">Collaboration Focus</label>
                  <select
                    id="profile-collab-type"
                    value={collabType}
                    onChange={(e) => setCollabType(e.target.value)}
                  >
                    <option value="">Select collaboration type</option>
                    <option value="Team Collaboration">Team Collaboration</option>
                    <option value="School & University Projects">
                      School &amp; University Projects
                    </option>
                    <option value="Personal Organization">Personal Organization</option>
                    <option value="Client & Agency Work">Client &amp; Agency Work</option>
                    <option value="Engineering & Product Sprints">
                      Engineering &amp; Product Sprints
                    </option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="profile-workspace">Brand / Company / Team Name</label>
                  <input
                    id="profile-workspace"
                    type="text"
                    placeholder="e.g. Collab Studio"
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                  />
                </div>
              </div>

              {collabType === 'Other' && (
                <div className="form-group" id="profile-collab-details-wrap">
                  <label htmlFor="profile-collab-details">Describe how you collaborate</label>
                  <input
                    id="profile-collab-details"
                    type="text"
                    value={collabDetails}
                    onChange={(e) => setCollabDetails(e.target.value)}
                  />
                </div>
              )}

              <div className="form-grid-2col">
                <div className="form-group">
                  <label htmlFor="profile-role">Role / Title</label>
                  <input
                    id="profile-role"
                    type="text"
                    placeholder="e.g. Product Designer"
                    value={roleTitle}
                    onChange={(e) => setRoleTitle(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="profile-industry">Industry</label>
                  <select
                    id="profile-industry"
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                  >
                    <option value="">Select industry</option>
                    {INDUSTRIES.map((ind) => (
                      <option key={ind} value={ind}>
                        {ind}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-grid-2col">
                <div className="form-group">
                  <label htmlFor="profile-tone">Avatar Color Tone</label>
                  <select
                    id="profile-tone"
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                  >
                    {TONES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="profile-timezone">Timezone</label>
                  <select
                    id="profile-timezone"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                  >
                    {TIMEZONES.map((tz) => (
                      <option key={tz.value} value={tz.value}>
                        {tz.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="profile-bio">Bio &amp; Role Notes</label>
                <textarea
                  id="profile-bio"
                  rows={3}
                  placeholder="Share what you focus on with teammates..."
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                />
                <small className={cx('profile-field-hint')}>
                  Visible to members across shared project spaces.
                </small>
              </div>

              <div className="form-actions">
                <button type="submit" className="primary-button" disabled={profileSaving}>
                  {profileSaving ? 'Saving Profile...' : 'Save Profile Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'security' && (
        <div id="settings-tab-security" className={cx('settings-tab-panel')}>
          <div className={cx('settings-card')}>
            <div className={cx('settings-card-header')}>
              <h3>Password &amp; Authentication</h3>
              <p>Keep your Collab account protected with a strong password.</p>
            </div>

            <form id="password-settings-form" onSubmit={handlePasswordSubmit}>
              {hasPasswordProvider && (
                <div className="form-group" id="pwd-current-group">
                  <label htmlFor="pwd-current">Current Password</label>
                  <div className="password-wrapper">
                    <input
                      id="pwd-current"
                      type={showCurrentPwd ? 'text' : 'password'}
                      value={currentPwd}
                      onChange={(e) => setCurrentPwd(e.target.value)}
                    />
                    <button
                      type="button"
                      className={`pwd-toggle-btn ${cx('pwd-toggle-btn')}`}
                      aria-label="Toggle current password visibility"
                      onClick={() => setShowCurrentPwd((v) => !v)}
                    >
                      {showCurrentPwd ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>
              )}

              <div className="form-grid-2col">
                <div className="form-group">
                  <label htmlFor="pwd-new">New Password</label>
                  <div className="password-wrapper">
                    <input
                      id="pwd-new"
                      type={showNewPwd ? 'text' : 'password'}
                      value={newPwd}
                      onChange={(e) => setNewPwd(e.target.value)}
                    />
                    <button
                      type="button"
                      className={`pwd-toggle-btn ${cx('pwd-toggle-btn')}`}
                      aria-label="Toggle new password visibility"
                      onClick={() => setShowNewPwd((v) => !v)}
                    >
                      {showNewPwd ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="pwd-confirm">Confirm New Password</label>
                  <div className="password-wrapper">
                    <input
                      id="pwd-confirm"
                      type={showConfirmPwd ? 'text' : 'password'}
                      value={confirmPwd}
                      onChange={(e) => setConfirmPwd(e.target.value)}
                    />
                    <button
                      type="button"
                      className={`pwd-toggle-btn ${cx('pwd-toggle-btn')}`}
                      aria-label="Toggle confirm password visibility"
                      onClick={() => setShowConfirmPwd((v) => !v)}
                    >
                      {showConfirmPwd ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <div
                  style={{
                    height: 6,
                    borderRadius: 4,
                    background: '#E4E4E7',
                    overflow: 'hidden',
                    marginBottom: 6
                  }}
                >
                  <div
                    id="pwd-strength-bar"
                    style={{
                      height: '100%',
                      width: strength.width,
                      background: strength.color,
                      transition: 'width .2s ease'
                    }}
                  />
                </div>
                <small id="pwd-strength-text" style={{ color: 'var(--muted)', fontSize: 11 }}>
                  {strength.text}
                </small>
              </div>

              <div className="form-actions">
                <button type="submit" className="primary-button" disabled={pwdUpdating}>
                  {pwdUpdating ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>

          <div className={cx('settings-card')}>
            <div className={cx('settings-card-header')}>
              <h3>Security Safeguards &amp; Sessions</h3>
              <p>Control two-factor checks, inactivity auto-logout, and active device sessions.</p>
            </div>

            <div className={cx('settings-toggles-list')} style={{ marginBottom: 18 }}>
              <div className={cx('settings-toggle-item')}>
                <div className={cx('toggle-text')}>
                  <strong>Two-Factor Authentication Verification</strong>
                  <p>Require additional verification on new devices.</p>
                </div>
                <label className="switch">
                  <input
                    id="toggle-sec-2fa"
                    type="checkbox"
                    checked={Boolean(collabSettings.twoFactor)}
                    onChange={(e) => {
                      updateCollabSetting('twoFactor', e.target.checked);
                      addAuditLog(
                        'Two-Factor Authentication',
                        `2FA protection ${e.target.checked ? 'enabled' : 'disabled'}.`,
                        'shield'
                      );
                    }}
                  />
                  <span className="slider round" />
                </label>
              </div>

              <div className={cx('settings-toggle-item')}>
                <div className={cx('toggle-text')}>
                  <strong>30-Minute Inactivity Auto-Logout</strong>
                  <p>Automatically sign out inactive browser sessions for workspace safety.</p>
                </div>
                <label className="switch">
                  <input
                    id="toggle-sec-timeout"
                    type="checkbox"
                    checked={Boolean(collabSettings.sessionTimeout)}
                    onChange={(e) => {
                      updateCollabSetting('sessionTimeout', e.target.checked);
                      addAuditLog(
                        'Inactivity timeout',
                        `Auto-logout ${e.target.checked ? 'enabled' : 'disabled'}.`,
                        'lock'
                      );
                    }}
                  />
                  <span className="slider round" />
                </label>
              </div>
            </div>

            <div id="active-sessions-list" style={{ display: 'grid', gap: 10 }}>
              {sessions.map((s) => (
                <div
                  key={s.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: '1px solid var(--line)',
                    background: '#FAFAFB'
                  }}
                >
                  <div>
                    <strong style={{ fontSize: 13 }}>{s.device}</strong>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{s.meta}</div>
                  </div>
                  {s.current ? (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: '#059669',
                        background: '#ECFDF5',
                        padding: '3px 8px',
                        borderRadius: 6
                      }}
                    >
                      Active
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="outline-button"
                      onClick={() => {
                        setSessions((prev) => prev.filter((item) => item.id !== s.id));
                        showDashboardToast(`Revoked ${s.device}.`, 'info');
                      }}
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>

            {sessions.length > 1 && (
              <div style={{ marginTop: 14 }}>
                <button
                  type="button"
                  id="signout-all-sessions-btn"
                  className="outline-button"
                  onClick={() => {
                    setSessions((prev) => prev.filter((item) => item.current));
                    addAuditLog(
                      'Sessions terminated',
                      'Signed out of all remote secondary sessions.',
                      'shield'
                    );
                    showDashboardToast('Signed out of all other sessions.', 'success');
                  }}
                >
                  Sign out of all other sessions
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'collaboration' && (
        <div id="settings-tab-collaboration" className={cx('settings-tab-panel')}>
          <div className={cx('settings-card')}>
            <div className={cx('settings-card-header')}>
              <h3>Workspace Defaults</h3>
              <p>Configure default workspace branding and collaborator role assignments.</p>
            </div>
            <form id="workspace-config-form" onSubmit={handleWorkspaceConfigSave}>
              <div className="form-grid-2col">
                <div className="form-group">
                  <label htmlFor="ws-name-input">Workspace Name</label>
                  <input
                    id="ws-name-input"
                    type="text"
                    value={wsName}
                    onChange={(e) => setWsName(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="ws-default-role-input">Default Member Role</label>
                  <select
                    id="ws-default-role-input"
                    value={wsDefaultRole}
                    onChange={(e) => setWsDefaultRole(e.target.value)}
                  >
                    <option value="Collaborator">Collaborator</option>
                    <option value="Contributor">Contributor</option>
                    <option value="Reviewer">Reviewer</option>
                    <option value="Viewer">Viewer</option>
                  </select>
                </div>
              </div>
              <div className="form-actions">
                <button type="submit" className="primary-button">
                  Save Workspace Defaults
                </button>
              </div>
            </form>
          </div>

          <div className={cx('settings-card')}>
            <div className={cx('settings-card-header')}>
              <h3>Collaboration Tool Switches</h3>
              <p>Toggle live collaboration tools and team automation behaviors.</p>
            </div>
            <div className={cx('settings-toggles-list')}>
              {COLLAB_TOGGLES.map((toggle) => (
                <div key={toggle.key} className={cx('settings-toggle-item')}>
                  <div className={cx('toggle-text')}>
                    <strong>{toggle.title}</strong>
                    <p>{toggle.desc}</p>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={Boolean(collabSettings[toggle.key])}
                      onChange={(e) => updateCollabSetting(toggle.key, e.target.checked)}
                    />
                    <span className="slider round" />
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'audit' && (
        <div id="settings-tab-audit" className={cx('settings-tab-panel')}>
          <div className={cx('settings-card')}>
            <div
              className={cx('settings-card-header')}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}
            >
              <div>
                <h3>Workspace Audit Log</h3>
                <p>Recent collaborator sessions, task updates, and settings changes.</p>
              </div>
              <button
                type="button"
                id="export-audit-btn"
                className="outline-button"
                onClick={handleExportAuditLog}
              >
                Export Log
              </button>
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              {auditLogs.map((entry, idx) => (
                <div key={entry.id || `${entry.action}-${idx}`} className={cx('audit-item')}>
                  <span
                    className={cx(
                      'activity-icon-badge',
                      entry.iconType === 'shield'
                        ? 'shield'
                        : entry.iconType === 'team'
                          ? 'team'
                          : entry.iconType === 'checkCircle'
                            ? 'done'
                            : 'sync'
                    )}
                  >
                    <SvgIcon name={entry.iconType || 'sync'} width={15} height={15} />
                  </span>
                  <div className={cx('audit-content')}>
                    <strong>{entry.action}</strong>
                    <p>
                      {entry.detail} · {entry.time}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
