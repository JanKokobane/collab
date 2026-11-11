import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { firebaseAuth } from '@/lib/firebase';
import {
  fetchHomeMembers,
  fetchHomeProjects,
  fetchHomeTaskAttachment,
  fetchHomeTaskDetails,
  fetchHomeTasks,
  HomeApiError,
  submitHomeTaskSprint,
  updateHomeTaskStatus,
  type HomeProject,
  type HomeTask,
  type HomeTaskAttachment,
  type HomeTaskSprintSubmissionAttachment,
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
  | 'download'
  | 'play'
  | 'pause'
  | 'chevronDown'
  | 'folder'
  | 'mic'
  | 'stop'
  | 'webPhone'
  | 'select'
  | 'campaign'
  | 'tag'
  | 'users'
  | 'filterCalendar'
  | 'listCheck'
  | 'coloredTaskList'
  | 'doneCircle'
  | 'workUpdate';

type Task = {
  id: string;
  projectId: string;
  title: string;
  project: string;
  sprint: string | null;
  sprintSubmissionStatus: string;
  sprintSubmissionNote: string;
  sprintSubmissionLinks: string[];
  sprintSubmissionAttachments: HomeTaskSprintSubmissionAttachment[];
  sprintSubmittedAt: string | null;
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

type SprintSubmissionAttachment = {
  fileName: string;
  mediaType: string;
  size: number;
  data: string;
  is_voice_note?: boolean;
};

const maxSprintSubmissionBytes = 100 * 1024 * 1024;
const maxSprintSubmissionAttachments = 10;
const supportedSprintSubmissionMediaType =
  /^(image\/(?!svg\+xml(?:$|;))[a-z0-9.+-]+|audio\/[a-z0-9.+-]+|video\/[a-z0-9.+-]+|application\/(pdf|msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)|vnd\.ms-(excel|powerpoint)|vnd\.oasis\.opendocument\.(text|spreadsheet|presentation))|text\/(plain|csv))$/;

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
    download: <Path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4" />,
    play: <Path d="m8 5 11 7-11 7z" fill={color} stroke="none" />,
    pause: <Path d="M14 19V5h4v14zm-8 0V5h4v14z" fill={color} stroke="none" />,
    folder: (
      <Path
        d="M2.75 7.25v-2.5h7.1l.6.8L11.55 7l.6.8h9.1v11.45H2.75v-2.5Zm0 3.5h18.5"
        strokeWidth={1.5}
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    ),
    mic: (
      <Path
        d="M600 0C268.629 0 0 268.629 0 600s268.629 600 600 600s600-268.629 600-600S931.371 0 600 0m-21.021 209.766v115.723h42.848V209.766c19.77 1.616 39.348 5.557 58.374 11.353v104.37h42.847v-87.305c18.649 9.283 36.453 20.498 52.734 33.984c.086.072.133.148.22.22v427.515c-.086.071-.133.147-.22.22c-48.755 40.238-111.174 63.33-175.781 63.354c-63.145-.121-126.043-22.153-175.781-63.354c-.086-.071-.133-.147-.22-.22V272.388c.086-.072.134-.148.22-.22c16.394-13.529 34.421-24.923 53.467-34.351v87.671h42.921V220.825c18.905-5.721 38.452-9.506 58.371-11.059M339.771 551.367h50.537v193.726c57.225 46.73 130.172 74.78 209.692 74.78s152.469-28.05 209.692-74.78V551.367h50.536v218.921c-15.686 14.476-32.614 27.604-50.536 39.331c-41.29 27.015-87.999 46.312-138.208 55.811v71.191h84.521v53.613h-312.01v-53.613h84.521V865.43c-50.209-9.499-96.918-28.796-138.208-55.811c-17.922-11.727-34.852-24.855-50.537-39.331zM528.516 865.43c23.147 4.379 47.067 6.665 71.484 6.665s48.337-2.286 71.484-6.665v-25.269H528.516z"
        fill={color}
        stroke="none"
      />
    ),
    stop: <Path d="M6 18V6h12v12z" fill={color} stroke="none" />,
    webPhone: (
      <>
        <Path
          d="M23.396 11.994c-.18 1.289-.52 3.387-.88 5.385c-.998 5.754-1.128 5.205-1.048 5.135c-.65.44-5.994-.09-7.493-1.18c0 .13-.24-.519.89-6.992c.888-5.145.998-4.645 1.737-4.705c0 .799 0 1.788.63 2.108a9.7 9.7 0 0 0 4.156.919c.56-.25.809-.75 1.578-1.898l.48.21a.342.342 0 1 0 .31-.61c-1.55-.83-7.643-2.497-8.602-1.099c-.959 1.399-2.557 10.989-2.308 12.338a1.64 1.64 0 0 0 .95.999c1.628.829 7.372 1.838 8.47.559c.49-.56 1.65-10.34 1.729-11.059a.305.305 0 1 0-.6-.11m-1.12-1.518c-.279.29-.569.69-.868.999s-.31.2-.5.16l-3.227-.8l-.19-1.228c1.627.096 3.235.399 4.786.899zm-7.64-8.881a24 24 0 0 1 2.867 1.998c.52.496.99 1.045 1.398 1.638c1.2 1.739 1 2.319 1.48 2.169a.31.31 0 0 0 .19-.4c-.73-3.106-1.999-4.195-3.627-5.094c-.75-.4-1.578-.79-1.998-1a.378.378 0 0 0-.31.69m-3.447 17.981c-3.576.2-9.69-2.238-9.99-8.092C.818 6.37 5.414.346 11.778.935a.302.302 0 0 0 .07-.599C6.562-.384 2.636 2.574.617 7.57a8.99 8.99 0 0 0 3.587 10.889a12.5 12.5 0 0 0 6.993 1.808a.35.35 0 0 0-.01-.69"
          fill={color}
          stroke="none"
        />
        <Path
          d="M18.001 5.081c-.999 0-2.308-.16-3.766-.28a7.5 7.5 0 0 0-.87-1.927a.3.3 0 0 0-.569.18q.045.83.21 1.648c-4.995-.37-5.105-.06-4.995-.23a6.4 6.4 0 0 1 1.998-2.677c.14-.45-.53-.48-1.129 0a7.5 7.5 0 0 0-1.988 2.767q-1.144.018-2.277.19c-.9.15-.74.849-.07.819a16 16 0 0 1 1.998 0a19.8 19.8 0 0 0-.79 4.296c-1.178 0-2.367-.08-3.366-.11s-.91.55-.12.799q1.681.306 3.387.44c-.056 1.239.065 2.48.36 3.686c-.78-.07-1.59-.09-2.748-.21c-.949.21-.33.859.58.999c3.766.889 1.918-.36 3.186 1.858q.264.457.58.879c.5.59 1.138.82.999 0a7.3 7.3 0 0 1-1.23-2.258c1.443.072 2.889.042 4.327-.09a.34.34 0 0 0 0-.679c-1.529 0-3.097-.22-4.626-.38a14.2 14.2 0 0 1-.3-3.716c2.358.1 3.377 0 5.465-.06a.35.35 0 0 0 0-.689c-1.718-.1-3.397-.26-5.425-.39c.108-1.457.349-2.902.72-4.315l5.784.16c.15.35.32.699.47 1.059a.341.341 0 1 0 .659-.18c0-.29-.07-.58-.1-.87h3.576a.361.361 0 0 0 .07-.719"
          fill={color}
          stroke="none"
        />
      </>
    ),
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
    workUpdate: (
      <Path
        d="m18 20.596l2.539-2.538l-.547-.546l-1.608 1.607v-3.715h-.769v3.715l-1.607-1.607l-.547.546zM10 7h4V5.615q0-.269-.173-.442T13.385 5h-2.77q-.269 0-.442.173T10 5.615zm5.165 13.836Q14 19.67 14 18t1.165-2.835T18 14t2.836 1.165T22 18t-1.164 2.836T18 22t-2.835-1.164M4.615 20q-.69 0-1.152-.462T3 18.384V8.616q0-.691.463-1.153T4.615 7H9V5.615q0-.69.463-1.153T10.616 4h2.769q.69 0 1.153.462T15 5.615V7h4.385q.69 0 1.152.463T21 8.616v4.198q-.683-.414-1.448-.614T18 12q-2.496 0-4.248 1.752T12 18q0 .506.086 1.009t.262.991z"
        fill={color}
        stroke="none"
      />
    ),
  };

  return (
    <Svg
      accessibilityElementsHidden
      width={size}
      height={size}
      viewBox={name === 'select' ? '0 0 16 16' : name === 'mic' ? '0 0 1200 1200' : '0 0 24 24'}
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
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
  if (size < 1024 * 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(size < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  }
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function getAttachmentKind(attachment: HomeTaskAttachment) {
  if (attachment.isVoiceNote) return 'Voice note';
  const mediaType = attachment.mediaType.toLowerCase();
  if (mediaType.startsWith('video/')) return 'Video';
  if (mediaType.startsWith('image/')) return 'Image';
  if (mediaType.startsWith('audio/')) return 'Audio';
  return 'Document';
}

let activeTaskAttachmentPlayer: ReturnType<typeof useAudioPlayer> | null = null;

function formatAudioTime(value: number) {
  const seconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function getSafeTaskAttachmentName(fileName: string) {
  const safeName = fileName.replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_').trim();
  return safeName && safeName !== '.' && safeName !== '..' ? safeName : 'attachment';
}

function getTaskAttachmentBase64(dataUrl: string) {
  const match = dataUrl.match(/^data:[^,]*;base64,([A-Za-z0-9+/]*={0,2})$/);
  if (!match) throw new Error('This attachment has an invalid file payload.');
  return match[1];
}

function TaskAttachmentFileIcon({ extension }: { extension: string }) {
  const type = extension || 'FILE';
  if (['doc', 'docx', 'odt'].includes(extension)) {
    return (
      <View style={styles.attachmentFileIcon}>
        <Svg width={29} height={29} viewBox="0 0 24 24">
          <Path
            fill="#01579B"
            stroke="none"
            d="M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2m7 1.5V9h5.5zM7 13l1.5 7h2l1.5-3l1.5 3h2l1.5-7h1v-2h-4v2h1l-.9 4.2L13 15h-2l-1.1 2.2L9 13h1v-2H6v2z"
          />
        </Svg>
      </View>
    );
  }
  if (['xls', 'xlsx', 'csv'].includes(extension)) {
    return (
      <View style={styles.attachmentFileIcon}>
        <Svg width={29} height={29} viewBox="0 0 32 32">
          <Defs>
            <LinearGradient
              id="taskExcelIconGradient"
              x1="4.494"
              x2="13.832"
              y1="-2092.086"
              y2="-2075.914"
              gradientTransform="translate(0 2100)"
              gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor="#18884F" />
              <Stop offset="0.5" stopColor="#117E43" />
              <Stop offset="1" stopColor="#0B6631" />
            </LinearGradient>
          </Defs>
          <Path d="M19.581 15.35L8.512 13.4v14.409A1.19 1.19 0 0 0 9.705 29h19.1A1.19 1.19 0 0 0 30 27.809V22.5Z" fill="#185C37" />
          <Path d="M19.581 3H9.705a1.19 1.19 0 0 0-1.193 1.191V9.5L19.581 16l5.861 1.95L30 16V9.5Z" fill="#21A366" />
          <Path d="M8.512 9.5h11.069V16H8.512Z" fill="#107C41" />
          <Path d="M16.434 8.2H8.512v16.25h7.922a1.2 1.2 0 0 0 1.194-1.191V9.391A1.2 1.2 0 0 0 16.434 8.2" opacity={0.1} />
          <Path d="M15.783 8.85H8.512V25.1h7.271a1.2 1.2 0 0 0 1.194-1.191V10.041a1.2 1.2 0 0 0-1.194-1.191" opacity={0.2} />
          <Path d="M15.783 8.85H8.512V23.8h7.271a1.2 1.2 0 0 0 1.194-1.191V10.041a1.2 1.2 0 0 0-1.194-1.191" opacity={0.2} />
          <Path d="M15.132 8.85h-6.62V23.8h6.62a1.2 1.2 0 0 0 1.194-1.191V10.041a1.2 1.2 0 0 0-1.194-1.191" opacity={0.2} />
          <Path d="M3.194 8.85h11.938a1.193 1.193 0 0 1 1.194 1.191v11.918a1.193 1.193 0 0 1-1.194 1.191H3.194A1.19 1.19 0 0 1 2 21.959V10.041A1.19 1.19 0 0 1 3.194 8.85" fill="url(#taskExcelIconGradient)" />
          <Path d="m5.7 19.873l2.511-3.884l-2.3-3.862h1.847L9.013 14.6c.116.234.2.408.238.524h.017q.123-.281.26-.546l1.342-2.447h1.7l-2.359 3.84l2.419 3.905h-1.809l-1.45-2.711A2.4 2.4 0 0 1 9.2 16.8h-.024a1.7 1.7 0 0 1-.168.351l-1.493 2.722Z" fill="#FFFFFF" />
          <Path d="M28.806 3h-9.225v6.5H30V4.191A1.19 1.19 0 0 0 28.806 3" fill="#33C481" />
          <Path d="M19.581 16H30v6.5H19.581Z" fill="#107C41" />
        </Svg>
      </View>
    );
  }
  if (['ppt', 'pptx'].includes(extension)) {
    return (
      <View style={styles.attachmentFileIcon}>
        <Svg width={29} height={29} viewBox="0 0 32 32">
          <Path
            d="M17 3h7a2 2 0 0 1 2 2v3h2a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2-2Z"
            fill="#D35230"
          />
          <Path d="M17 3v6h9" fill="#F07A55" />
          <Path
            d="M7.5 11h4.2c2.4 0 3.8 1.2 3.8 3.3s-1.4 3.4-3.8 3.4h-1.5V22h-2.7zm2.7 4.6h1.3c.9 0 1.4-.4 1.4-1.2s-.5-1.2-1.4-1.2h-1.3z"
            fill="#FFFFFF"
          />
          <Path d="M19 14h8m-4-4v8" stroke="#FFFFFF" strokeWidth={1.5} />
        </Svg>
      </View>
    );
  }

  if (extension === 'pdf') {
    return (
      <View style={styles.attachmentFileIcon}>
        <Svg width={29} height={29} viewBox="0 0 24 24">
          <Path
            fill="#EF5350"
            stroke="none"
            d="M13 9h5.5L13 3.5zM6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2m4.93 10.44c.41.9.93 1.64 1.53 2.15l.41.32c-.87.16-2.07.44-3.34.93l-.11.04l.5-1.04c.45-.87.78-1.66 1.01-2.4m6.48 3.81c.18-.18.27-.41.28-.66c.03-.2-.02-.39-.12-.55c-.29-.47-1.04-.69-2.28-.69l-1.29.07l-.87-.58c-.63-.52-1.2-1.43-1.6-2.56l.04-.14c.33-1.33.64-2.94-.02-3.6a.85.85 0 0 0-.61-.24h-.24c-.37 0-.7.39-.79.77c-.37 1.33-.15 2.06.22 3.27v.01c-.25.88-.57 1.9-1.08 2.93l-.96 1.8l-.89.49c-1.2.75-1.77 1.59-1.88 2.12c-.04.19-.02.36.05.54l.03.05l.48.31l.44.11c.81 0 1.73-.95 2.97-3.07l.18-.07c1.03-.33 2.31-.56 4.03-.75c1.03.51 2.24.74 3 .74c.44 0 .74-.11.91-.3m-.41-.71l.09.11c-.01.1-.04.11-.09.13h-.04l-.19.02c-.46 0-1.17-.19-1.9-.51c.09-.1.13-.1.23-.1c1.4 0 1.8.25 1.9.35M7.83 17c-.65 1.19-1.24 1.85-1.69 2c.05-.38.5-1.04 1.21-1.69zm3.02-6.91c-.23-.9-.24-1.63-.07-2.05l.07-.12l.15.05c.17.24.19.56.09 1.1l-.03.16l-.16.82z"
          />
        </Svg>
      </View>
    );
  }

  const color = '#64748B';

  return (
    <View style={styles.attachmentFileIcon}>
      <Svg width={29} height={29} viewBox="0 0 58 58">
        <Path
          d="M17 5h16l10 10v33a4 4 0 0 1-4 4H17a4 4 0 0 1-4-4V9a4 4 0 0 1 4-4Z"
          fill="#FFFFFF"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
        />
        <Path d="M33 5v10h10" fill={color} fillOpacity={0.18} stroke={color} strokeWidth={2} />
        <Rect x="18" y="27" width="24" height="13" rx="3" fill={color} />
      </Svg>
      <Text numberOfLines={1} adjustsFontSizeToFit style={styles.attachmentFileType}>
        {type.toUpperCase()}
      </Text>
    </View>
  );
}

async function writeTaskAttachment(
  directory: Directory,
  attachment: HomeTaskAttachment,
) {
  if (!attachment.data) throw new Error('The attachment data is not available.');
  const originalName = getSafeTaskAttachmentName(attachment.fileName);
  const extensionIndex = originalName.lastIndexOf('.');
  const basename = extensionIndex > 0 ? originalName.slice(0, extensionIndex) : originalName;
  const extension = extensionIndex > 0 ? originalName.slice(extensionIndex) : '';
  let name = originalName;
  let suffix = 2;
  while (new File(directory, name).exists) {
    name = `${basename} (${suffix})${extension}`;
    suffix += 1;
  }
  const file = directory.createFile(name, attachment.mediaType || 'application/octet-stream');
  try {
    await file.write(getTaskAttachmentBase64(attachment.data), { encoding: 'base64' });
  } catch (error) {
    if (file.exists) file.delete();
    throw error;
  }
  return file;
}

function TaskAttachmentCard({
  attachment,
  projectId,
  taskId,
}: {
  attachment: HomeTaskAttachment;
  projectId: string;
  taskId: string;
}) {
  const kind = getAttachmentKind(attachment);
  const isImage = kind === 'Image';
  const isAudio = kind === 'Audio' || kind === 'Voice note';
  const extension = attachment.fileName.split('.').pop()?.toLowerCase() || '';
  const [imagePreviewUri, setImagePreviewUri] = useState<string | null>(null);
  const [attachmentError, setAttachmentError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [audioBusy, setAudioBusy] = useState(false);
  const player = useAudioPlayer(null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const mountedRef = useRef(true);
  const requestRef = useRef<Promise<HomeTaskAttachment> | null>(null);
  const imagePreviewFile = useRef<File | null>(null);
  const playbackFile = useRef<File | null>(null);
  const sourceLoaded = useRef(false);
  const duration = status.duration || 0;
  const progress = duration > 0 ? Math.min(1, status.currentTime / duration) : 0;

  const ensureAttachmentData = useCallback(async () => {
    if (!requestRef.current) {
      requestRef.current = fetchHomeTaskAttachment(projectId, taskId, attachment.index);
    }
    try {
      return await requestRef.current;
    } catch (error) {
      if (mountedRef.current) {
        setAttachmentError(error instanceof Error ? error.message : 'Attachment could not be loaded.');
      }
      throw error;
    } finally {
      requestRef.current = null;
    }
  }, [attachment.index, projectId, taskId]);

  useEffect(() => {
    if (!isImage) return undefined;
    let active = true;
    void ensureAttachmentData()
      .then(async (data) => {
        const previewDirectory = new Directory(Paths.cache, 'task-image-previews');
        if (!previewDirectory.exists) previewDirectory.create({ intermediates: true });
        const file = await writeTaskAttachment(previewDirectory, data);
        if (!active) {
          if (file.exists) file.delete();
          return;
        }
        imagePreviewFile.current = file;
        setImagePreviewUri(file.uri);
        setAttachmentError('');
      })
      .catch((error) => {
        console.error('Unable to load task image attachment:', error);
        if (active) setAttachmentError('Image preview could not be loaded.');
      });
    return () => { active = false; };
  }, [ensureAttachmentData, isImage]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (activeTaskAttachmentPlayer === player) activeTaskAttachmentPlayer = null;
      player.pause();
      try {
        if (playbackFile.current?.exists) playbackFile.current.delete();
        if (imagePreviewFile.current?.exists) imagePreviewFile.current.delete();
      } catch (error) {
        console.error('Unable to remove temporary task attachment files:', error);
      }
    };
  }, [player]);

  async function saveAttachment() {
    setActionBusy(true);
    try {
      if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
        throw new Error('Saving attachments to a device folder is only available on iOS and Android.');
      }
      const data = await ensureAttachmentData();
      const destinationDirectory = await Directory.pickDirectoryAsync();
      await writeTaskAttachment(destinationDirectory, data);
      Alert.alert('Download complete', `${attachment.fileName} was saved to ${destinationDirectory.name}.`);
    } catch (error) {
      if (error instanceof Error && /cancel(?:led|ed)?/i.test(error.message)) return;
      console.error('Unable to download task attachment:', error);
      Alert.alert(
        'Download failed',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setActionBusy(false);
    }
  }

  async function previewAttachment() {
    setActionBusy(true);
    let previewFile: File | null = null;
    try {
      const data = await ensureAttachmentData();
      const previewDirectory = new Directory(Paths.cache, 'task-attachments');
      if (!previewDirectory.exists) previewDirectory.create({ intermediates: true });
      previewFile = await writeTaskAttachment(previewDirectory, data);
      await previewFile.preview({
        title: attachment.fileName,
        mimeType: attachment.mediaType,
      });
    } catch (error) {
      console.error('Unable to preview task attachment:', error);
      Alert.alert(
        'Preview unavailable',
        error instanceof Error ? error.message : 'This file could not be opened.',
      );
    } finally {
      if (previewFile?.exists) {
        try {
          previewFile.delete();
        } catch (error) {
          console.error('Unable to remove the temporary task preview file:', error);
        }
      }
      setActionBusy(false);
    }
  }

  async function toggleAudio() {
    if (status.playing) {
      player.pause();
      return;
    }
    setAudioBusy(true);
    try {
      if (activeTaskAttachmentPlayer && activeTaskAttachmentPlayer !== player) {
        activeTaskAttachmentPlayer.pause();
        void activeTaskAttachmentPlayer.seekTo(0).catch((error) => {
          console.error('Unable to reset the previous task audio attachment:', error);
        });
      }
      const data = await ensureAttachmentData();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      if (!sourceLoaded.current) {
        const file = new File(
          Paths.cache,
          `${Date.now()}-${Math.random().toString(36).slice(2)}-${getSafeTaskAttachmentName(attachment.fileName)}`,
        );
        try {
          await file.write(getTaskAttachmentBase64(data.data || ''), { encoding: 'base64' });
        } catch (error) {
          if (file.exists) file.delete();
          throw error;
        }
        playbackFile.current = file;
        player.replace(file.uri);
        sourceLoaded.current = true;
      }
      if (status.didJustFinish || (duration > 0 && status.currentTime >= duration - 0.1)) {
        await player.seekTo(0);
      }
      activeTaskAttachmentPlayer = player;
      player.play();
    } catch (error) {
      console.error('Unable to play task audio attachment:', error);
      Alert.alert('Audio unavailable', 'This audio file could not be played.');
    } finally {
      setAudioBusy(false);
    }
  }

  return (
    <View style={styles.taskAttachmentCard}>
      {isImage ? (
        <View style={styles.attachmentImagePreview}>
          {imagePreviewUri ? (
            <Image
              source={{ uri: imagePreviewUri }}
              style={styles.attachmentImage}
              resizeMode="cover"
              onError={() => setAttachmentError('Image preview could not be displayed.')}
            />
          ) : attachmentError ? (
            <Text style={styles.attachmentImageUnavailable}>!</Text>
          ) : (
            <ActivityIndicator size="small" color="#527565" />
          )}
        </View>
      ) : isAudio ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={status.playing ? 'Pause audio attachment' : 'Play audio attachment'}
          disabled={audioBusy}
          onPress={() => { void toggleAudio(); }}
          style={[styles.attachmentAudioTile, audioBusy && styles.attachmentActionDisabled]}>
          {attachment.isVoiceNote ? (
            <>
              <Svg width={23} height={23} viewBox="0 0 16 16">
                <G
                  fill="none"
                  stroke="#EF5350"
                  strokeLinecap="round"
                  strokeLinejoin="round">
                  <Path d="M5.5 12.5a2 2 0 0 1-2 2a2 2 0 0 1-2-2a2 2 0 0 1 2-2a2 2 0 0 1 2 2m9-2a2 2 0 0 1-2 2a2 2 0 0 1-2-2a2 2 0 0 1 2-2a2 2 0 0 1 2 2" />
                  <Path d="M5.5 12.5V5c0-.54.44-1.21 1.35-1.5l6.3-2c.9 0 1.35.88 1.35 1.5v7.58m-9-3.08l9-3" />
                </G>
              </Svg>
              <View style={styles.attachmentVoiceNotePlay}>
                <Svg width={10} height={10} viewBox="0 0 24 24">
                  <Path
                    fill="#000000"
                    stroke="none"
                    d="M7.01 2a3 3 0 0 1 1.502.41l11.994 6.995A3 3 0 0 1 22 11.998a3 3 0 0 1-1.323 2.49l-.166.105l-12 7A3.002 3.002 0 0 1 4 19V5.001A3 3 0 0 1 7.01 2"
                  />
                </Svg>
              </View>
            </>
          ) : (
            <Svg width={20} height={20} viewBox="0 0 24 24">
              <Path
                fill="#000000"
                stroke="none"
                d="M7.01 2a3 3 0 0 1 1.502.41l11.994 6.995A3 3 0 0 1 22 11.998a3 3 0 0 1-1.323 2.49l-.166.105l-12 7A3.002 3.002 0 0 1 4 19V5.001A3 3 0 0 1 7.01 2"
              />
            </Svg>
          )}
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Preview ${attachment.fileName}`}
          disabled={actionBusy}
          onPress={() => { void previewAttachment(); }}
          style={styles.attachmentFileIconButton}>
          <TaskAttachmentFileIcon extension={extension} />
        </Pressable>
      )}

      <Pressable
        accessibilityRole={isAudio ? undefined : 'button'}
        accessibilityLabel={isAudio ? undefined : `Open ${attachment.fileName}`}
        disabled={isAudio || actionBusy}
        onPress={isAudio ? undefined : () => { void previewAttachment(); }}
        style={styles.taskAttachmentCopy}>
        <Text numberOfLines={1} style={styles.taskAttachmentName}>
          {attachment.fileName}
        </Text>
        <Text numberOfLines={1} style={styles.taskAttachmentDetails}>
          {[kind, formatAttachmentSize(attachment.size)].filter(Boolean).join(' · ')}
        </Text>
        {isAudio ? (
          <>
            <View style={styles.attachmentAudioProgressTrack}>
              <View style={[styles.attachmentAudioProgress, { width: `${progress * 100}%` }]} />
            </View>
            <Text style={styles.attachmentAudioTime}>
              {formatAudioTime(status.currentTime)} / {formatAudioTime(duration)}
            </Text>
          </>
        ) : null}
        {attachmentError ? (
          <Text numberOfLines={1} style={styles.attachmentError}>{attachmentError}</Text>
        ) : null}
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Download ${attachment.fileName}`}
        disabled={actionBusy}
        onPress={() => { void saveAttachment(); }}
        style={[styles.attachmentDownloadButton, actionBusy && styles.attachmentActionDisabled]}>
        {actionBusy ? (
          <ActivityIndicator size="small" color="#33443B" />
        ) : (
          <Icon name="download" size={14} color="#33443B" />
        )}
      </Pressable>
    </View>
  );
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
    sprintSubmissionStatus: task.sprintSubmissionStatus || 'Not submitted',
    sprintSubmissionNote: task.sprintSubmissionNote || '',
    sprintSubmissionLinks: task.sprintSubmissionLinks || [],
    sprintSubmissionAttachments: task.sprintSubmissionAttachments || [],
    sprintSubmittedAt: task.sprintSubmittedAt || null,
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
  const sprintSubmissionRecorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });
  const sprintRecorderState = useAudioRecorderState(sprintSubmissionRecorder, 50);
  const [recordingWaveform, setRecordingWaveform] = useState<number[]>(Array(20).fill(2));
  const [voiceNoteActive, setVoiceNoteActive] = useState(false);
  const [voiceNotePaused, setVoiceNotePaused] = useState(false);
  const voiceNoteTransitionRef = useRef(false);
  const voiceNotePreparedRef = useRef(false);
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
  const [taskTagsRefreshFailed, setTaskTagsRefreshFailed] = useState(false);

  useEffect(() => {
    if (!sprintRecorderState.isRecording || voiceNotePaused) {
      setRecordingWaveform(Array(20).fill(2));
      return;
    }

    const meter = sprintRecorderState.metering ?? -60;
    const amplitude = Math.max(0, Math.min(1, (meter + 60) / 60));
    const height = Math.max(2, Math.round(2 + amplitude * 18));
    setRecordingWaveform((current) => [...current.slice(1), height]);
  }, [sprintRecorderState.isRecording, sprintRecorderState.metering, voiceNotePaused]);
  const [expandedSprintTaskId, setExpandedSprintTaskId] = useState<string | null>(null);
  const [submissionNote, setSubmissionNote] = useState('');
  const [submissionAttachments, setSubmissionAttachments] = useState<SprintSubmissionAttachment[]>([]);
  const [submissionLinks, setSubmissionLinks] = useState<string[]>([]);
  const [submissionLinkDraft, setSubmissionLinkDraft] = useState('');
  const [submissionBusy, setSubmissionBusy] = useState(false);
  const [submissionError, setSubmissionError] = useState('');

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
  const selectedTaskProjectId = selectedTask?.projectId;
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
    if (!selectedTaskId || !selectedTaskProjectId) return undefined;
    const taskId = selectedTaskId;
    const projectId = selectedTaskProjectId;
    let active = true;
    setTaskTagsRefreshFailed(false);

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

    async function refreshSelectedTaskDetails() {
      try {
        const details = await fetchHomeTaskDetails(projectId, taskId);
        if (!active) return;
        setTasks((current) => current.map((item) => item.id === taskId
          ? {
            ...item,
            tags: details.tags ?? item.tags,
            sprint: details.sprintName,
            sprintSubmissionStatus: details.sprintSubmissionStatus,
            sprintSubmissionNote: details.sprintSubmissionNote,
            sprintSubmissionLinks: details.sprintSubmissionLinks,
            sprintSubmissionAttachments: details.sprintSubmissionAttachments,
            sprintSubmittedAt: details.sprintSubmittedAt,
          }
          : item));
      } catch (error) {
        console.error('Unable to refresh task modal details:', error);
        if (active) setTaskTagsRefreshFailed(true);
      }
    }

    void refreshSelectedTaskDetails();
    return () => { active = false; };
  }, [selectedTaskId, selectedTaskProjectId]);

  useEffect(() => {
    setExpandedSprintTaskId(null);
    setSubmissionNote('');
    setSubmissionAttachments([]);
    setSubmissionLinks([]);
    setSubmissionLinkDraft('');
    setSubmissionError('');
  }, [selectedTaskId]);

  async function addSprintSubmissionAttachments() {
    if (submissionBusy || voiceNoteActive) return;
    try {
      const selection = await File.pickFileAsync({
        multipleFiles: true,
        mimeTypes: ['*/*'],
      });
      if (selection.canceled) return;

      const selectedFiles = selection.result;
      if (submissionAttachments.length + selectedFiles.length > maxSprintSubmissionAttachments) {
        setSubmissionError(`Attach no more than ${maxSprintSubmissionAttachments} files.`);
        return;
      }

      let totalBytes = submissionAttachments.reduce((total, item) => total + item.size, 0);
      const added: SprintSubmissionAttachment[] = [];
      for (const file of selectedFiles) {
        const mediaType = (file.type || '').toLowerCase();
        const size = file.size;
        if (!supportedSprintSubmissionMediaType.test(mediaType)) {
          throw new Error(`${file.name || 'The selected file'} uses an unsupported file type.`);
        }
        if (!file.name.trim() || file.name.length > 255 || /[\u0000-\u001f\u007f]/.test(file.name)) {
          throw new Error('File names must be 255 characters or fewer and cannot contain control characters.');
        }
        if (!Number.isSafeInteger(size) || size <= 0) {
          throw new Error(`${file.name || 'The selected file'} is empty or could not be read.`);
        }
        totalBytes += size;
        if (totalBytes > maxSprintSubmissionBytes) {
          throw new Error('Sprint attachments must total 100 MB or less.');
        }
        const data = await file.base64();
        if (!data) throw new Error(`${file.name || 'The selected file'} could not be read.`);
        added.push({
          fileName: file.name.slice(0, 255) || 'Attachment',
          mediaType,
          size,
          data: `data:${mediaType};base64,${data}`,
        });
      }
      setSubmissionAttachments((current) => [...current, ...added]);
      setSubmissionError('');
    } catch (error) {
      console.error('Unable to add sprint submission attachments:', error);
      setSubmissionError(error instanceof Error
        ? error.message
        : 'The selected files could not be attached.');
    }
  }

  function addSprintSubmissionLink() {
    const value = submissionLinkDraft.trim();
    if (!value) {
      setSubmissionError('Enter a link before adding it.');
      return;
    }
    try {
      const link = new URL(value);
      if (!['http:', 'https:'].includes(link.protocol) || !link.hostname) {
        throw new Error('Use a valid http:// or https:// link.');
      }
      if (link.toString().length > 2048) {
        throw new Error('Links must be 2,048 characters or fewer.');
      }
      if (submissionLinks.includes(link.toString())) {
        throw new Error('This link has already been added.');
      }
      if (submissionLinks.length >= 10) {
        throw new Error('Add no more than 10 links.');
      }
      setSubmissionLinks((current) => [...current, link.toString()]);
      setSubmissionLinkDraft('');
      setSubmissionError('');
    } catch (error) {
      setSubmissionError(error instanceof Error ? error.message : 'Enter a valid link.');
    }
  }

  async function toggleSprintVoiceRecording() {
    if (submissionBusy || voiceNoteTransitionRef.current) return;
    voiceNoteTransitionRef.current = true;
    try {
      if (voiceNoteActive) {
        try {
          await sprintSubmissionRecorder.stop();
          voiceNotePreparedRef.current = false;
          setVoiceNoteActive(false);
          setVoiceNotePaused(false);
          await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
          const uri = sprintSubmissionRecorder.uri;
          if (!uri) throw new Error('The voice note could not be saved.');
          const file = new File(uri);
          const size = file.size;
          const totalBytes = submissionAttachments.reduce((total, item) => total + item.size, 0);
          if (!Number.isSafeInteger(size) || size <= 0) {
            throw new Error('The voice note is empty or could not be read.');
          }
          if (totalBytes + size > maxSprintSubmissionBytes) {
            throw new Error('Sprint attachments must total 100 MB or less.');
          }
          if (submissionAttachments.length >= maxSprintSubmissionAttachments) {
            throw new Error(`Attach no more than ${maxSprintSubmissionAttachments} files.`);
          }
          const data = await file.base64();
          if (!data) throw new Error('The voice note could not be read.');
          setSubmissionAttachments((current) => [...current, {
            fileName: `voice-note-${Date.now()}.m4a`,
            mediaType: 'audio/mp4',
            size,
            data: `data:audio/mp4;base64,${data}`,
            is_voice_note: true,
          }]);
          setSubmissionError('');
        } catch (error) {
          console.error('Unable to finish sprint voice note:', error);
          setVoiceNoteActive(false);
          setVoiceNotePaused(false);
          setSubmissionError(error instanceof Error
            ? error.message
            : 'The voice note could not be attached.');
          await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        }
        return;
      }

      if (submissionAttachments.length >= maxSprintSubmissionAttachments) {
        setSubmissionError(`Attach no more than ${maxSprintSubmissionAttachments} files.`);
        return;
      }
      try {
        const permission = await AudioModule.requestRecordingPermissionsAsync();
        if (!permission.granted) {
          setSubmissionError('Allow microphone access to record a voice note.');
          return;
        }
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        if (!voiceNotePreparedRef.current) {
          await sprintSubmissionRecorder.prepareToRecordAsync();
          voiceNotePreparedRef.current = true;
        }
        sprintSubmissionRecorder.record({ forDuration: 3600 });
        setVoiceNoteActive(true);
        setVoiceNotePaused(false);
        setSubmissionError('');
      } catch (error) {
        console.error('Unable to start sprint voice note:', error);
        setSubmissionError(error instanceof Error
          ? error.message
          : 'The voice note could not be recorded.');
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      }
    } finally {
      voiceNoteTransitionRef.current = false;
    }
  }

  async function toggleSprintVoicePause() {
    if (submissionBusy || !voiceNoteActive) return;
    try {
      if (voiceNotePaused) {
        sprintSubmissionRecorder.record({ forDuration: 3600 });
        setVoiceNotePaused(false);
      } else {
        sprintSubmissionRecorder.pause();
        setVoiceNotePaused(true);
      }
    } catch (error) {
      console.error('Unable to pause or resume sprint voice note:', error);
      setSubmissionError(error instanceof Error
        ? error.message
        : 'The voice note could not be paused or resumed.');
    }
  }

  async function submitSelectedSprintForReview(task: Task) {
    if (!task.sprint || submissionBusy) return;
    const note = submissionNote.trim();
    if (note.length > 5000) {
      setSubmissionError('Submission notes cannot exceed 5,000 characters.');
      return;
    }
    if (submissionLinkDraft.trim()) {
      setSubmissionError('Add the link using the Add link button, or clear the link field.');
      return;
    }
    if (submissionLinks.length > 10) {
      setSubmissionError('Add no more than 10 links.');
      return;
    }
    if (submissionLinks.some((value) => {
      try {
        const link = new URL(value);
        return !['http:', 'https:'].includes(link.protocol) ||
          !link.hostname ||
          link.toString().length > 2048;
      } catch {
        return true;
      }
    })) {
      setSubmissionError('One or more links are invalid. Use a valid http:// or https:// link.');
      return;
    }
    if (submissionAttachments.length > maxSprintSubmissionAttachments) {
      setSubmissionError(`Attach no more than ${maxSprintSubmissionAttachments} files.`);
      return;
    }
    if (submissionAttachments.some((attachment) =>
      !attachment.fileName.trim() ||
      attachment.fileName.length > 255 ||
      /[\u0000-\u001f\u007f]/.test(attachment.fileName) ||
      !supportedSprintSubmissionMediaType.test(attachment.mediaType.toLowerCase()) ||
      !Number.isSafeInteger(attachment.size) ||
      attachment.size <= 0
    )) {
      setSubmissionError('One or more attachments are invalid or use an unsupported file type.');
      return;
    }
    const totalAttachmentBytes = submissionAttachments.reduce(
      (total, attachment) => total + attachment.size,
      0,
    );
    if (totalAttachmentBytes > maxSprintSubmissionBytes) {
      setSubmissionError('Sprint attachments must total 100 MB or less.');
      return;
    }
    if (!note && submissionAttachments.length === 0 && submissionLinks.length === 0) {
      setSubmissionError('Add a submission note, file or voice note, or link before submitting.');
      return;
    }
    setSubmissionBusy(true);
    setSubmissionError('');
    try {
      await submitHomeTaskSprint(
        task.projectId,
        task.id,
        note,
        submissionAttachments,
        submissionLinks,
      );
      setTasks((current) => current.map((item) => item.id === task.id ? {
        ...item,
        sprintSubmissionStatus: 'Pending Review',
        sprintSubmissionNote: note,
        sprintSubmissionLinks: submissionLinks,
        sprintSubmissionAttachments: submissionAttachments.map((attachment) => ({
          fileName: attachment.fileName,
          mediaType: attachment.mediaType,
          size: attachment.size,
          isVoiceNote: attachment.is_voice_note === true,
        })),
        sprintSubmittedAt: new Date().toISOString(),
      } : item));
      setSubmissionNote('');
      setSubmissionAttachments([]);
      setSubmissionLinks([]);
    } catch (error) {
      console.error('Unable to submit task sprint for review:', error);
      setSubmissionError(error instanceof HomeApiError
        ? error.message
        : 'The sprint could not be submitted for review.');
    } finally {
      setSubmissionBusy(false);
    }
  }

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
                      <Icon name="workUpdate" size={16} color="#59665F" />
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
                    <Text style={styles.metadataLabel}>Status</Text>
                    <View style={styles.metadataValueContainer}>
                      <Text style={styles.metadataValue}>{selectedTask.status}</Text>
                    </View>
                  </View>

                  <View style={styles.metadataRow}>
                    <Text style={styles.metadataLabel}>Priority</Text>
                    <View style={styles.metadataValueContainer}>
                      <Text
                        style={[
                          styles.priorityText,
                          {
                            color: selectedTask.priority.trim().toLowerCase() === 'high'
                              ? '#DC2626'
                              : selectedTask.priority.trim().toLowerCase() === 'medium'
                                ? '#D97706'
                                : selectedTask.priority.trim().toLowerCase() === 'low'
                                  ? '#16A34A'
                                  : '#6B7280',
                          },
                        ]}>
                        {selectedTask.priority || 'Normal'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.metadataRow}>
                    <Text style={[styles.metadataLabel, styles.tagsMetadataLabel]}>Tags</Text>
                    <View style={styles.tagsContainer}>
                      {selectedTask.tags.length ? (
                        selectedTask.tags.map((tag) => (
                          <Text key={tag} style={styles.categoryTag}>#{tag}</Text>
                        ))
                      ) : (
                        <Text style={styles.metadataMuted}>No tags</Text>
                      )}
                      {taskTagsRefreshFailed ? (
                        <Text style={styles.metadataMuted}>Could not refresh tags</Text>
                      ) : null}
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
                    selectedTask.attachments.map((attachment) => (
                      <TaskAttachmentCard
                        key={`${selectedTask.id}-${attachment.index}-${attachment.fileName}`}
                        attachment={attachment}
                        projectId={selectedTask.projectId}
                        taskId={selectedTask.id}
                      />
                    ))
                  ) : (
                    <Text style={styles.metadataMuted}>No attachments available.</Text>
                  )}
                </View>

                <View style={styles.assignedSprintSection}>
                  <View style={styles.assignedSprintHeading}>
                    <Text style={styles.assignedSprintTitle}>Your assigned sprints</Text>
                    <Text style={styles.assignedSprintCount}>
                      {selectedTask.sprint ? '1' : '0'}
                    </Text>
                  </View>
                  {selectedTask.sprint ? (
                    <>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`View details for ${selectedTask.sprint}`}
                        accessibilityState={{
                          expanded: expandedSprintTaskId === selectedTask.id,
                        }}
                        onPress={() => setExpandedSprintTaskId((current) => (
                          current === selectedTask.id ? null : selectedTask.id
                        ))}
                        style={styles.assignedSprintExpandButton}>
                        <View style={styles.assignedSprintDescription}>
                          <Text style={styles.assignedSprintBullet}>-</Text>
                          <Text style={styles.assignedSprintName}>{selectedTask.sprint}</Text>
                        </View>
                        <View style={styles.assignedSprintViewDetails}>
                          <Text style={styles.assignedSprintExpandText}>
                            {expandedSprintTaskId === selectedTask.id
                              ? 'Hide details'
                              : 'View details'}
                          </Text>
                          <Icon
                            name="chevronDown"
                            size={15}
                            color="#68736C"
                          />
                        </View>
                      </Pressable>
                      {!['in progress', 'done'].includes(selectedTask.status.trim().toLowerCase()) ? (
                        <View style={styles.assignedSprintStartRow}>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Start task"
                            disabled={busyTaskId === selectedTask.id}
                            onPress={() => { void nextStatus(selectedTask); }}
                            style={[
                              styles.assignedSprintStartButton,
                              busyTaskId === selectedTask.id && styles.primaryActionDisabled,
                            ]}>
                            {busyTaskId === selectedTask.id ? (
                              <ActivityIndicator size="small" color="#FFFFFF" />
                            ) : (
                              <>
                                <Text style={styles.assignedSprintStartText}>Start task</Text>
                                <Icon name="arrow" size={16} color="#FFFFFF" />
                              </>
                            )}
                          </Pressable>
                        </View>
                      ) : null}
                      {expandedSprintTaskId === selectedTask.id ? (
                        <View style={styles.sprintDetails}>
                          <Text style={styles.sprintDescription}>
                            {selectedTask.description || 'No sprint details have been added.'}
                          </Text>
                          <View style={styles.sprintProgressHeading}>
                            <Text style={styles.sectionLabel}>Progress</Text>
                            <Text style={styles.sprintProgressPercent}>
                              {selectedTask.progress}%
                            </Text>
                          </View>
                          <View
                            accessibilityRole="progressbar"
                            accessibilityValue={{ min: 0, max: 100, now: selectedTask.progress }}
                            style={styles.sprintProgressTrack}>
                            <View
                              style={[
                                styles.sprintProgressFill,
                                { width: `${selectedTask.progress}%` },
                              ]}
                            />
                          </View>

                          {selectedTask.status.trim().toLowerCase() === 'in progress' &&
                          !['Pending Review', 'Completed'].includes(selectedTask.sprintSubmissionStatus) ? (
                            <View style={styles.sprintSubmissionForm}>
                              <TextInput
                                accessibilityLabel="Sprint submission notes"
                                placeholder="Summarize the completed sprint work..."
                                placeholderTextColor="#858C87"
                                value={submissionNote}
                                onChangeText={setSubmissionNote}
                                multiline
                                maxLength={5000}
                                style={styles.sprintSubmissionNote}
                              />
                              <View style={styles.sprintMediaHeading}>
                                <Text style={styles.sectionLabel}>Attach a file or voice note</Text>
                                <Text style={styles.sprintMediaLimit}>Up to 100 MB total</Text>
                              </View>
                              <View style={styles.sprintMediaActions}>
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel="Attach files"
                                  disabled={submissionBusy || voiceNoteActive}
                                  onPress={() => { void addSprintSubmissionAttachments(); }}
                                  style={[styles.sprintMediaAction, styles.sprintMediaActionWithIcon]}>
                                  <Icon name="folder" size={15} color="#353B37" />
                                  <Text style={styles.sprintMediaActionText}>Attach file</Text>
                                </Pressable>
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel={voiceNoteActive
                                    ? 'Stop voice note recording'
                                    : 'Record voice note'}
                                  disabled={submissionBusy}
                                  onPress={() => { void toggleSprintVoiceRecording(); }}
                                  style={[styles.sprintMediaAction, styles.sprintMediaIconButton]}>
                                  <Icon
                                    name={voiceNoteActive ? 'stop' : 'mic'}
                                    size={voiceNoteActive ? 34 : 24}
                                    color="#353B37"
                                  />
                                </Pressable>
                                {voiceNoteActive ? (
                                  <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel={voiceNotePaused
                                      ? 'Resume voice note recording'
                                      : 'Pause voice note recording'}
                                    disabled={submissionBusy}
                                    onPress={() => { void toggleSprintVoicePause(); }}
                                    style={[styles.sprintMediaAction, styles.sprintMediaIconButton]}>
                                    <Icon
                                      name={voiceNotePaused ? 'play' : 'pause'}
                                      size={34}
                                      color="#353B37"
                                    />
                                  </Pressable>
                                ) : null}
                                {voiceNoteActive ? (
                                  <View
                                    accessibilityLabel="Recording audio waveform"
                                    accessibilityRole="image"
                                    style={styles.sprintRecordingWaveform}>
                                    {recordingWaveform.map((height, index) => (
                                      <View
                                        key={index}
                                        style={[styles.sprintRecordingWaveformBar, { height }]}
                                      />
                                    ))}
                                  </View>
                                ) : null}
                              </View>
                              {submissionAttachments.map((attachment, index) => (
                                <View
                                  key={`${attachment.fileName}-${index}`}
                                  style={styles.sprintSubmissionAttachment}>
                                  <Text numberOfLines={1} style={styles.sprintSubmissionAttachmentName}>
                                    {attachment.fileName}
                                  </Text>
                                  <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel={`Remove ${attachment.fileName}`}
                                    onPress={() => setSubmissionAttachments((current) =>
                                      current.filter((_, itemIndex) => itemIndex !== index))}
                                    style={styles.sprintSubmissionRemove}>
                                    <Text style={styles.sprintSubmissionRemoveText}>Remove</Text>
                                  </Pressable>
                                </View>
                              ))}
                              <View style={styles.sprintLinkRow}>
                                <TextInput
                                  accessibilityLabel="Sprint submission link"
                                  placeholder="Add a link (https://...)"
                                  placeholderTextColor="#858C87"
                                  value={submissionLinkDraft}
                                  onChangeText={setSubmissionLinkDraft}
                                  autoCapitalize="none"
                                  keyboardType="url"
                                  style={styles.sprintLinkInput}
                                />
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel="Add link"
                                  onPress={addSprintSubmissionLink}
                                  style={[styles.sprintMediaAction, styles.sprintMediaActionWithIcon]}>
                                  <Icon name="webPhone" size={16} color="#353B37" />
                                  <Text style={styles.sprintMediaActionText}>Add link</Text>
                                </Pressable>
                              </View>
                              {submissionLinks.map((link) => (
                                <View key={link} style={styles.sprintSubmissionAttachment}>
                                  <Text numberOfLines={1} style={styles.sprintSubmissionAttachmentName}>
                                    {link}
                                  </Text>
                                  <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel="Remove link"
                                    onPress={() => setSubmissionLinks((current) =>
                                      current.filter((item) => item !== link))}
                                    style={styles.sprintSubmissionRemove}>
                                    <Text style={styles.sprintSubmissionRemoveText}>Remove</Text>
                                  </Pressable>
                                </View>
                              ))}
                              {submissionError ? (
                                <Text accessibilityRole="alert" style={styles.sprintSubmissionError}>
                                  {submissionError}
                                </Text>
                              ) : null}
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="Submit sprint for review"
                                disabled={submissionBusy || voiceNoteActive}
                                onPress={() => { void submitSelectedSprintForReview(selectedTask); }}
                                style={[
                                  styles.assignedSprintStartButton,
                                  styles.assignedSprintSubmitButton,
                                  (submissionBusy || voiceNoteActive) &&
                                    styles.primaryActionDisabled,
                                ]}>
                                {submissionBusy ? (
                                <ActivityIndicator size="small" color="#202020" />
                                ) : (
                                  <>
                                  <Text style={styles.assignedSprintSubmitText}>Submit for review</Text>
                                  <Icon name="check" size={16} color="#FFFDD0" />
                                  </>
                                )}
                              </Pressable>
                            </View>
                          ) : selectedTask.sprintSubmissionStatus === 'Pending Review' ||
                          selectedTask.sprintSubmissionStatus === 'Completed' ? (
                            <View style={styles.sprintSubmittedDetails}>
                              <Text style={styles.sprintSubmittedMessage}>
                                {selectedTask.sprintSubmissionStatus === 'Completed'
                                  ? 'Sprint accepted'
                                  : 'Submitted for review'}
                              </Text>
                              {selectedTask.sprintSubmissionNote ? (
                                <Text style={styles.sprintDescription}>
                                  {selectedTask.sprintSubmissionNote}
                                </Text>
                              ) : null}
                              {selectedTask.sprintSubmissionAttachments.map((attachment) => (
                                <Text
                                  key={attachment.fileName}
                                  style={styles.sprintSubmittedLink}>
                                  - {attachment.fileName}
                                </Text>
                              ))}
                              {selectedTask.sprintSubmissionLinks.map((link) => (
                                <Text key={link} style={styles.sprintSubmittedLink}>
                                  - {link}
                                </Text>
                              ))}
                            </View>
                          ) : null}
                        </View>
                      ) : null}
                    </>
                  ) : (
                    <View style={styles.assignedSprintNoSprintRow}>
                      <Text style={styles.assignedSprintName}>No sprint assigned to this task.</Text>
                      {!['in progress', 'done'].includes(selectedTask.status.trim().toLowerCase()) ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Start task"
                          disabled={busyTaskId === selectedTask.id}
                          onPress={() => { void nextStatus(selectedTask); }}
                          style={[
                            styles.assignedSprintStartButton,
                            busyTaskId === selectedTask.id && styles.primaryActionDisabled,
                          ]}>
                          {busyTaskId === selectedTask.id ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                          ) : (
                            <>
                              <Text style={styles.assignedSprintStartText}>Start task</Text>
                              <Icon name="arrow" size={16} color="#FFFFFF" />
                            </>
                          )}
                        </Pressable>
                      ) : null}
                    </View>
                  )}
                </View>

                {selectedTask.status.trim().toLowerCase() === 'done' ? (
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
                        <Text style={styles.primaryActionText}>Reopen task</Text>
                        <Icon name="arrow" size={18} color="#FFFFFF" />
                      </>
                    )}
                  </Pressable>
                ) : null}

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
    fontSize: 24,
    lineHeight: 30,
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
  tagsMetadataLabel: { width: 83 },
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
    paddingHorizontal: 2,
    paddingVertical: 2,
    borderRadius: 12,
    backgroundColor: 'transparent',
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '700',
  },
  priorityText: { fontSize: 12, fontWeight: '700' },
  descriptionSection: { gap: 11 },
  sectionLabel: { color: '#858C87', fontSize: 12, fontWeight: '700' },
  descriptionText: { color: '#272D29', fontSize: 13, lineHeight: 22, fontWeight: '400' },
  attachmentSection: { gap: 7 },
  assignedSprintSection: {
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#D9D9D9',
  },
  assignedSprintHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  assignedSprintTitle: { color: '#353B37', fontSize: 14, fontWeight: '700' },
  assignedSprintCount: { color: '#68736C', fontSize: 12, fontWeight: '700' },
  assignedSprintExpandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 20,
    paddingVertical: 8,
  },
  assignedSprintViewDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    transform: [{ translateY: 0 }],
  },
  assignedSprintExpandText: { color: '#68736C', fontSize: 10, fontWeight: '600' },
  assignedSprintStartRow: { alignItems: 'flex-end' },
  assignedSprintNoSprintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  sprintDetails: { gap: 12, paddingTop: 8 },
  sprintDescription: { color: '#353B37', fontSize: 12, lineHeight: 18 },
  sprintProgressHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sprintProgressPercent: { color: '#353B37', fontSize: 11, fontWeight: '700' },
  sprintProgressTrack: { height: 6, overflow: 'hidden', borderRadius: 3, backgroundColor: '#E4E8E5' },
  sprintProgressFill: { height: '100%', borderRadius: 3, backgroundColor: '#FFC400' },
  sprintSubmissionForm: { gap: 10, paddingTop: 8 },
  sprintSubmissionNote: {
    minHeight: 80,
    padding: 10,
    borderWidth: 1,
    borderColor: '#D9DFDA',
    borderRadius: 8,
    color: '#272D29',
    fontSize: 12,
    textAlignVertical: 'top',
  },
  sprintMediaHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sprintMediaLimit: { color: '#858C87', fontSize: 10 },
  sprintMediaActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sprintMediaAction: {
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#D9DFDA',
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
  },
  sprintMediaActionWithIcon: { flexDirection: 'row', gap: 6 },
  sprintMediaIconButton: { width: 32, paddingHorizontal: 0, borderWidth: 0 },
  sprintRecordingWaveform: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  sprintRecordingWaveformBar: { width: 1, borderRadius: 1, backgroundColor: '#E6B000' },
  sprintMediaActionText: { color: '#353B37', fontSize: 11, fontWeight: '700' },
  sprintSubmissionAttachment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 5,
  },
  sprintSubmissionAttachmentName: { flex: 1, color: '#353B37', fontSize: 11 },
  sprintSubmissionRemove: { padding: 4 },
  sprintSubmissionRemoveText: { color: '#B42318', fontSize: 10, fontWeight: '700' },
  sprintLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sprintLinkInput: {
    flex: 1,
    minHeight: 36,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: '#D9DFDA',
    borderRadius: 999,
    color: '#272D29',
    fontSize: 11,
  },
  sprintSubmissionError: { color: '#B42318', fontSize: 11, lineHeight: 16 },
  sprintSubmittedDetails: { gap: 8, paddingTop: 8 },
  sprintSubmittedMessage: { color: '#15803D', fontSize: 12, fontWeight: '700' },
  sprintSubmittedLink: { color: '#52665A', fontSize: 11 },
  assignedSprintDescription: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
  },
  assignedSprintBullet: { color: '#353B37', fontSize: 12, fontWeight: '600' },
  assignedSprintName: { flex: 1, color: '#353B37', fontSize: 12, fontWeight: '600' },
  assignedSprintStartButton: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 9,
    borderRadius: 5,
    backgroundColor: '#F0444F',
  },
  assignedSprintSubmitButton: { borderRadius: 999, backgroundColor: '#E6B000' },
  assignedSprintSubmitText: { color: '#FFFDD0', fontSize: 10, fontWeight: '800' },
  assignedSprintStartText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  taskAttachmentCard: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderRadius: 12,
    backgroundColor: '#F3F4F3',
  },
  attachmentImagePreview: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 20,
    backgroundColor: '#F0F3F0',
  },
  attachmentImage: { width: '100%', height: '100%' },
  attachmentImageUnavailable: { color: '#A33A32', fontSize: 17, fontWeight: '800' },
  attachmentAudioTile: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  attachmentVoiceNotePlay: {
    position: 'absolute',
    right: -2,
    bottom: 9,
  },
  attachmentFileIconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentFileIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentFileType: {
    position: 'absolute',
    top: 24,
    width: 24,
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 6,
    fontWeight: '800',
  },
  taskAttachmentCopy: { flex: 1, minWidth: 0, gap: 2 },
  taskAttachmentName: { color: '#34433D', fontSize: 11, fontWeight: '700' },
  taskAttachmentDetails: { color: '#858C87', fontSize: 9, fontWeight: '500' },
  attachmentAudioProgressTrack: {
    height: 3,
    overflow: 'hidden',
    borderRadius: 2,
    backgroundColor: '#E8ECE9',
  },
  attachmentAudioProgress: { height: '100%', borderRadius: 2, backgroundColor: '#315F4D' },
  attachmentAudioTime: {
    alignSelf: 'flex-end',
    color: '#858C87',
    fontSize: 8,
    fontWeight: '500',
  },
  attachmentError: { color: '#B42318', fontSize: 8, fontWeight: '500' },
  attachmentDownloadButton: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentActionDisabled: { opacity: 0.55 },
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
});