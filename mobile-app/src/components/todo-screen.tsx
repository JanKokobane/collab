import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { firebaseAuth } from '@/lib/firebase';
import {
  fetchHomeMembers,
  fetchHomeProjects,
  fetchHomeTasks,
  HomeApiError,
  updateHomeTaskStatus,
  type HomeProject,
  type HomeTask,
  type HomeTaskAttachment,
} from '@/lib/homeApi';

type TaskFilter = 'All' | 'Today' | 'In progress' | 'Completed';
type IconName =
  | 'search'
  | 'calendar'
  | 'calendarSolid'
  | 'lock'
  | 'more'
  | 'chevron'
  | 'check'
  | 'close'
  | 'arrow'
  | 'arrowUp'
  | 'chevronDown'
  | 'folder'
  | 'select'
  | 'campaign'
  | 'tag'
  | 'users'
  | 'filterCalendar'
  | 'listCheck'
  | 'coloredTaskList'
  | 'doneCircle';

type Task = {
  id: string;
  projectId: string;
  title: string;
  project: string;
  sprint: string | null;
  updatedAt: string | null;
  priority: string;
  due: string | null;
  status: string;
  projectSprintsComplete: boolean;
  progress: number;
  category: string | null;
  tags: string[];
  description: string | null;
  attachments: HomeTaskAttachment[];
  assignee: string;
  assigneeFirebaseUid: string | null;
  assigneeProfileImage: string | null;
  createdBy: string;
  createdByFirebaseUid: string | null;
  createdByProfileImage: string | null;
  assignedSprintCount: number;
};

