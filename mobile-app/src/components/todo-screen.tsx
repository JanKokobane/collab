import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { firebaseAuth } from '@/lib/firebase';
import {
  fetchHomeProjects,
  fetchHomeTasks,
  HomeApiError,
  updateHomeTaskStatus,
  type HomeProject,
  type HomeTask,
} from '@/lib/homeApi';

type TaskFilter = 'All' | 'Today' | 'In progress' | 'Completed';
type IconName =
  | 'search'
  | 'calendar'
  | 'lock'
  | 'more'
  | 'chevron'
  | 'check'
  | 'close'
  | 'arrow'
  | 'folder';

type Task = {
  id: string;
  projectId: string;
  title: string;
  project: string;
  sprint: string | null;
  priority: string;
  due: string | null;
  status: string;
  progress: number;
  category: string | null;
  description: string | null;
  assignee: string;
};

const filters: TaskFilter[] = ['All', 'Today', 'In progress', 'Completed'];

function Icon({
  name,
  size = 20,
  color = '#65706B',
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  const paths: Record<IconName, ReactNode> = {
    search: (
      <>
        <Circle cx="11" cy="11" r="7" />
        <Path d="m20 20-4-4" />
      </>
    ),
    calendar: (
      <>
        <Rect x="3" y="5" width="18" height="16" rx="2" />
        <Path d="M16 3v4M8 3v4M3 10h18" />
      </>
    ),
    lock: (
      <>
        <Rect x="5" y="10" width="14" height="11" rx="2" />
        <Path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
    more: (
      <>
        <Circle cx="5" cy="12" r="1.2" fill={color} stroke="none" />
        <Circle cx="12" cy="12" r="1.2" fill={color} stroke="none" />
        <Circle cx="19" cy="12" r="1.2" fill={color} stroke="none" />
      </>
    ),
    chevron: <Path d="m9 18 6-6-6-6" />,
    check: <Path d="m5 12 4 4L19 6" />,
    close: <Path d="m6 6 12 12M18 6 6 18" />,
    arrow: <Path d="M5 12h14M13 6l6 6-6 6" />,
    folder: <Path d="M3 6h7l2 2h9v11H3Z" />,
  };

  return (
    <Svg
      accessibilityElementsHidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round">
      {paths[name]}
    </Svg>
  );
}

function formatDueDate(value: string | null) {
  if (!value) return 'No due date';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  if (date.toDateString() === new Date().toDateString()) return 'Today';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function isDueToday(value: string | null) {
  if (!value) return false;
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return !Number.isNaN(date.getTime()) && date.toDateString() === new Date().toDateString();
}

function taskFromHomeTask(
  task: HomeTask,
  project: HomeProject,
  currentUserName: string,
): Task {
  const normalizedStatus = task.status.trim().toLowerCase();
  return {
    id: task.id,
    projectId: task.projectId,
    title: task.title,
    project: project.name,
    sprint: task.sprintName || null,
    priority: task.priority || 'No priority',
    due: task.dueDate,
    status: task.status || 'To do',
    progress: normalizedStatus === 'done'
      ? 100
      : normalizedStatus === 'in progress' ? 50 : 0,
    category: task.category || null,
    description: task.description || null,
    assignee: task.assigneeName || task.assigneeEmail || currentUserName,
  };
}

function formatDateHeading() {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function TaskCard({
  task,
  onOpen,
  onAdvance,
  busy,
}: {
  task: Task;
  onOpen: () => void;
  onAdvance: () => void;
  busy: boolean;
}) {
  const done = task.status.trim().toLowerCase() === 'done';

  return (
    <View style={[styles.taskCard, done && styles.taskCardDone]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View details for ${task.title}`}
        onPress={onOpen}
        style={styles.cardMain}>
        <View style={styles.cardTop}>
          <View style={styles.taskPills}>
            {task.category ? (
              <Text style={styles.estimatePill}>{task.category}</Text>
            ) : null}
            <Text style={[
              styles.priorityPill,
              task.priority.toLowerCase() === 'high' && styles.priorityHigh,
              task.priority.toLowerCase() === 'low' && styles.priorityLow,
            ]}>
              {task.priority} priority
            </Text>
          </View>
          <View style={styles.moreButton}>
            <Icon name="more" size={22} color="#9AA19D" />
          </View>
        </View>
        <Text style={[styles.taskTitle, done && styles.taskTitleDone]}>{task.title}</Text>
        <View style={styles.projectName}>
          <Icon name="folder" size={17} color="#8A938E" />
          <Text style={styles.projectNameText}>{task.project}</Text>
        </View>
        <View style={styles.taskMeta}>
          <View style={[styles.taskMetaPill, isDueToday(task.due) && styles.dueToday]}>
            <Icon
              name="calendar"
              size={18}
              color={isDueToday(task.due) ? '#A24740' : '#7E8682'}
            />
            <Text style={[styles.taskMetaText, isDueToday(task.due) && styles.dueTodayText]}>
              {formatDueDate(task.due)}
            </Text>
          </View>
          <View style={styles.sprintPill}>
            <Icon name="lock" size={17} color="#3C705E" />
            <Text style={styles.sprintText}>{task.sprint || 'No sprint'}</Text>
          </View>
        </View>
      </Pressable>

      <View style={styles.cardFooter}>
        <View accessibilityLabel={`Assigned to ${task.assignee}`} style={styles.assignee}>
          <Text style={styles.avatarRing}>
            {task.assignee.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')}
          </Text>
          <View style={styles.statusDot} />
        </View>
        <View
          accessibilityLabel={`${task.progress}% complete`}
          style={styles.taskProgress}>
          <View style={[styles.taskProgressFill, { width: `${task.progress}%` }]} />
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={onAdvance}
          style={[
            styles.statusButton,
            done && styles.statusButtonDone,
            task.status.trim().toLowerCase() === 'in progress' && styles.statusButtonInProgress,
          ]}>
          {busy ? (
            <ActivityIndicator size="small" color="#397B69" />
          ) : done ? (
            <Icon name="check" size={17} color="#4D655D" />
          ) : (
            <Text style={styles.statusButtonText}>
              {task.status.trim().toLowerCase() === 'in progress' ? 'Finish' : 'Start'}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

export default function TodoScreen() {
  const insets = useSafeAreaInsets();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [warning, setWarning] = useState('');
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [filter, setFilter] = useState<TaskFilter>('All');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [dueDateAscending, setDueDateAscending] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;

    async function loadAssignedTasks() {
      const currentUser = firebaseAuth.currentUser;
      if (!currentUser) {
        setLoadError('Sign in to see tasks assigned to you.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError('');
      setWarning('');
      try {
        const projects = await fetchHomeProjects();
        const results = await Promise.allSettled(
          projects.map(async (project) => ({
            project,
            tasks: await fetchHomeTasks(project, true),
          })),
        );
        if (!active) return;

        const loadedTasks: Task[] = [];
        let failedProjects = 0;
        let successfulProjects = 0;
        for (const result of results) {
          if (result.status === 'rejected') {
            failedProjects += 1;
            continue;
          }
          successfulProjects += 1;
          loadedTasks.push(...result.value.tasks
            .filter((task) => task.assigneeFirebaseUid === currentUser.uid)
            .map((task) => taskFromHomeTask(
              task,
              result.value.project,
              currentUser.displayName?.trim() || currentUser.email || 'You',
            )));
        }

        if (failedProjects > 0 && successfulProjects === 0) {
          throw new HomeApiError('Your assigned tasks could not be loaded. Please try again later.', 502);
        }
        setTasks(loadedTasks);
        if (failedProjects > 0) {
          setWarning(`Tasks from ${failedProjects} project${failedProjects === 1 ? '' : 's'} could not be loaded.`);
        }
      } catch (error) {
        console.error('Unable to load tasks assigned to the signed-in user:', error);
        if (active) {
          setLoadError(error instanceof HomeApiError
            ? error.message
            : 'Your assigned tasks could not be loaded. Please try again.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadAssignedTasks();
    return () => { active = false; };
  }, []);

  const visibleTasks = useMemo(() => {
    const filtered = tasks.filter((task) => {
      const status = task.status.trim().toLowerCase();
      const matchesFilter = filter === 'All'
        || (filter === 'Today' && isDueToday(task.due))
        || (filter === 'In progress' && status === 'in progress')
        || (filter === 'Completed' && status === 'done');
      const searchableContent = `${task.title} ${task.project} ${task.category}`.toLowerCase();
      return matchesFilter && searchableContent.includes(query.trim().toLowerCase());
    });

    if (dueDateAscending === null) return filtered;
    return filtered.sort((first, second) => {
      if (!first.due) return 1;
      if (!second.due) return -1;
      const dueDateOrder = first.due.localeCompare(second.due);
      return dueDateAscending ? dueDateOrder : -dueDateOrder;
    });
  }, [dueDateAscending, filter, query, tasks]);

  const openCount = tasks.filter((task) => task.status.trim().toLowerCase() !== 'done').length;
  const doneCount = tasks.length - openCount;
  const completionPercent = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) || null;

  async function nextStatus(task: Task) {
    if (busyTaskId) return;
    const currentStatus = task.status.trim().toLowerCase();
    const status = currentStatus === 'done'
      ? 'To do'
      : currentStatus === 'in progress' ? 'Done' : 'In progress';
    const progress = status === 'Done'
      ? 100
      : status === 'In progress' ? Math.max(task.progress, 25) : 0;

    setBusyTaskId(task.id);
    setLoadError('');
    try {
      await updateHomeTaskStatus({
        id: task.id,
        projectId: task.projectId,
      }, status);
      setTasks((current) => current.map((item) => (
        item.id === task.id ? { ...item, status, progress } : item
      )));
    } catch (error) {
      console.error('Unable to update assigned task status:', error);
      setLoadError(error instanceof HomeApiError
        ? error.message
        : 'Task status could not be updated. Please try again.');
    } finally {
      setBusyTaskId(null);
    }
  }

  function toggleSearch() {
    setSearchOpen((open) => !open);
    setQuery('');
  }

  return (
    <>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.taskContent,
          { paddingBottom: Math.max(insets.bottom, 24) + 24 },
        ]}
        keyboardShouldPersistTaps="handled">
        <View style={styles.welcomeRow}>
          <View style={styles.welcomeCopy}>
            <Text style={styles.dateLabel}>{formatDateHeading().toUpperCase()}</Text>
            <Text style={styles.heading}>My tasks</Text>
            <Text style={styles.welcomeSubtitle}>
              Stay focused on the work assigned to you.
            </Text>
          </View>
          <View style={styles.weekBadge}>
            <Text style={styles.weekBadgeNumber}>{openCount}</Text>
            <Text style={styles.weekBadgeLabel}>OPEN</Text>
          </View>
        </View>

        {loadError ? (
          <View style={styles.loadErrorBanner}>
            <Text style={styles.loadErrorText}>{loadError}</Text>
          </View>
        ) : null}
        {warning ? <Text style={styles.warningText}>{warning}</Text> : null}

        {searchOpen ? (
          <View style={styles.searchBox}>
            <Icon name="search" size={18} />
            <TextInput
              accessibilityLabel="Search your tasks"
              autoFocus
              value={query}
              onChangeText={setQuery}
              placeholder="Search your tasks"
              placeholderTextColor="#7F8A84"
              returnKeyType="search"
              style={styles.searchInput}
            />
            {query ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear task search"
                onPress={() => setQuery('')}
                style={styles.clearSearchButton}>
                <Icon name="close" size={16} />
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <View style={styles.progressCard}>
          <View style={styles.progressHeading}>
            <Text style={styles.progressEyebrow}>TASK PROGRESS</Text>
            <Text style={styles.progressComplete}>
              {tasks.length === 0
                ? 'No tasks yet'
                : openCount === 0
                  ? 'All caught up'
                  : `${openCount} remaining`}
            </Text>
          </View>
          <View style={styles.progressMain}>
            <View style={styles.progressCount}>
              <Text style={styles.progressTitle}>{doneCount}</Text>
              <Text style={styles.progressMeta}>/ {tasks.length} tasks</Text>
            </View>
            <View style={styles.progressPercentBadge}>
              <Text style={styles.progressPercent}>{completionPercent}%</Text>
            </View>
          </View>
          <View
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: completionPercent }}
            style={styles.weeklyTrack}>
            <View style={[styles.weeklyTrackFill, { width: `${completionPercent}%` }]} />
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterTabs}
          accessibilityLabel="Filter tasks">
          {filters.map((item) => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: filter === item }}
              key={item}
              onPress={() => setFilter(item)}
              style={[styles.filterButton, filter === item && styles.filterButtonActive]}>
              <Text style={[styles.filterText, filter === item && styles.filterTextActive]}>
                {item}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.taskSection}>
          <View style={styles.sectionTitleRow}>
            <View style={styles.sectionTitleCopy}>
              <Text style={styles.sectionTitle}>
                {filter === 'All' ? 'Assigned to me' : filter}
              </Text>
              <Text style={styles.taskCount}>
                {visibleTasks.length} task{visibleTasks.length === 1 ? '' : 's'}
              </Text>
            </View>
            <View style={styles.sectionActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={searchOpen ? 'Close task search' : 'Search tasks'}
                onPress={toggleSearch}
                style={styles.searchAction}>
                <Icon name="search" size={16} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Sort by due date${dueDateAscending === null
                  ? ''
                  : `, currently ${dueDateAscending ? 'ascending' : 'descending'}`}`}
                onPress={() => setDueDateAscending((ascending) => ascending === null || !ascending)}
                style={styles.sortButton}>
                <Text style={styles.sortText}>Due date</Text>
                <View style={dueDateAscending === true && styles.sortChevronUp}>
                  <Icon name="chevron" size={14} color="#79827E" />
                </View>
              </Pressable>
            </View>
          </View>

          {loading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator color="#245D4D" />
              <Text style={styles.emptyDescription}>Loading your assigned tasks...</Text>
            </View>
          ) : (
            <View style={styles.taskList}>
              {visibleTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  busy={busyTaskId === task.id}
                  onOpen={() => setSelectedTaskId(task.id)}
                  onAdvance={() => { void nextStatus(task); }}
                />
              ))}
              {visibleTasks.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIcon}>
                  <Icon name="check" size={24} color="#39816C" />
                </View>
                <Text style={styles.emptyTitle}>
                  {tasks.length === 0 ? 'No tasks assigned to you' : 'No tasks here'}
                </Text>
                <Text style={styles.emptyDescription}>
                  {tasks.length === 0
                    ? 'Tasks assigned to your account will appear here.'
                    : 'You’re clear for this view. Try another filter.'}
                </Text>
              </View>
              ) : null}
            </View>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={selectedTask !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedTaskId(null)}>
        {selectedTask ? (
          <View style={styles.modalBackdrop}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close task details"
              onPress={() => setSelectedTaskId(null)}
              style={StyleSheet.absoluteFill}
            />
            <View style={[
              styles.taskDrawer,
              { paddingBottom: Math.max(insets.bottom, 23) },
            ]}>
              <View style={styles.drawerHandle} />
              <View style={styles.drawerHeader}>
                <Text style={[
                  styles.detailStatus,
                  selectedTask.status === 'Done' && styles.detailStatusDone,
                ]}>
                  {selectedTask.status}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close task details"
                  onPress={() => setSelectedTaskId(null)}
                  style={styles.drawerCloseButton}>
                  <Icon name="close" size={20} color="#6F7A75" />
                </Pressable>
              </View>
              <Text style={styles.detailProject}>
                {[selectedTask.project, selectedTask.sprint].filter(Boolean).join(' · ')}
              </Text>
              <Text style={styles.detailTitle}>{selectedTask.title}</Text>
              <Text style={styles.detailDescription}>
                {selectedTask.description || 'No description provided.'}
              </Text>
              <View style={styles.detailGrid}>
                <View style={styles.detailField}>
                  <Text style={styles.detailLabel}>DUE DATE</Text>
                  <View style={styles.detailValueRow}>
                    <Icon name="calendar" size={15} color="#40504A" />
                    <Text style={styles.detailValue}>{formatDueDate(selectedTask.due)}</Text>
                  </View>
                </View>
                <View style={styles.detailField}>
                  <Text style={styles.detailLabel}>PRIORITY</Text>
                  <Text style={styles.detailValue}>{selectedTask.priority}</Text>
                </View>
                <View style={styles.detailField}>
                  <Text style={styles.detailLabel}>SPRINT</Text>
                  <Text style={styles.detailValue}>{selectedTask.sprint || 'No sprint'}</Text>
                </View>
                <View style={styles.detailField}>
                  <Text style={styles.detailLabel}>CATEGORY</Text>
                  <Text style={styles.detailValue}>{selectedTask.category || 'General'}</Text>
                </View>
              </View>
              <View style={styles.assignedRow}>
                <Text style={[styles.avatarRing, styles.avatarRingLarge]}>AM</Text>
                <View style={styles.assignedCopy}>
                  <Text style={styles.detailLabel}>ASSIGNED TO</Text>
                  <Text style={styles.assignedName}>{selectedTask.assignee}</Text>
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                disabled={busyTaskId === selectedTask.id}
                onPress={() => { void nextStatus(selectedTask); }}
                style={styles.primaryAction}>
                {busyTaskId === selectedTask.id
                  ? <ActivityIndicator color="#FFFFFF" />
                  : <Text style={styles.primaryActionText}>
                    {selectedTask.status.trim().toLowerCase() === 'done'
                    ? 'Reopen task'
                    : selectedTask.status.trim().toLowerCase() === 'in progress'
                      ? 'Mark as complete'
                      : 'Start task'}
                  </Text>}
                {busyTaskId !== selectedTask.id ? (
                  <Icon
                    name={selectedTask.status.trim().toLowerCase() === 'in progress' ? 'check' : 'arrow'}
                    size={18}
                    color="#FFFFFF"
                  />
                ) : null}
              </Pressable>
            </View>
          </View>
        ) : null}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F8F5' },
  taskContent: { flexGrow: 1, gap: 22, paddingHorizontal: 3, paddingTop: 24 },
  welcomeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  welcomeCopy: { flex: 1 },
  dateLabel: { marginBottom: 7, color: '#939B96', fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  heading: { color: '#17352D', fontSize: 31, lineHeight: 36, fontWeight: '800', letterSpacing: -1.2 },
  welcomeSubtitle: { marginTop: 8, color: '#77817C', fontSize: 14, lineHeight: 20 },
  weekBadge: { width: 60, height: 60, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#DBE3DD', borderRadius: 18, backgroundColor: '#EDF6F1' },
  weekBadgeNumber: { color: '#255F50', fontSize: 21, lineHeight: 24, fontWeight: '800' },
  weekBadgeLabel: { marginTop: 3, color: '#73847D', fontSize: 10, fontWeight: '700' },
  searchBox: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: '#D8DFDA', borderRadius: 12, backgroundColor: '#FFFFFF' },
  searchInput: { flex: 1, minWidth: 0, paddingVertical: 9, color: '#26352F', fontSize: 14 },
  clearSearchButton: { padding: 6 },
  progressCard: {
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
  progressHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressEyebrow: { color: '#202020', fontSize: 11, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase' },
  progressComplete: { paddingHorizontal: 8, paddingVertical: 5, overflow: 'hidden', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.34)', color: '#202020', fontSize: 9, fontWeight: '800' },
  progressMain: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 15 },
  progressCount: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  progressTitle: { color: '#202020', fontSize: 44, lineHeight: 48, fontWeight: '800', letterSpacing: -3 },
  progressMeta: { color: '#202020', fontSize: 12, fontWeight: '700' },
  progressPercentBadge: { width: 54, height: 54, alignItems: 'center', justifyContent: 'center', borderWidth: 6, borderColor: '#202020', borderRadius: 27, backgroundColor: 'rgba(255,255,255,0.32)' },
  progressPercent: { color: '#202020', fontSize: 9, fontWeight: '800' },
  weeklyTrack: { height: 5, marginTop: 17, overflow: 'hidden', borderRadius: 999, backgroundColor: 'rgba(32,32,32,0.18)' },
  weeklyTrackFill: { height: '100%', borderRadius: 999, backgroundColor: '#202020' },
  loadErrorBanner: { padding: 13, borderRadius: 11, backgroundColor: '#FFF0EF' },
  loadErrorText: { color: '#9F2D25', fontSize: 13, lineHeight: 19 },
  warningText: { color: '#806700', fontSize: 13, lineHeight: 19 },
  filterTabs: { gap: 8, paddingBottom: 4 },
  filterButton: { height: 40, justifyContent: 'center', paddingHorizontal: 15, borderWidth: 1, borderColor: '#DFE3DF', borderRadius: 999, backgroundColor: '#FFFFFF' },
  filterButtonActive: { borderColor: '#224C40', backgroundColor: '#224C40' },
  filterText: { color: '#747D78', fontSize: 12, fontWeight: '700' },
  filterTextActive: { color: '#FFFFFF' },
  taskSection: { gap: 13, marginTop: -4 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 9 },
  sectionTitleCopy: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  sectionTitle: { color: '#26352F', fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  taskCount: { color: '#98A09C', fontSize: 12 },
  sectionActions: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  searchAction: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E0E4DF', borderRadius: 999, backgroundColor: '#FFFFFF' },
  sortButton: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 8 },
  sortText: { color: '#79827E', fontSize: 12, fontWeight: '700' },
  sortChevronUp: { transform: [{ rotate: '-90deg' }] },
  taskList: { gap: 13 },
  taskCard: { paddingHorizontal: 17, paddingTop: 17, paddingBottom: 15, borderWidth: 1, borderColor: '#E0E4E0', borderRadius: 17, backgroundColor: '#FFFFFF' },
  taskCardDone: { opacity: 0.72 },
  cardMain: { gap: 0 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  taskPills: { flexDirection: 'row', gap: 7 },
  estimatePill: { overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, color: '#5C42D0', backgroundColor: '#F0EDFF', fontSize: 11, lineHeight: 14, fontWeight: '800' },
  priorityPill: { overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, color: '#6F746F', backgroundColor: '#F1F2F0', fontSize: 11, lineHeight: 14, fontWeight: '800' },
  priorityHigh: { color: '#A64039', backgroundColor: '#FDEBEA' },
  priorityLow: { color: '#34745F', backgroundColor: '#E8F5EF' },
  moreButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  taskTitle: { maxWidth: 300, marginTop: 9, marginBottom: 7, color: '#242C28', fontSize: 17, lineHeight: 23, fontWeight: '800', letterSpacing: -0.3 },
  taskTitleDone: { color: '#8B938F', textDecorationLine: 'line-through' },
  projectName: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  projectNameText: { color: '#8A938E', fontSize: 12 },
  taskMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 13 },
  taskMetaPill: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#F6F7F5' },
  taskMetaText: { color: '#7E8682', fontSize: 11, fontWeight: '600' },
  dueToday: { backgroundColor: '#FFF0EE' },
  dueTodayText: { color: '#A24740' },
  sprintPill: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#EAF3EF' },
  sprintText: { color: '#3C705E', fontSize: 11, fontWeight: '600' },
  cardFooter: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 13, marginTop: 14, paddingTop: 13, borderTopWidth: 1, borderTopColor: '#EDF0ED' },
  assignee: { position: 'relative', flexShrink: 0 },
  avatarRing: { width: 36, height: 36, overflow: 'hidden', textAlign: 'center', textAlignVertical: 'center', borderWidth: 2, borderColor: '#FFFFFF', borderRadius: 19, color: '#FFFFFF', backgroundColor: '#285F50', fontSize: 9, fontWeight: '800', lineHeight: 32 },
  statusDot: { position: 'absolute', right: -1, bottom: 0, width: 10, height: 10, borderWidth: 2, borderColor: '#FFFFFF', borderRadius: 6, backgroundColor: '#38A579' },
  taskProgress: { flex: 1, height: 7, overflow: 'hidden', borderRadius: 999, backgroundColor: '#E6E8E6' },
  taskProgressFill: { height: '100%', borderRadius: 999, backgroundColor: '#55A087' },
  statusButton: { minWidth: 62, height: 36, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 11, borderRadius: 8, backgroundColor: '#EAF3EF' },
  statusButtonInProgress: { backgroundColor: '#EAF3EF' },
  statusButtonDone: { backgroundColor: '#F0F2F0' },
  statusButtonText: { color: '#326D5C', fontSize: 11, fontWeight: '800' },
  emptyState: { alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 40, paddingHorizontal: 22, borderWidth: 1, borderStyle: 'dashed', borderColor: '#D8DEDA', borderRadius: 17, backgroundColor: '#FFFFFF' },
  emptyIcon: { width: 54, height: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 27, backgroundColor: '#EAF4EF' },
  emptyTitle: { marginTop: 13, color: '#35433D', fontSize: 16, fontWeight: '800' },
  emptyDescription: { marginTop: 4, color: '#82908A', fontSize: 12, lineHeight: 17, textAlign: 'center' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(21,35,29,0.42)' },
  taskDrawer: { gap: 15, paddingTop: 11, paddingHorizontal: 22, borderTopLeftRadius: 26, borderTopRightRadius: 26, backgroundColor: '#FFFFFF' },
  drawerHandle: { width: 36, height: 4, alignSelf: 'center', marginBottom: 4, borderRadius: 99, backgroundColor: '#DCE1DD' },
  drawerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  detailStatus: { overflow: 'hidden', paddingHorizontal: 11, paddingVertical: 8, borderRadius: 8, color: '#376B5B', backgroundColor: '#EAF3EF', fontSize: 11, fontWeight: '800' },
  detailStatusDone: { color: '#507166', backgroundColor: '#EEF2EF' },
  drawerCloseButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E1E5E1', borderRadius: 20, backgroundColor: '#FFFFFF' },
  detailProject: { marginTop: 4, color: '#84908A', fontSize: 11, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase' },
  detailTitle: { color: '#1D302A', fontSize: 27, lineHeight: 33, fontWeight: '800', letterSpacing: -0.7 },
  detailDescription: { marginTop: -2, color: '#6F7A75', fontSize: 14, lineHeight: 21 },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  detailField: { width: '47%', minHeight: 70, justifyContent: 'center', gap: 6, padding: 13, borderRadius: 11, backgroundColor: '#F6F7F5' },
  detailLabel: { color: '#939B97', fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  detailValueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailValue: { color: '#40504A', fontSize: 13, fontWeight: '700' },
  assignedRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 2, paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#EDF0ED' },
  avatarRingLarge: { width: 42, height: 42, borderRadius: 23, fontSize: 10, lineHeight: 38 },
  assignedCopy: { gap: 4 },
  assignedName: { color: '#34433D', fontSize: 13, fontWeight: '700' },
  primaryAction: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 12, backgroundColor: '#245D4D' },
  primaryActionText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
});
