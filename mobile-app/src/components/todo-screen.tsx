import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
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
import { Directory, File, Paths } from 'expo-file-system';
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
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
  fetchHomeTaskTags,
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
  | 'download'
  | 'play'
  | 'pause'
  | 'chevronDown'
  | 'folder'
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
    download: <Path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4" />,
    play: <Path d="m8 5 11 7-11 7z" fill={color} stroke="none" />,
    pause: (
      <>
        <Path d="M8 5v14M16 5v14" strokeWidth={3} />
      </>
    ),
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
      const data = await ensureAttachmentData();
      const downloadsDirectory = new Directory(Paths.document, 'Downloads');
      if (!downloadsDirectory.exists) downloadsDirectory.create({ intermediates: true });
      await writeTaskAttachment(downloadsDirectory, data);
      Alert.alert('Download complete', `${attachment.fileName} was saved to the app's Downloads.`);
    } catch (error) {
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
                <Svg width={8} height={8} viewBox="0 0 24 24">
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
  const [taskTagsRefreshFailed, setTaskTagsRefreshFailed] = useState(false);

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

    async function refreshSelectedTaskTags() {
      try {
        const tags = await fetchHomeTaskTags(projectId, taskId);
        if (!active || tags === null) return;
        setTasks((current) => current.map((item) => (
          item.id === taskId ? { ...item, tags } : item
        )));
      } catch (error) {
        console.error('Unable to refresh task modal tags:', error);
        if (active) setTaskTagsRefreshFailed(true);
      }
    }

    void refreshSelectedTaskTags();
    return () => { active = false; };
  }, [selectedTaskId, selectedTaskProjectId]);

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
    right: 1,
    bottom: 4,
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