const filters: TaskFilter[] = ['Today', 'All', 'In progress', 'Completed'];
const filterCopy: Record<TaskFilter, { title: string; description: string }> = {
  All: { title: 'All', description: 'Available tasks' },
  Today: { title: 'Today', description: 'Due today' },
  'In progress': { title: 'In Progress', description: 'Tasks in progress' },
  Completed: { title: 'Completed', description: 'Complete tasks' },
};

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
    calendarSolid: (
      <Path
        d="M6 1h2v1H6zm10 0h2v1h-2zm6 4V4h-3V2h-1v5h-2V2h-1v2H9V2H8v5H6V2H5v2H2v1H1v17h1v1h20v-1h1V5zm-1 3v3h-3V8zm0 8h-3v-3h3zm0 5h-3v-3h3zM3 18h3v3H3zm0-5h3v3H3zm13 3h-3v-3h3zm-5 0H8v-3h3zm-3 2h3v3H8zm5 0h3v3h-3zm3-7h-3V8h3zm-5-3v3H8V8zm-5 3H3V8h3z"
        fill={color}
        stroke="none"
      />
    ),
    filterCalendar: (
      <>
        <Rect x="3.5" y="5" width="17" height="16" rx="2.5" strokeWidth={2.2} />
        <Path d="M8 3v4M16 3v4M4 10h16" strokeWidth={2.2} />
        <Circle cx="8" cy="14" r="1" fill={color} stroke="none" />
        <Circle cx="12" cy="14" r="1" fill={color} stroke="none" />
        <Circle cx="16" cy="14" r="1" fill={color} stroke="none" />
        <Circle cx="8" cy="18" r="1" fill={color} stroke="none" />
        <Circle cx="12" cy="18" r="1" fill={color} stroke="none" />
        <Circle cx="16" cy="18" r="1" fill={color} stroke="none" />
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
    chevronDown: <Path d="m6 9 6 6 6-6" />,
    check: <Path d="m5 12 4 4L19 6" />,
    close: <Path d="m6 6 12 12M18 6 6 18" />,
    arrow: <Path d="M5 12h14M13 6l6 6-6 6" />,
    arrowUp: <Path d="M12 19V5m-7 7 7-7 7 7" />,
    folder: <Path d="M3 6h7l2 2h9v11H3Z" />,
    select: (
      <Path
        d="M15 4H1c-.6 0-1 .4-1 1v6c0 .6.4 1 1 1h14c.6 0 1-.4 1-1V5c0-.6-.4-1-1-1m-3 5-2-2h4z"
        fill={color}
        stroke="none"
      />
    ),
    campaign: (
      <Path
        d="M17.923 12.5v-1h3.23v1zm1.085 6.462l-2.585-1.939l.623-.792l2.585 1.938zm-2.039-11.27l-.623-.792l2.585-1.939l.623.793zM5.5 17.962v-3.808H2.846V9.846h5.346L12.154 7.5v9l-3.962-2.346H6.5v3.808zm5.654-3.243V9.281l-2.681 1.565H3.846v2.308h4.627zm2.769.17V9.112q.502.465.809 1.222T15.038 12t-.306 1.666t-.809 1.222M7.5 12"
        fill={color}
        stroke="none"
      />
    ),
    tag: (
      <Path
        d="M20 2.007h-7.087a2 2 0 0 0-1.414.586l-8.906 8.906a2 2 0 0 0 0 2.828l7.086 7.086a2 2 0 0 0 2.828 0l8.906-8.906c.376-.374.587-.883.587-1.413V4.007a2 2 0 0 0-2-2M17.007 9a2 2 0 1 1-.001-3.999A2 2 0 0 1 17.007 9"
        fill={color}
        stroke="none"
      />
    ),
    users: (
      <Path
        d="M20.966 21.259c-.262.978-1.67.978-1.932 0L19 21v-1.971c-.05-1.736-1.293-2.979-3.029-3.029H8.029C6.293 16.05 5.05 17.293 5 19.029V21c-.03.451-.288.844-.741.966-.656.176-1.217-.327-1.259-.966v-2.029l.032-.553c.297-2.562 2.403-4.345 4.939-4.418h8.058c2.811.081 4.89 2.16 4.971 4.971V21ZM21 12c0 .352.096 1.102-.134 1.5c-.436.755-1.606.601-1.832-.241L19 13v-1c-.352 0-1.102.096-1.5-.134c-.755-.436-.601-1.606.241-1.832L18 10h1V9l.034-.259c.226-.842 1.396-.996 1.832-.241c.23.398.134 1.148.134 1.5h1l.259.034c.842.226.996 1.396.241 1.832c-.398.23-1.148.134-1.5.134m-9.582-.032a5.03 5.03 0 0 1-2.955-1.431A5.03 5.03 0 0 1 7.13 8.146c-.787-3.362 2.024-6.511 5.452-6.114a5.03 5.03 0 0 1 2.955 1.431a5.03 5.03 0 0 1 1.333 2.391c.787 3.362-2.024 6.511-5.452 6.114m.231-7.946a3 3 0 0 0-1.524.638c-2.339 1.876-.751 5.663 2.226 5.318a3 3 0 0 0 1.524-.638c2.339-1.876.751-5.663-2.226-5.318"
        fill={color}
        stroke="none"
      />
    ),
    listCheck: (
      <>
        <Circle cx="4" cy="6" r="1" fill={color} stroke="none" />
        <Circle cx="4" cy="12" r="1" fill={color} stroke="none" />
        <Circle cx="4" cy="18" r="1" fill={color} stroke="none" />
        <Path d="M9 6h11M9 12h11M9 18h11" />
      </>
    ),
    coloredTaskList: (
      <>
        <Path d="m1.5 4 1.5 1.5L6 2.5M1.5 12l1.5 1.5L6 10.5M1.5 20l1.5 1.5L6 18.5" stroke="#168FE5" strokeWidth={2.2} />
        <Rect x="9" y="2" width="14" height="4" rx="2" fill="#F97316" fillOpacity={0.2} stroke="#F97316" strokeWidth={1.5} />
        <Rect x="9" y="10" width="14" height="4" rx="2" fill="#EAB308" fillOpacity={0.2} stroke="#EAB308" strokeWidth={1.5} />
        <Rect x="9" y="18" width="14" height="4" rx="2" fill="#22C55E" fillOpacity={0.2} stroke="#22C55E" strokeWidth={1.5} />
      </>
    ),
    doneCircle: (
      <>
        <Circle cx="12" cy="12" r="10" fill="#22C55E" stroke="none" />
        <Path
          d="m6.5 12.2 3.6 3.6 7.6-7.6"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth={2.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    ),
  };

  return (
    <Svg
      accessibilityElementsHidden
      width={size}
      height={size}
      viewBox={name === 'select' ? '0 0 16 16' : '0 0 24 24'}
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

function formatTaskUpdatedAt(value: string | null) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatAttachmentSize(size: number | null) {
  if (size === null) return '';
  if (size < 1024) return `${size} B`;
  return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
}

function getAttachmentKind(attachment: HomeTaskAttachment) {
  if (attachment.isVoiceNote) return 'Voice note';
  const mediaType = attachment.mediaType.toLowerCase();
  if (mediaType.startsWith('video/')) return 'Video';
  if (mediaType.startsWith('image/')) return 'Image';
  if (mediaType.startsWith('audio/')) return 'Audio';
  return 'Document';
}

function isDueToday(value: string | null) {
  if (!value) return false;
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return !Number.isNaN(date.getTime()) && date.toDateString() === new Date().toDateString();
}

function formatTaskCardDueDate(value: string | null) {
  if (!value) return formatDueDate(value);
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return formatDueDate(value);

  const tomorrow = new Date();
  tomorrow.setHours(0, 0, 0, 0);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return date.toDateString() === tomorrow.toDateString()
    ? 'Tomorrow'
    : formatDueDate(value);
}

function getInitials(value: string | null | undefined) {
  if (typeof value !== 'string') return '';
  return value
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

function taskFromHomeTask(
  task: HomeTask,
  project: HomeProject,
  currentUserName: string,
): Task {
  const normalizedStatus = task.status.trim().toLowerCase();
  const taskCreator = project.acceptedMembers?.find(
    (member) => member.firebaseUid === task.createdByFirebaseUid,
  );
  const taskCreatorIsProjectOwner =
    task.createdByFirebaseUid === project.creatorFirebaseUid;
  const createdBy = task.createdByFirebaseUid === project.creatorFirebaseUid
    ? project.creatorName || project.creatorEmail
    : taskCreator?.name;
  return {
    id: task.id,
    projectId: task.projectId,
    title: task.title,
    project: project.name,
    sprint: task.sprintName || null,
    updatedAt: task.updatedAt || null,
    priority: task.priority || 'No priority',
    due: task.dueDate,
    status: task.status || 'To do',
    projectSprintsComplete: Boolean(
      project.sprints?.length &&
      project.sprints.every((sprint) => sprint.status === 'Completed')
    ),
    progress: normalizedStatus === 'done'
      ? 100
      : normalizedStatus === 'in progress' ? 50 : 0,
    category: task.category || null,
    tags: task.tags || [],
    description: task.description || null,
    attachments: task.descriptionAttachments || [],
    assignee: task.assigneeName || task.assigneeEmail || currentUserName,
    assigneeFirebaseUid: task.assigneeFirebaseUid || null,
    assigneeProfileImage: task.assigneeProfileImage || null,
    createdBy: createdBy || project.creatorName || project.creatorEmail || 'Project owner',
    createdByFirebaseUid: task.createdByFirebaseUid || null,
    createdByProfileImage: taskCreatorIsProjectOwner
      ? project.creatorProfileImage || null
      : taskCreator?.profileImage || project.creatorProfileImage || null,
    assignedSprintCount: project.sprints?.filter(
      (sprint) => sprint.assigneeFirebaseUid === task.assigneeFirebaseUid,
    ).length || 0,
  };
}

function formatTaskCountdown(remainingMs: number) {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${hours}h ${minutes}m ${seconds}s`;
}

function getLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function TaskCountdown({ due, status }: { due: string | null; status: string }) {
  const [now, setNow] = useState(Date.now);
  const normalizedStatus = status.trim().toLowerCase();
  const dueDateKey = due?.slice(0, 10) || '';
  const deadline = due
    ? new Date(`${dueDateKey}T23:59:59`).getTime()
    : Number.NaN;
  const isOverdue = Number.isFinite(deadline) &&
    (dueDateKey < getLocalDateKey(new Date(now)) || deadline <= now);
  const hasCountdown = Number.isFinite(deadline) &&
    normalizedStatus !== 'done';

  useEffect(() => {
    if (!hasCountdown || isOverdue) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [hasCountdown, isOverdue, due]);

  if (!hasCountdown) return null;

  if (normalizedStatus === 'blocked' && !isOverdue) return null;

  const label = isOverdue
    ? 'OVERDUE'
    : formatTaskCountdown(deadline - now);
  return (
    <Text
      accessibilityLabel={isOverdue ? 'Task overdue' : `Time remaining: ${label}`}
      numberOfLines={1}
      style={[styles.taskCountdown, isOverdue && styles.taskCountdownOverdue]}>
      {label}
    </Text>
  );
}

function TaskCard({
  task,
  onOpen,
  onAdvance,
  busy,
  isOnlyTask,
}: {
  task: Task;
  onOpen: () => void;
  onAdvance: () => void;
  busy: boolean;
  isOnlyTask: boolean;
}) {
  const status = task.status.trim().toLowerCase();
  const done = status === 'done';
  const inProgress = status === 'in progress';

  return (
    <View
      style={[
        styles.taskCard,
        isOnlyTask && styles.taskCardFirst,
        done && styles.taskCardDone,
      ]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View details for ${task.title}`}
        onPress={onOpen}
        style={styles.cardMain}>
        <View style={styles.taskTitleRow}>
          <View style={styles.taskTitleIcon}>
            <Icon name="campaign" size={20} color="#000000" />
          </View>
          <Text
            numberOfLines={2}
            style={[
              styles.taskTitle,
              styles.taskTitleShift,
              done && styles.taskTitleDone,
            ]}>
            {task.title}
          </Text>
          <TaskCountdown due={task.due} status={task.status} />
        </View>

        {task.description ? (
          <View style={styles.taskDescriptionContainer}>
            <Text numberOfLines={4} style={styles.taskDescription}>
              {task.description}
            </Text>
          </View>
        ) : null}

        <View style={styles.taskMeta}>
          <View
            style={[
              styles.taskMetaPill,
              isDueToday(task.due) && styles.dueToday,
            ]}>
            <Icon
              name="calendarSolid"
              size={15}
              color="#929292"
            />
            <Text
              style={[
                styles.taskMetaText,
                isDueToday(task.due) && styles.dueTodayText,
              ]}>
              {formatTaskCardDueDate(task.due)}
            </Text>
          </View>

          <View style={styles.metaIcons}>
            <View style={styles.metaIconButton}>
              <Icon name="listCheck" size={17} color="#858585" />
            </View>
            <View style={styles.metaIconButton}>
              <Icon name="tag" size={17} color="#858585" />
            </View>
            <View style={styles.metaIconButton}>
              <Icon name="users" size={17} color="#858585" />
            </View>
          </View>
        </View>
      </Pressable>

      <View style={styles.cardFooter}>
        <Text
          accessibilityLabel={`${task.assignedSprintCount} sprints assigned`}
          numberOfLines={1}
          style={styles.sprintCount}>
          {`Sprints assigned: ${task.assignedSprintCount}`}
        </Text>

        <View
          accessibilityLabel={`Project ${task.project}`}
          style={styles.assigneeRow}>
          <Text numberOfLines={1} style={styles.assigneeName}>{task.project}</Text>
          <Icon name="chevronDown" size={13} color="#858585" />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={done ? 'Task completed' : inProgress ? 'Finish task' : 'Start task'}
          disabled={busy}
          onPress={onAdvance}
          style={[
            styles.statusButton,
            inProgress && styles.statusButtonInProgress,
            done && styles.statusButtonDone,
          ]}>
          {busy ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : done ? (
            <Icon name="check" size={17} color="#BEBEBE" />
          ) : (
            <Icon name="arrow" size={19} color="#FFFFFF" />
          )}
        </Pressable>
      </View>
    </View>
  );
}

export default function TodoScreen({ onOpenMenu }: { onOpenMenu: () => void }) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
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
  const [profileImagesByUid, setProfileImagesByUid] = useState<Record<string, string>>({});

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
  const selectedCreatorProfileImage = selectedTask
    ? (selectedTask.createdByFirebaseUid
      ? profileImagesByUid[selectedTask.createdByFirebaseUid]
      : undefined) ?? selectedTask.createdByProfileImage
    : null;
  const selectedAssigneeProfileImage = selectedTask
    ? (selectedTask.assigneeFirebaseUid
      ? profileImagesByUid[selectedTask.assigneeFirebaseUid]
      : undefined) ?? selectedTask.assigneeProfileImage
    : null;

  useEffect(() => {
    if (!selectedTaskId) return undefined;
    let active = true;

    async function refreshTaskModalProfiles() {
      try {
        const members = await fetchHomeMembers();
        if (!active) return;
        setProfileImagesByUid((current) => ({
          ...current,
          ...Object.fromEntries(members.map((member) => [member.id, member.profileImage || ''])),
        }));
      } catch (error) {
        console.error('Unable to refresh task modal profile pictures:', error);
      }
    }

    void refreshTaskModalProfiles();
    return () => { active = false; };
  }, [selectedTaskId]);

  async function nextStatus(task: Task) {
    if (busyTaskId) return;
    const currentStatus = task.status.trim().toLowerCase();
    const status = currentStatus === 'done'
      ? 'To do'
      : currentStatus === 'in progress' ? 'Done' : 'In progress';
    const progress = status === 'Done'
      ? 100
      : status === 'In progress' ? Math.max(task.progress, 25) : 0;

    if (currentStatus === 'in progress' && !task.projectSprintsComplete) {
      setLoadError('This in-progress task cannot be moved until every project sprint is complete.');
      return;
    }

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
        {loadError ? (
          <View style={styles.loadErrorBanner}>
            <Text style={styles.loadErrorText}>{loadError}</Text>
          </View>
        ) : null}
        {warning ? <Text style={styles.warningText}>{warning}</Text> : null}

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

        <ScrollView
          horizontal
          style={styles.filterTabsScroll}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterTabs}
          accessibilityLabel="Filter tasks">
            {filters.map((item) => {
              const { title, description } = filterCopy[item];
              const isActive = filter === item;

              return (
                <Pressable
                  key={item}
                  accessibilityRole="button"
                  accessibilityLabel={`${title}: ${description}`}
                  accessibilityState={{ selected: isActive }}
                  onPress={() => setFilter(item)}
                  style={({ pressed }) => [
                    styles.filterButton,
                    isActive && styles.filterButtonActive,
                    pressed && styles.filterButtonPressed,
                  ]}>
                  <View
                    style={[
                      styles.filterButtonContent,
                      styles.allFilterButtonContent,
                    ]}>
                    <View style={styles.filterIconContainer}>
                      {item === 'Today' ? (
                        <Image
                          source={require('../../assets/images/today-filter-sliders.png')}
                          style={styles.todayFilterIcon}
                          resizeMode="contain"
                        />
                      ) : null}
                      {item === 'All' ? (
                        <Image
                          source={require('../../assets/images/all-tasks-planner.png')}
                          style={styles.allFilterIcon}
                          resizeMode="contain"
                        />
                      ) : null}
                      {item === 'In progress' ? (
                        <Image
                          source={require('../../assets/images/in-progress-laptop.png')}
                          style={styles.progressFilterIcon}
                          resizeMode="contain"
                        />
                      ) : null}
                      {item === 'Completed' ? (
                        <Image
                          source={require('../../assets/images/completed-party-popper.png')}
                          style={styles.completedFilterIcon}
                          resizeMode="contain"
                        />
                      ) : null}
                    </View>
                    <View
                      style={[
                        styles.filterButtonDivider,
                        item === 'In progress' && styles.progressDividerOffset,
                      ]}
                    />
                    <View
                      style={[
                        styles.filterButtonText,
                        item === 'In progress' && styles.progressTextOffset,
                      ]}>
                      <Text
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        allowFontScaling={false}
                        style={[
                          styles.filterButtonTitle,
                          isActive && styles.filterButtonTitleActive,
                        ]}>
                        {title}
                      </Text>
                      <Text
                        numberOfLines={2}
                        adjustsFontSizeToFit
                        minimumFontScale={0.65}
                        allowFontScaling={false}
                        style={[
                          styles.filterButtonDescription,
                          isActive && styles.filterButtonDescriptionActive,
                        ]}>
                        {description}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
        </ScrollView>

        <View style={styles.taskSection}>
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
                  isOnlyTask={visibleTasks.length === 1}
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
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setSelectedTaskId(null)}>
        {selectedTask ? (
          <View style={styles.modalBackdrop}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close task details"
              onPress={() => setSelectedTaskId(null)}
              style={StyleSheet.absoluteFill}
            />
            <View
              style={[
                styles.taskDetailsCard,
                { height: windowHeight },
                { paddingBottom: Math.max(insets.bottom, 12) },
              ]}>
              <View style={styles.detailsHeader}>
                <View style={styles.modalBrand}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Open menu"
                    onPress={onOpenMenu}
                    style={styles.menuButton}>
                    <Svg width={30} height={30} viewBox="0 0 24 24" fill="none">
                      <Path
                        d="M3.75 6h16.5M3.75 18h16.5m-16.5-6h10.5"
                        stroke="#29292D"
                        strokeWidth={1.5}
                        strokeLinecap="square"
                        strokeMiterlimit={2}
                      />
                    </Svg>
                  </Pressable>
                  <Image
                    source={require('../../assets/images/logo.png')}
                    resizeMode="contain"
                    style={styles.modalLogo}
                    accessibilityLabel="Collab"
                  />
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close task details"
                  onPress={() => setSelectedTaskId(null)}
                  style={styles.closeButton}>
                  <Text style={styles.closeIcon}>×</Text>
                </Pressable>
              </View>
              <ScrollView
                style={styles.detailsScroll}
                contentContainerStyle={styles.detailsContent}
                showsVerticalScrollIndicator={false}>
                <View style={styles.titleSection}>
                  <Text style={styles.detailTitle}>{selectedTask.title}</Text>
                  <Text style={styles.detailProject}>
                    {[selectedTask.project, selectedTask.sprint]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>

                <View style={styles.metadataSection}>
                  <View style={styles.metadataRow}>
                    <Text style={styles.metadataLabel}>Created by</Text>
                    <View style={styles.metadataValueContainer}>
                      <View style={styles.creatorAvatar}>
                        {selectedCreatorProfileImage ? (
                          <Image
                            source={{ uri: selectedCreatorProfileImage }}
                            style={styles.creatorAvatarImage}
                            accessibilityLabel={`${selectedTask.createdBy} profile picture`}
                          />
                        ) : (
                          <Text style={styles.creatorAvatarText}>
                            {getInitials(selectedTask.createdBy) || '?'}
                          </Text>
                        )}
                      </View>
                      <Text style={styles.metadataValue}>
                        {selectedTask.createdBy || 'Project owner'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.metadataRow}>
                    <Text style={styles.metadataLabel}>Assignee</Text>
                    <View style={styles.metadataValueContainer}>
                      <View style={styles.creatorAvatar}>
                        {selectedAssigneeProfileImage ? (
                          <Image
                            source={{ uri: selectedAssigneeProfileImage }}
                            style={styles.creatorAvatarImage}
                            accessibilityLabel={`${selectedTask.assignee} profile picture`}
                          />
                        ) : (
                          <Text style={styles.creatorAvatarText}>
                            {getInitials(selectedTask.assignee) || '?'}
                          </Text>
                        )}
                      </View>
                      <Text style={styles.metadataValue}>
                        {selectedTask.assignee || 'You'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.metadataRow}>
                    <Text style={styles.metadataLabel}>Last modified</Text>
                    <View style={styles.metadataValueContainer}>
                      <Text style={styles.metadataIcon}>▦</Text>
                      <Text style={styles.metadataValue}>
                        {formatTaskUpdatedAt(selectedTask.updatedAt)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.metadataRow}>
                    <Text style={styles.metadataLabel}>Due date</Text>
                    <View style={styles.metadataValueContainer}>
                      <Icon name="calendar" size={16} color="#59665F" />
                      <Text style={styles.metadataValue}>
                        {formatDueDate(selectedTask.due)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.metadataRow}>
                    <Text style={styles.metadataLabel}>Tags</Text>
                    <View style={styles.tagsContainer}>
                      {selectedTask.tags.length ? (
                        selectedTask.tags.map((tag) => (
                          <Text key={tag} style={styles.categoryTag}>{tag}</Text>
                        ))
                      ) : (
                        <Text style={styles.metadataMuted}>No tags</Text>
                      )}
                    </View>
                  </View>

                  <View style={styles.metadataRow}>
                    <Text style={styles.metadataLabel}>Priority</Text>
                    <View style={styles.priorityBadge}>
                      <Text style={styles.priorityText}>
                        # {selectedTask.priority || 'Normal'}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.descriptionSection}>
                  <Text style={styles.sectionLabel}>Description</Text>
                  <Text style={styles.descriptionText}>
                    {selectedTask.description || 'No description provided.'}
                  </Text>
                </View>

                <View style={styles.attachmentSection}>
                  <Text style={styles.sectionLabel}>
                    Attachments ({selectedTask.attachments.length})
                  </Text>
                  {selectedTask.attachments.length ? (
                    selectedTask.attachments.map((attachment, index) => {
                      const size = formatAttachmentSize(attachment.size);
                      return (
                        <View key={`${attachment.fileName}-${index}`} style={styles.taskAttachment}>
                          <Text numberOfLines={1} style={styles.taskAttachmentName}>
                            {attachment.fileName}
                          </Text>
                          <Text style={styles.taskAttachmentDetails}>
                            {[getAttachmentKind(attachment), size].filter(Boolean).join(' · ')}
                          </Text>
                        </View>
                      );
                    })
                  ) : (
                    <Text style={styles.metadataMuted}>No attachments available.</Text>
                  )}
                </View>

                <Pressable
                  accessibilityRole="button"
                  disabled={busyTaskId === selectedTask.id}
                  onPress={() => { void nextStatus(selectedTask); }}
                  style={[
                    styles.primaryAction,
                    busyTaskId === selectedTask.id && styles.primaryActionDisabled,
                  ]}>
                  {busyTaskId === selectedTask.id ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <Text style={styles.primaryActionText}>
                        {selectedTask.status.trim().toLowerCase() === 'done'
                          ? 'Reopen task'
                          : selectedTask.status.trim().toLowerCase() === 'in progress'
                            ? 'Mark as complete'
                            : 'Start task'}
                      </Text>
                      <Icon
                        name={selectedTask.status.trim().toLowerCase() === 'in progress'
                          ? 'check'
                          : 'arrow'}
                        size={18}
                        color="#FFFFFF"
                      />
                    </>
                  )}
                </Pressable>

                <View style={styles.assignedTasksSection}>
                  <View style={styles.assignedTasksHeading}>
                    <Text style={styles.assignedTasksTitle}>
                      Your assigned tasks
                    </Text>
                    <Text style={styles.assignedTasksCount}>{tasks.length}</Text>
                  </View>
                  {tasks.length ? tasks.map((task) => (
                    <Pressable
                      key={`${task.projectId}:${task.id}`}
                      accessibilityRole="button"
                      accessibilityLabel={`View ${task.title}, ${task.status}, ${task.project}`}
                      accessibilityState={{ selected: task.id === selectedTask.id }}
                      onPress={() => setSelectedTaskId(task.id)}
                      style={[
                        styles.assignedTaskItem,
                        task.id === selectedTask.id && styles.assignedTaskItemSelected,
                      ]}>
                      <View
                        style={[
                          styles.taskStatusDot,
                          task.status.trim().toLowerCase() === 'done'
                            ? styles.statusDotDone
                            : task.status.trim().toLowerCase() === 'in progress'
                              ? styles.statusDotInProgress
                              : styles.statusDotDefault,
                        ]}
                      />
                      <View style={styles.assignedTaskCopy}>
                        <Text numberOfLines={1} style={styles.assignedTaskTitle}>
                          {task.title}
                        </Text>
                        <Text numberOfLines={1} style={styles.assignedTaskProject}>
                          {task.project}
                        </Text>
                      </View>
                      <Text style={styles.assignedTaskStatus}>{task.status}</Text>
                      <Text style={styles.assignedTaskArrow}>›</Text>
                    </Pressable>
                  )) : (
                    <Text style={styles.assignedTasksEmpty}>
                      No tasks are currently assigned to you.
                    </Text>
                  )}
                </View>
              </ScrollView>
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
  searchBox: { minHeight: 48, marginTop: 20, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: '#D8DFDA', borderRadius: 50, backgroundColor: '#FFFFFF' },
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
  filterTabsScroll: { height: 54, flexGrow: 0, flexShrink: 0 },
  filterTabs: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 4 },
  filterButton: {
    position: 'relative',
    width:75,
    height: 30,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 2,
    borderWidth: 1,
    borderColor: '#E0E4DF',
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    shadowColor: '#090A0E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.9,
    shadowRadius: 0,
    elevation: 5,
  },
  filterButtonActive: {
    borderColor: '#333333',
    backgroundColor: '#333333',
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.95,
    shadowRadius: 1,
    elevation: 7,
  },
  filterButtonPressed: {
    opacity: 0.96,
    transform: [{ translateY: 2 }],
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  filterButtonContent: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3 },
  allFilterButtonContent: { transform: [{ translateX: 5 }] },
  filterIconContainer: { width: 13, alignItems: 'center', justifyContent: 'center' },
  todayFilterIcon: { width: 13, height: 13 },
  allFilterIcon: { width: 13, height: 13 },
  completedFilterIcon: { width: 13, height: 13 },
  progressFilterIcon: { width: 13, height: 13 },
  filterButtonDivider: { width: 1, height: 16, backgroundColor: 'rgba(190,198,219,0.42)' },
  progressDividerOffset: { transform: [{ translateX: -1 }] },
  filterButtonText: { flex: 1, minWidth: 0, gap: 0 },
  progressTextOffset: { transform: [{ translateX: -1 }] },
  filterButtonTitle: { color: '#26352F', fontSize: 7, lineHeight: 8, fontWeight: '700' },
  filterButtonTitleActive: { color: '#FFFFFF' },
  filterButtonDescription: { color: '#79827E', fontSize: 5.5, lineHeight: 6, fontWeight: '400' },
  filterButtonDescriptionActive: { color: '#FFFFFF' },
  taskSection: { gap: 13, marginTop: 0 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 9, paddingHorizontal: 2, marginBottom: -30, marginTop: -25 },
  sectionTitleCopy: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  sectionTitle: { color: '#26352F', fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  taskCount: { color: '#98A09C', fontSize: 12 },
  sectionActions: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  searchAction: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E0E4DF', borderRadius: 999, backgroundColor: '#FFFFFF' },
  sortButton: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 8 },
  sortText: { color: '#79827E', fontSize: 12, fontWeight: '700' },
  sortChevronUp: { transform: [{ rotate: '-90deg' }] },
  taskList: { gap: 13 },
  taskCard: {
    minHeight: 200,
    paddingHorizontal: 15,
    paddingTop: 15,
    paddingBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 9 },
    shadowOpacity: 0.42,
    shadowRadius: 14,
    elevation: 5,
  },
  taskCardFirst: { transform: [{ translateY: -175 }] },
  taskCardDone: { opacity: 1 },
  cardMain: { flex: 1 },
  taskTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  taskTitleIcon: { transform: [{ translateY: -5 }] },
  taskTitleShift: { transform: [{ translateX: -7 }] },
  taskTitle: {
    flex: 1,
    marginTop: -2,
    color: '#555555',
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  taskCountdown: {
    flexShrink: 0,
    marginTop: 1,
    color: '#777777',
    fontSize: 9,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  taskCountdownOverdue: { color: '#B91C1C' },
  taskTitleDone: { color: '#898989', textDecorationLine: 'line-through' },
  taskDescriptionContainer: {
    marginTop: 0,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#D9D9D9',
  },
  taskDescription: {
    color: '#A6A6A6',
    fontSize: 11,
    lineHeight: 15,
  },
  taskMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 'auto',
    paddingTop: 13,
  },
  taskMetaPill: {
    minHeight: 27,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    borderRadius: 999,
    backgroundColor: '#242424',
  },
  taskMetaText: { color: '#D0D0D0', fontSize: 10, fontWeight: '700' },
  dueToday: { backgroundColor: '#333333' },
  dueTodayText: { color: '#FF4D4F' },
  metaIcons: { flexDirection: 'row', alignItems: 'center', gap: 14, marginLeft: 'auto' },
  metaIconButton: {
    width: 18,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sprintCount: {
    position: 'absolute',
    left: 0,
    top: 8,
    bottom: 0,
    width: '32%',
    textAlignVertical: 'center',
    minWidth: 0,
    color: '#666666',
    fontSize: 9,
    fontWeight: '700',
    textAlign: 'left',
  },
  cardFooter: {
    position: 'relative',
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#D9D9D9',
  },
  assigneeRow: {
    position: 'absolute',
    left: '25%',
    top: 8,
    bottom: 0,
    width: '50%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minWidth: 0,
  },
  assigneeName: { maxWidth: '75%', flexShrink: 1, color: '#666666', fontSize: 11, fontWeight: '600' },
  avatarRing: {
    width: 36,
    height: 36,
    overflow: 'hidden',
    textAlign: 'center',
    textAlignVertical: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    borderRadius: 19,
    color: '#FFFFFF',
    backgroundColor: '#285F50',
    fontSize: 9,
    fontWeight: '800',
    lineHeight: 32,
  },
  statusButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: '#F0444F',
  },
  statusButtonInProgress: { backgroundColor: '#F0444F' },
  statusButtonDone: { backgroundColor: '#D6D6D6' },
  emptyState: { alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 40, paddingHorizontal: 22, borderWidth: 1, borderStyle: 'dashed', borderColor: '#D8DEDA', borderRadius: 17, backgroundColor: '#FFFFFF' },
  emptyIcon: { width: 54, height: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 27, backgroundColor: '#EAF4EF' },
  emptyTitle: { marginTop: 13, color: '#35433D', fontSize: 16, fontWeight: '800' },
  emptyDescription: { marginTop: 4, color: '#82908A', fontSize: 12, lineHeight: 17, textAlign: 'center' },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: 'rgba(24,35,29,0.42)',
  },
  taskDetailsCard: {
    width: '100%',
    overflow: 'hidden',
    borderRadius: 0,
    backgroundColor: '#FFFFFF',
    paddingTop: 22,
    paddingHorizontal: 20,
    shadowColor: '#17241D',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 25,
    elevation: 12,
  },
  detailsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 27,
  },
  modalBrand: { flexDirection: 'row', alignItems: 'center' },
  menuButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 2,
    borderRadius: 10,
  },
  modalLogo: { width: 116, height: 35, marginLeft: -18 },
  closeButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: '#F7F8F6',
  },
  closeIcon: { color: '#64716A', fontSize: 27, lineHeight: 30 },
  detailsScroll: { flex: 1 },
  detailsContent: { paddingBottom: 24, gap: 23 },
  titleSection: { gap: 13 },
  statusDot: { width: 9, height: 9, borderRadius: 5 },
  statusDotDone: { backgroundColor: '#35A765' },
  statusDotInProgress: { backgroundColor: '#3185E8' },
  statusDotDefault: { backgroundColor: '#B7BFBA' },
  detailProject: { color: '#858C87', fontSize: 13, fontWeight: '600' },
  detailTitle: {
    color: '#171B18',
    fontSize: 29,
    lineHeight: 36,
    fontWeight: '800',
    letterSpacing: -0.9,
  },
  metadataSection: { gap: 8 },
  metadataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    minHeight: 25,
    columnGap: 12,
    rowGap: 7,
  },
  metadataLabel: { width: 83, color: '#858C87', fontSize: 12, fontWeight: '500' },
  metadataValueContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  metadataValue: { flexShrink: 1, color: '#202622', fontSize: 12, fontWeight: '700' },
  metadataIcon: { color: '#59665F', fontSize: 17, fontWeight: '700' },
  creatorAvatar: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 10,
    backgroundColor: '#DCEBE4',
  },
  creatorAvatarImage: { width: '100%', height: '100%' },
  creatorAvatarText: { color: '#245D4D', fontSize: 9, fontWeight: '800' },
  metadataMuted: { color: '#9BA29D', fontSize: 12, fontWeight: '500' },
  tagsContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  categoryTag: {
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#EAF3EF',
    color: '#376B5B',
    fontSize: 11,
    fontWeight: '700',
  },
  priorityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#E8F4FB',
  },
  priorityText: { color: '#2385C8', fontSize: 11, fontWeight: '800' },
  descriptionSection: { gap: 11 },
  sectionLabel: { color: '#858C87', fontSize: 12, fontWeight: '600' },
  descriptionText: { color: '#272D29', fontSize: 13, lineHeight: 22, fontWeight: '400' },
  attachmentSection: { gap: 9 },
  taskAttachment: {
    gap: 3,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#F6F7F5',
  },
  taskAttachmentName: { color: '#34433D', fontSize: 12, fontWeight: '700' },
  taskAttachmentDetails: { color: '#858C87', fontSize: 10, fontWeight: '500' },
  primaryAction: {
    minHeight: 49,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 3,
    borderRadius: 13,
    backgroundColor: '#245D4D',
  },
  primaryActionDisabled: { opacity: 0.65 },
  primaryActionText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  assignedTasksSection: {
    gap: 14,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: '#EDF0ED',
  },
  assignedTasksHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  assignedTasksTitle: { color: '#202820', fontSize: 16, fontWeight: '800' },
  assignedTasksCount: {
    minWidth: 27,
    height: 27,
    textAlign: 'center',
    textAlignVertical: 'center',
    overflow: 'hidden',
    borderRadius: 15,
    backgroundColor: '#EEF1EF',
    color: '#40504A',
    fontSize: 12,
    fontWeight: '800',
  },
  assignedTaskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 58,
    paddingVertical: 7,
  },
  assignedTaskItemSelected: {
    backgroundColor: '#F7F9F7',
    borderRadius: 10,
    paddingHorizontal: 7,
  },
  taskStatusDot: { width: 10, height: 10, borderRadius: 6 },
  assignedTaskCopy: { flex: 1, gap: 3 },
  assignedTaskTitle: { color: '#242C26', fontSize: 12, fontWeight: '700' },
  assignedTaskProject: { color: '#8A938D', fontSize: 11 },
  assignedTaskStatus: { color: '#527565', fontSize: 10, fontWeight: '700' },
  assignedTaskArrow: { color: '#89918C', fontSize: 22 },
  assignedTasksEmpty: { color: '#929A95', fontSize: 12 },
});