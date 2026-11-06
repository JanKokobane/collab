import { useEffect, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type {
  HomeMeeting,
  HomeMember,
  HomeNotification,
  HomeProject,
  HomeResource,
  HomeTask,
} from '@/lib/homeApi';

const artColors: Record<string, [string, string, string]> = {
  tasks: ['#FFBD18', '#3267D6', '#202020'],
  due: ['#FF7A2F', '#9139AF', '#202020'],
  open: ['#3267D6', '#31B99C', '#202020'],
  updates: ['#35B775', '#FFBD18', '#202020'],
};

function getResourceUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

function ResourceFavicon({ resource }: { resource: HomeResource }) {
  const [failed, setFailed] = useState(false);
  const url = getResourceUrl(resource.url);
  const domain = url?.hostname.replace(/^www\./, '') || '';

  if (!url || failed) {
    return (
      <View style={styles.resourceFaviconFallback}>
        <Text style={styles.resourceFaviconFallbackText}>
          {resource.title.trim().charAt(0).toUpperCase() || '↗'}
        </Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: new URL('/favicon.ico', url.origin).href }}
      style={styles.resourceFavicon}
      resizeMode="contain"
      accessibilityLabel={`${domain} logo`}
      onError={() => setFailed(true)}
    />
  );
}

function getGreeting(date: Date) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function getLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getFormattedDate(date: Date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function MiniCollaborationArt({ type }: { type: string }) {
  const palette = artColors[type] ?? artColors.tasks;
  return (
    <Svg width={52} height={38} viewBox="0 0 70 48" accessibilityElementsHidden>
      <Rect x={27} y={6} width={37} height={29} rx={7} fill={palette[0]} stroke={palette[2]} strokeWidth={2} />
      <Path d="M36 14h19M36 20h13M36 26h16" stroke={palette[2]} strokeWidth={2} strokeLinecap="round" opacity={0.55} />
      <Circle cx={18} cy={17} r={8} fill={palette[1]} stroke={palette[2]} strokeWidth={2} />
      <Path d="M5 45c0-10 5-18 13-18s13 8 13 18" fill={palette[1]} stroke={palette[2]} strokeWidth={2} />
      <Circle cx={18} cy={16} r={2} fill={palette[2]} />
      <Path d="M15 21c2 2 4 2 6 0M31 37c10 0 16 3 19 8" stroke={palette[2]} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function StatCard({
  label,
  value,
  meta,
  tone,
  art,
}: {
  label: string;
  value: string;
  meta: string;
  tone: 'white' | 'yellow' | 'skyBlue' | 'blue' | 'green';
  art: string;
}) {
  const toneStyle = tone === 'yellow'
    ? styles.statCard_yellow
    : tone === 'skyBlue'
      ? styles.statCard_skyBlue
      : tone === 'blue'
        ? styles.statCard_blue
        : tone === 'green'
          ? styles.statCard_green
          : styles.statCard_white;
  const toneTextStyle = tone === 'white'
    ? styles.statText_dark
    : styles.statText_light;
  return (
    <View style={[styles.statCard, toneStyle]}>
      <View style={styles.statTop}>
        <Text style={[styles.statLabel, toneTextStyle]}>{label}</Text>
        {art === 'tasks' ? (
          <Image
            source={require('../../assets/images/tasks-completed-art.png')}
            resizeMode="contain"
            style={styles.taskStatArt}
            accessibilityLabel="Team members"
          />
        ) : art === 'due' ? (
          <Image
            source={require('../../assets/images/due-this-week-art.png')}
            resizeMode="contain"
            style={styles.dueStatArt}
            accessibilityLabel="Calendar"
          />
        ) : art === 'open' ? (
          <Image
            source={require('../../assets/images/open-tasks-art.png')}
            resizeMode="contain"
            style={styles.taskStatArt}
            accessibilityLabel="Open tasks"
          />
        ) : art === 'updates' ? (
          <Image
            source={require('../../assets/images/unread-notifications-art.png')}
            resizeMode="contain"
            style={styles.taskStatArt}
            accessibilityLabel="Notifications"
          />
        ) : (
          <MiniCollaborationArt type={art} />
        )}
      </View>
      <View style={styles.statValue}>
        <Text style={[styles.statNumber, toneTextStyle]}>{value}</Text>
        <Text style={[styles.statMeta, toneTextStyle]}>{meta}</Text>
      </View>
    </View>
  );
}

function TinyAvatar({
  initials,
  color,
  size = 25,
  profileImage,
}: {
  initials: string;
  color: string;
  size?: number;
  profileImage?: string | null;
}) {
  return (
    <View style={[
      styles.tinyAvatar,
      { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
    ]}>
      {profileImage ? (
        <Image source={{ uri: profileImage }} style={styles.memberImage} />
      ) : (
        <Text style={[styles.tinyAvatarText, size > 25 && styles.memberAvatarText]}>
          {initials}
        </Text>
      )}
    </View>
  );
}

export default function HomeDashboard({
  displayName,
  notes,
  notesSaved,
  notesSaving,
  notesLoading,
  notesLoaded,
  loading,
  error,
  partialErrors,
  projects,
  selectedProjectId,
  tasks,
  meetings,
  members,
  notifications,
  resources,
  onProjectSelect,
  onNotesChange,
  onSaveNotes,
  onRetry,
}: {
  displayName: string;
  notes: string;
  notesSaved: boolean;
  notesSaving: boolean;
  notesLoading: boolean;
  notesLoaded: boolean;
  loading: boolean;
  error: string | null;
  partialErrors: string[];
  projects: HomeProject[];
  selectedProjectId: string;
  tasks: HomeTask[];
  meetings: HomeMeeting[];
  members: HomeMember[];
  notifications: HomeNotification[];
  resources: HomeResource[];
  onProjectSelect: (projectId: string) => void;
  onNotesChange: (value: string) => void;
  onSaveNotes: () => void;
  onRetry: () => void;
}) {
  const [date, setDate] = useState(() => new Date());

  useEffect(() => {
    const intervalId = setInterval(() => setDate(new Date()), 60_000);
    return () => clearInterval(intervalId);
  }, []);

  const todayKey = getLocalDateKey(date);
  const dueThrough = new Date(date);
  dueThrough.setDate(dueThrough.getDate() + 7);
  const dueThroughKey = getLocalDateKey(dueThrough);
  const completedTasks = tasks.filter((task) => task.status.toLowerCase() === 'done').length;
  const openTasks = tasks.filter((task) => task.status.toLowerCase() !== 'done');
  const dueTasks = openTasks.filter((task) => (
    task.dueDate !== null &&
    task.dueDate.slice(0, 10) >= todayKey &&
    task.dueDate.slice(0, 10) <= dueThroughKey
  ));
  const unreadNotifications = notifications.filter((notification) => !notification.isRead).length;
  const upcomingMeetings = meetings
    .filter((meeting) => new Date(
      `${meeting.date.slice(0, 10)}T${meeting.startTime || '00:00:00'}`,
    ) >= date)
    .sort((left, right) => (
      `${left.date.slice(0, 10)}T${left.startTime}`.localeCompare(
        `${right.date.slice(0, 10)}T${right.startTime}`,
      )
    ));
  const completedPercent = tasks.length > 0
    ? Math.round((completedTasks / tasks.length) * 100)
    : 0;
  const statCards = [
    { label: 'Tasks completed', value: loading ? '—' : String(completedTasks), meta: `of ${tasks.length}`, tone: 'green' as const, art: 'tasks' },
    { label: 'Due this week', value: loading ? '—' : String(dueTasks.length), meta: dueTasks.length === 1 ? 'task' : 'tasks', tone: 'skyBlue' as const, art: 'due' },
    { label: 'Open tasks', value: loading ? '—' : String(openTasks.length), meta: openTasks.length === 0 ? 'all clear' : 'remaining', tone: 'blue' as const, art: 'open' },
    { label: 'Unread notifications', value: loading ? '—' : String(unreadNotifications), meta: unreadNotifications === 0 ? 'caught up' : 'unread', tone: 'yellow' as const, art: 'updates' },
  ];

  function insertNote(prefix: string) {
    onNotesChange(`${notes}${notes ? '\n' : ''}${prefix}`);
  }

  return (
    <View style={styles.container}>

      <View>
        <View style={styles.statsGrid}>
          {statCards.map((stat) => <StatCard key={stat.label} {...stat} />)}
        </View>
      </View>

       <View style={styles.welcome}>
        <View style={styles.welcomeCopy}>
          <Text style={styles.subtitle}>Your team’s schedule and decisions at a glance.</Text>
        </View>
      </View>

      <View style={styles.focusCard}>
        <View style={styles.focusTop}>
          <Text style={styles.focusLabel}>Task progress</Text>
          <Text style={styles.focusComplete}>
            {loading ? 'Loading' : tasks.length === 0 ? 'No tasks yet' : openTasks.length === 0 ? 'All caught up' : `${openTasks.length} remaining`}
          </Text>
        </View>
        <View style={styles.focusMain}>
          <View style={styles.focusCount}>
            <Text style={styles.focusNumber}>{loading ? '—' : completedTasks}</Text>
            <Text style={styles.focusMeta}>/ {tasks.length} tasks</Text>
          </View>
          <View style={styles.progressRing}>
            <Text style={styles.progressText}>{loading ? '—' : `${completedPercent}%`}</Text>
          </View>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${completedPercent}%` }]} />
        </View>
      </View>


      {error && (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retryButton}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      )}
      {!error && loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color="#A47E00" />
          <Text style={styles.loadingText}>Loading your workspace data…</Text>
        </View>
      )}
      {partialErrors.length > 0 && !loading && (
        <View style={styles.warningCard}>
          <Text style={styles.warningText}>Some Home data could not be loaded: {partialErrors.join(' ')}</Text>
        </View>
      )}

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.cardKicker}>Next up</Text>
            <Text style={styles.cardTitle}>Upcoming meetings</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open calendar"
            style={({ pressed }) => [styles.roundArrow, pressed && styles.pressed]}>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <Path d="M5 12h14M13 6l6 6-6 6" stroke="#FFFFFF" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </Pressable>
        </View>
        {loading ? (
          <View style={styles.meetingEmptyState}>
            <Text style={styles.meetingDescription}>Checking your project calendars…</Text>
          </View>
        ) : upcomingMeetings.length === 0 ? (
          <View style={styles.meetingEmptyState}>
            <Text style={styles.meetingTitle}>No upcoming meetings</Text>
            <Text style={styles.meetingDescription}>Your project calendars are clear. A perfect time to focus.</Text>
          </View>
        ) : (
          <View style={styles.meetingSchedule}>
            {upcomingMeetings.map((meeting) => {
              const meetingDate = new Date(`${meeting.date.slice(0, 10)}T00:00:00`);
              return (
                <View key={`${meeting.projectName}-${meeting.id}`} style={styles.meetingRow}>
                  <View
                    style={styles.calendarArt}
                    accessibilityLabel={meetingDate.toLocaleDateString('en-US', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}>
                    <View style={styles.calendarMonthTab}>
                      <Text style={styles.calendarMonth}>
                        {meetingDate.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.calendarDateArea}>
                      <Text style={styles.calendarDate}>{meetingDate.getDate()}</Text>
                    </View>
                  </View>
                  <View style={styles.meetingCopy}>
                    <View style={styles.meetingTitleRow}>
                      <Text numberOfLines={1} style={styles.meetingTitle}>{meeting.title}</Text>
                      <Text numberOfLines={1} style={styles.meetingDateText}>
                        {meetingDate.toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </Text>
                    </View>
                    <Text numberOfLines={1} style={styles.meetingDescription}>
                      {`${meeting.startTime ? `${meeting.startTime.slice(0, 5)} · ` : ''}${meeting.projectName}`}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>

      <View style={styles.teamRow}>
        <View>
          <Text style={styles.cardKicker}>Your workspace</Text>
          <Text style={styles.cardTitle}>Team members</Text>
        </View>
        <View style={styles.memberStack} accessibilityLabel={`${members.length} team members`}>
          {members.slice(0, 3).map((member, index) => (
            <View key={member.id} style={styles.memberOverlap}>
              <TinyAvatar
                initials={member.name.split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase()}
                color={['#F04F3F', '#17213C', '#35B775'][index]}
                size={34}
                profileImage={member.profileImage}
              />
            </View>
          ))}
          {members.length > 3 && (
            <View style={styles.memberOverlap}>
              <TinyAvatar initials={`+${members.length - 3}`} color="#ECECE8" size={34} />
            </View>
          )}
        </View>
      </View>

      <View style={[styles.card, styles.resourceCard]}>
        <Text style={styles.resourceHeading}>Pinned Collaboration Resources</Text>
        <Text style={styles.resourceDescription}>
          Central links to team specs, Figma boards, repos, and environments.
        </Text>
        {resources.length > 0 ? (
          <View style={styles.resourceList}>
            {resources.map((resource) => {
              const url = getResourceUrl(resource.url);
              const domain = url?.hostname.replace(/^www\./, '') || 'Invalid link';
              return (
                <Pressable
                  key={resource.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${resource.title}, ${domain}`}
                  onPress={() => {
                    if (!url) {
                      Alert.alert('Invalid resource link', 'This resource does not have a valid web address.');
                      return;
                    }
                    void Linking.openURL(url.href).catch((error: unknown) => {
                      console.error('Unable to open pinned resource:', error);
                      Alert.alert('Could not open link', 'Please try opening this resource again.');
                    });
                  }}
                  style={({ pressed }) => [styles.resourceRow, pressed && styles.pressed]}>
                  <View style={styles.resourceLogoBox}>
                    <ResourceFavicon resource={resource} />
                  </View>
                  <View style={styles.resourceDetails}>
                    <View style={styles.resourceTitleLine}>
                      <Text numberOfLines={1} style={styles.resourceTitle}>{resource.title}</Text>
                      <Text numberOfLines={1} style={styles.resourceCategory}>{resource.category}</Text>
                    </View>
                    <Text numberOfLines={1} style={styles.resourceSubtitle}>
                      {`${resource.projectName} · ${domain}`}
                    </Text>
                  </View>
                  <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
                    <Path d="M7 17 17 7M8 7h9v9" stroke="#92929A" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Text style={styles.resourceEmpty}>
            {loading ? 'Loading project resources…' : 'No pinned resources yet.'}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 18, width: '100%' },
  welcome: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  welcomeCopy: { flex: 1, paddingRight: 8 },
  dateText: { color: '#8C8B84', fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
  greeting: { marginTop: 6, color: '#202020', fontSize: 26, lineHeight: 31, fontWeight: '800', letterSpacing: -1 },
  subtitle: { maxWidth: 300, marginTop: 8, color: '#77766F', fontSize: 12, lineHeight: 18 },
  currentTime: { marginTop: 1, color: '#77766F', fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  focusCard: {
    padding: 19,
    borderWidth: 1,
    borderColor: '#202020',
    borderRadius: 22,
    backgroundColor: '#FFC400',
    shadowColor: '#202020',
    shadowOffset: { width: 4, height: 5 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  focusTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  focusLabel: { color: '#202020', fontSize: 11, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase' },
  focusComplete: { paddingHorizontal: 8, paddingVertical: 5, overflow: 'hidden', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.34)', color: '#202020', fontSize: 9, fontWeight: '800' },
  focusMain: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 15 },
  focusCount: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  focusNumber: { color: '#202020', fontSize: 44, lineHeight: 48, fontWeight: '800', letterSpacing: -3 },
  focusMeta: { color: '#202020', fontSize: 12, fontWeight: '700' },
  progressRing: { width: 54, height: 54, alignItems: 'center', justifyContent: 'center', borderWidth: 6, borderColor: '#202020', borderRadius: 27, backgroundColor: 'rgba(255,255,255,0.32)' },
  progressText: { color: '#202020', fontSize: 9, fontWeight: '800' },
  progressTrack: { height: 5, marginTop: 17, overflow: 'hidden', borderRadius: 999, backgroundColor: 'rgba(32,32,32,0.18)' },
  progressFill: { width: '100%', height: '100%', borderRadius: 999, backgroundColor: '#202020' },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { color: '#202020', fontSize: 16, fontWeight: '800', letterSpacing: -0.5 },
  seeAll: { color: '#77766F', fontSize: 11, fontWeight: '700' },
  errorCard: { padding: 14, borderRadius: 12, backgroundColor: '#FFF0EF' },
  errorText: { color: '#9F2D25', fontSize: 12, lineHeight: 18 },
  retryButton: { alignSelf: 'flex-start', marginTop: 8, paddingVertical: 5 },
  retryText: { color: '#9F2D25', fontSize: 12, fontWeight: '800' },
  warningCard: { padding: 12, borderRadius: 12, backgroundColor: '#FFF8D9' },
  warningText: { color: '#6C5600', fontSize: 11, lineHeight: 16 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  loadingText: { color: '#77766F', fontSize: 11 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10, padding: 1 },
  statCard: { width: '48%', minHeight: 124, justifyContent: 'space-between', padding: 14, borderWidth: 1, borderColor: '#DEDED9', borderRadius: 17, backgroundColor: '#FFFFFF' },
  statCard_white: { backgroundColor: '#FFFFFF' },
  statCard_yellow: { backgroundColor: '#FFC400', borderColor: '#FFC400' },
  statCard_skyBlue: { backgroundColor: '#38BDF8', borderColor: '#38BDF8' },
  statCard_blue: { backgroundColor: '#3267D6', borderColor: '#3267D6' },
  statCard_green: { backgroundColor: '#35B775', borderColor: '#35B775' },
  statTop: { minHeight: 49, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  statLabel: { maxWidth: 74, color: '#77766F', fontSize: 10, lineHeight: 13 },
  statText_dark: { color: '#202020' },
  statText_light: { color: '#FFFFFF' },
  taskStatArt: { width: 52, height: 45, marginTop: -7, marginRight: -7 },
  dueStatArt: { width: 76, height: 66, marginTop: -16, marginRight: -16 },
  statValue: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  statNumber: { color: '#202020', fontSize: 28, lineHeight: 31, fontWeight: '800', letterSpacing: -1 },
  statMeta: { color: '#8C8B84', fontSize: 9 },
  card: { padding: 18, borderWidth: 1, borderColor: '#DEDED9', borderRadius: 20, backgroundColor: '#FFFFFF', shadowColor: '#302F29', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.04, shadowRadius: 20, elevation: 1 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardKicker: { color: '#8C8B84', fontSize: 10, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase' },
  cardTitle: { marginTop: 3, color: '#202020', fontSize: 16, fontWeight: '800', letterSpacing: -0.5 },
  roundArrow: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: '#202020' },
  meetingSchedule: { gap: 8, marginTop: 17 },
  meetingRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, paddingLeft: 11, paddingRight: 8, borderRadius: 13, backgroundColor: '#F6F6F3' },
  meetingEmptyState: { gap: 4, marginTop: 17, padding: 14, borderRadius: 15, backgroundColor: '#F6F6F3' },
  calendarArt: { width: 36, height: 38, alignItems: 'center', overflow: 'hidden', borderWidth: 1, borderColor: '#E4E4E7', borderRadius: 6, backgroundColor: '#FFFFFF', shadowColor: '#202020', shadowOffset: { width: 1, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 1 },
  calendarMonthTab: { width: '100%', height: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E53935' },
  calendarMonth: { color: '#FFFFFF', fontSize: 5, lineHeight: 7, fontWeight: '800', letterSpacing: 0.2 },
  calendarDateArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  calendarDate: { color: '#202020', fontSize: 15, lineHeight: 17, fontWeight: '700' },
  meetingCopy: { flex: 1, minWidth: 0 },
  meetingTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  meetingDateText: { maxWidth: 82, color: '#202020', fontSize: 12, lineHeight: 14, fontWeight: '700', textAlign: 'right' },
  meetingTitle: { color: '#202020', fontSize: 12, fontWeight: '700' },
  meetingDescription: { marginTop: 4, color: '#85847D', fontSize: 10, lineHeight: 14 },
  meetingPeople: { flexDirection: 'row', alignItems: 'center', marginTop: 9, paddingLeft: 5 },
  avatarOverlap: { marginLeft: -5, borderWidth: 2, borderColor: '#F6F6F3', borderRadius: 99 },
  tinyAvatar: { alignItems: 'center', justifyContent: 'center' },
  memberImage: { width: '100%', height: '100%', borderRadius: 99 },
  tinyAvatarText: { color: '#FFFFFF', fontSize: 6, fontWeight: '800' },
  availability: { marginLeft: 7, color: '#84837C', fontSize: 8, fontWeight: '600' },
  teamRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14, borderWidth: 1, borderColor: '#DEDED9', borderRadius: 20, backgroundColor: '#FFFFFF', shadowColor: '#302F29', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.04, shadowRadius: 20, elevation: 1 },
  memberStack: { flexDirection: 'row', paddingLeft: 8 },
  memberOverlap: { marginLeft: -8, borderWidth: 2, borderColor: '#FFFFFF', borderRadius: 99 },
  memberAvatarText: { fontSize: 8 },
  scratchpadCard: { padding: 0, overflow: 'hidden' },
  scratchpadHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#ECECE8' },
  presence: { alignItems: 'flex-end', gap: 5 },
  presenceFaces: { flexDirection: 'row', paddingLeft: 5 },
  syncStatus: { color: '#E18618', fontSize: 9, fontWeight: '700' },
  syncStatusSaved: { color: '#24A765' },
  projectSelector: { marginHorizontal: 18, marginTop: 15, padding: 10, borderWidth: 1, borderColor: '#DEDED9', borderRadius: 11, backgroundColor: '#FAFAF8' },
  projectOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 7 },
  projectOption: { maxWidth: '100%', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8, backgroundColor: '#F0F0ED' },
  projectOptionSelected: { backgroundColor: '#FFF0B3' },
  projectLabel: { marginBottom: 2, color: '#999891', fontSize: 8, fontWeight: '600' },
  projectName: { color: '#30302D', fontSize: 11, fontWeight: '700' },
  projectNameSelected: { color: '#6C5600' },
  noteActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingHorizontal: 18, paddingVertical: 12 },
  noteAction: { flex: 1, alignItems: 'center', paddingHorizontal: 8, paddingVertical: 7, borderWidth: 1, borderColor: '#DEDED9', borderRadius: 8 },
  noteActionText: { color: '#5F5F59', fontSize: 9, fontWeight: '700' },
  notesField: { minHeight: 145, flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginHorizontal: 18, padding: 12, borderWidth: 1, borderColor: '#DEDED9', borderRadius: 13, backgroundColor: '#FAFAF8' },
  notesInput: { flex: 1, minHeight: 120, padding: 0, color: '#30302D', fontSize: 11, lineHeight: 17 },
  scratchpadFooter: { flexDirection: 'row', justifyContent: 'flex-end', gap: 9, paddingHorizontal: 18, paddingTop: 13, paddingBottom: 18 },
  clearButton: { height: 37, justifyContent: 'center', paddingHorizontal: 12 },
  clearText: { color: '#8C8B84', fontSize: 10, fontWeight: '800' },
  saveButton: { height: 37, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#202020' },
  saveText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  resourceCard: { gap: 0 },
  resourceHeading: { color: '#202020', fontSize: 14, lineHeight: 18, fontWeight: '800' },
  resourceDescription: { marginTop: 3, color: '#85847D', fontSize: 9, lineHeight: 13 },
  resourceList: { gap: 8, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#ECECF0' },
  resourceRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 9, paddingVertical: 7, borderWidth: 1, borderColor: '#E4E4E7', borderRadius: 9, backgroundColor: '#FAFAFB' },
  resourceLogoBox: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1, borderColor: '#E7E7EB', borderRadius: 7, backgroundColor: '#FFFFFF' },
  resourceFavicon: { width: 19, height: 19 },
  resourceFaviconFallback: { width: 19, height: 19, alignItems: 'center', justifyContent: 'center', borderRadius: 4, backgroundColor: '#F1F1F4' },
  resourceFaviconFallbackText: { color: '#555560', fontSize: 12, fontWeight: '700' },
  resourceDetails: { flex: 1, minWidth: 0, gap: 3 },
  resourceTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  resourceTitle: { flexShrink: 1, color: '#202020', fontSize: 10, fontWeight: '700' },
  resourceCategory: { maxWidth: 125, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden', borderRadius: 999, backgroundColor: '#EEEEF1', color: '#5D5D66', fontSize: 7, fontWeight: '700' },
  resourceSubtitle: { color: '#85847D', fontSize: 8, lineHeight: 11 },
  resourceEmpty: { marginTop: 12, color: '#85847D', fontSize: 10 },
  pressed: { opacity: 0.72 },
});
