import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
  const upcomingMeeting = meetings
    .filter((meeting) => new Date(
      `${meeting.date.slice(0, 10)}T${meeting.startTime || '00:00:00'}`,
    ) >= date)
    .sort((left, right) => (
      `${left.date.slice(0, 10)}T${left.startTime}`.localeCompare(
        `${right.date.slice(0, 10)}T${right.startTime}`,
      )
    ))[0];
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
        <View style={styles.emptyMeeting}>
          {upcomingMeeting ? (
          <View style={styles.calendarArt}>
            <View style={styles.calendarRings} />
            <Text style={styles.calendarDate}>{new Date(`${upcomingMeeting.date.slice(0, 10)}T00:00:00`).getDate().toString().padStart(2, '0')}</Text>
          </View>
          ) : (
          <View style={styles.calendarArt}>
            <View style={styles.calendarRings} />
            <Text style={styles.calendarDate}>{date.getDate().toString().padStart(2, '0')}</Text>
          </View>
          )}
          <View style={styles.meetingCopy}>
            <Text style={styles.meetingTitle}>
              {loading ? 'Loading meetings…' : upcomingMeeting?.title || 'No meetings scheduled'}
            </Text>
            <Text style={styles.meetingDescription}>
              {upcomingMeeting
                ? `${new Date(`${upcomingMeeting.date.slice(0, 10)}T00:00:00`).toLocaleDateString()}${upcomingMeeting.startTime ? ` · ${upcomingMeeting.startTime.slice(0, 5)}` : ''} · ${upcomingMeeting.projectName}`
                : loading ? 'Checking your project calendars.' : 'Your project calendars are clear. A perfect time to focus.'}
            </Text>
            <View style={styles.meetingPeople}>
              <Text style={styles.availability}>
                {upcomingMeeting ? `From ${upcomingMeeting.projectName}` : `${members.length} team ${members.length === 1 ? 'member' : 'members'}`}
              </Text>
            </View>
          </View>
        </View>
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

      <View style={[styles.card, styles.scratchpadCard]}>
        <View style={styles.scratchpadHeader}>
          <View>
            <Text style={styles.cardKicker}>Shared space</Text>
            <Text style={styles.cardTitle}>Team scratchpad</Text>
          </View>
          <View style={styles.presence}>
            <Text style={[styles.syncStatus, notesSaved && styles.syncStatusSaved]}>
              {notesSaving ? 'Saving…' : notesSaved ? 'Synced' : 'Unsaved'}
            </Text>
          </View>
        </View>

        <View style={styles.projectSelector}>
          <Text style={styles.projectLabel}>PROJECT</Text>
          {projects.length > 0 ? (
            <View style={styles.projectOptions}>
              {projects.map((project) => (
                <Pressable
                  accessibilityRole="button"
                  disabled={notesSaving}
                  accessibilityState={{ selected: project.id === selectedProjectId }}
                  key={project.id}
                  onPress={() => onProjectSelect(project.id)}
                  style={[
                    styles.projectOption,
                    project.id === selectedProjectId && styles.projectOptionSelected,
                  ]}>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.projectName,
                      project.id === selectedProjectId && styles.projectNameSelected,
                    ]}>
                    {project.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={styles.projectName}>{loading ? 'Loading projects…' : 'No projects available'}</Text>
          )}
        </View>

        <View style={styles.noteActions}>
          <Pressable disabled={notesLoading || notesSaving || !notesLoaded} style={styles.noteAction} onPress={() => insertNote('☐ ')}>
            <Text style={styles.noteActionText}>+ Checklist</Text>
          </Pressable>
          <Pressable disabled={notesLoading || notesSaving || !notesLoaded} style={styles.noteAction} onPress={() => insertNote('• ')}>
            <Text style={styles.noteActionText}>+ Bullet</Text>
          </Pressable>
          <Pressable disabled={notesLoading || notesSaving || !notesLoaded} style={styles.noteAction} onPress={() => insertNote('`code` ')}>
            <Text style={styles.noteActionText}>+ Code</Text>
          </Pressable>
        </View>

        <View style={styles.notesField}>
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
            <Path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" stroke="#8B8A84" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
          <TextInput
            accessibilityLabel="Team notes"
            multiline
            textAlignVertical="top"
            value={notes}
            onChangeText={onNotesChange}
            editable={notesLoaded && !notesLoading}
            placeholder="Capture sprint targets, decisions, or quick team notes..."
            placeholderTextColor="#A09F98"
            style={styles.notesInput}
          />
        </View>

        <View style={styles.scratchpadFooter}>
          <Pressable
            accessibilityRole="button"
            disabled={notesLoading || notesSaving || !notesLoaded}
            onPress={() => onNotesChange('')}
            style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}>
            <Text style={styles.clearText}>Clear</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={notesSaving || notesLoading || !notesLoaded || !selectedProjectId}
            onPress={onSaveNotes}
            style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}>
            <Text style={styles.saveText}>{notesSaving ? 'Saving…' : 'Save notes'}</Text>
          </Pressable>
        </View>
      </View>

      <View style={[styles.card, styles.resourceCard]}>
        <View style={styles.resourceIcon}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Path d="m12 17-5 5v-7L3 11l4-4 4 4h7l-5 5" stroke="#826600" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </View>
        <View style={styles.resourceCopy}>
          <Text style={styles.cardTitle}>Pinned resources</Text>
          <Text style={styles.resourceDescription}>
            {resources.length > 0
              ? `Pinned across ${new Set(resources.map((resource) => resource.projectName)).size} ${new Set(resources.map((resource) => resource.projectName)).size === 1 ? 'project' : 'projects'}.`
              : loading ? 'Loading project resources…' : 'No pinned resources yet.'}
          </Text>
          <View style={styles.resourceChips}>
            {resources.slice(0, 3).map((resource) => (
              <Text key={resource.id} numberOfLines={1} style={styles.resourceChip}>{resource.title}</Text>
            ))}
            {resources.length > 3 && <Text style={styles.resourceChip}>+{resources.length - 3}</Text>}
          </View>
        </View>
        <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
          <Path d="m9 18 6-6-6-6" stroke="#77766F" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
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
  emptyMeeting: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 17, padding: 14, borderRadius: 15, backgroundColor: '#F6F6F3' },
  calendarArt: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#202020', borderRadius: 13, backgroundColor: '#FFC400', shadowColor: '#202020', shadowOffset: { width: 2, height: 2 }, shadowOpacity: 1, shadowRadius: 0, elevation: 2 },
  calendarRings: { position: 'absolute', top: 7, width: 25, height: 2, backgroundColor: '#202020' },
  calendarDate: { paddingTop: 5, color: '#202020', fontSize: 18, fontWeight: '800' },
  meetingCopy: { flex: 1 },
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
  resourceCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  resourceIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#FFF4C2' },
  resourceCopy: { flex: 1 },
  resourceDescription: { marginTop: 3, color: '#85847D', fontSize: 9, lineHeight: 13 },
  resourceChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 9 },
  resourceChip: { paddingHorizontal: 7, paddingVertical: 4, overflow: 'hidden', borderRadius: 999, backgroundColor: '#F2F2EE', color: '#65645E', fontSize: 7, fontWeight: '800' },
  pressed: { opacity: 0.72 },
});
