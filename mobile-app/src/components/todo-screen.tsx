import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type SetStateAction } from 'react';
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
  Ellipse,
  G,
  LinearGradient,
  Path,
  RadialGradient,
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
  submitHomeTaskForReview,
  updateHomeTaskStatus,
  type HomeProject,
  type HomeTask,
  type HomeTaskAttachment,
  type HomeTaskSubmissionAttachment,
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
  | 'arrowLeft'
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
  | 'workUpdate'
  | 'clock'
  | 'sliders'
  | 'paperclip'
  | 'fileText'
  | 'bolt'
  | 'link';

type Task = {
  id: string;
  projectId: string;
  title: string;
  project: string;
  taskSubmissionStatus: string;
  taskSubmissionNote: string;
  taskSubmissionLinks: string[];
  taskSubmissionAttachments: HomeTaskSubmissionAttachment[];
  taskSubmittedAt: string | null;
  updatedAt: string | null;
  priority: string;
  due: string | null;
  status: string;
  progress: number;
  category: string | null;
  tags: string[];
  description: string | null;
  attachments: HomeTaskAttachment[];
  createdBy: string;
  createdByFirebaseUid: string | null;
  createdByProfileImage: string | null;
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
  Completed: { title: 'Completed', description: 'Completed tasks' },
};

function Icon({
  name,
  size = 20,
  color = '#334155',
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
        <Path d="m1.5 4 1.5 1.5L6 2.5M1.5 12l1.5 1.5L6 10.5M1.5 20l1.5 1.5L6 18.5" stroke="#1D4ED8" strokeWidth={2.2} />
        <Rect x="9" y="2" width="14" height="4" rx="2" fill="#F97316" fillOpacity={0.2} stroke="#F97316" strokeWidth={1.5} />
        <Rect x="9" y="10" width="14" height="4" rx="2" fill="#EAB308" fillOpacity={0.2} stroke="#EAB308" strokeWidth={1.5} />
        <Rect x="9" y="18" width="14" height="4" rx="2" fill="#22C55E" fillOpacity={0.2} stroke="#22C55E" strokeWidth={1.5} />
      </>
    ),
    doneCircle: (
      <>
        <Circle cx="12" cy="12" r="10" fill="#15803D" stroke="none" />
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
    arrowLeft: <Path d="M19 12H5M11 6l-6 6 6 6" />,
    clock: (
      <>
        <Circle cx="12" cy="12" r="9" />
        <Path d="M12 7v5l3 2" />
      </>
    ),
    sliders: (
      <>
        <Path d="M4 7h16M4 17h16" />
        <Circle cx="9" cy="7" r="2.2" fill={color} stroke="none" />
        <Circle cx="15" cy="17" r="2.2" fill={color} stroke="none" />
      </>
    ),
    paperclip: (
      <Path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    ),
    fileText: (
      <>
        <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <Path d="M14 2v6h6M8 13h8M8 17h5" />
      </>
    ),
    bolt: (
      <Path
        d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"
        fill={color}
        stroke={color}
        strokeWidth={1.4}
      />
    ),
    link: (
      <>
        <Path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <Path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </>
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

function CollabBrandMark() {
  return (
    <View style={styles.brandRow} accessibilityLabel="Collab">
      <Svg width={24} height={22} viewBox="0 0 28 24" fill="none">
        <Rect x={2} y={12} width={10} height={10} rx={3} fill="#0F172A" />
        <Rect x={13} y={3} width={11} height={19} rx={3.5} fill="#1E293B" />
        <Circle cx={7} cy={7} r={3} fill="#0F172A" />
      </Svg>
      <Text style={styles.brandWordmark}>
        Collab<Text style={styles.brandDot}>.</Text>
      </Text>
    </View>
  );
}

function ProductiveIllustration() {
  return (
    <Svg width={116} height={90} viewBox="0 0 120 92" fill="none" accessibilityElementsHidden>
      <Defs>
        <LinearGradient id="clipBody" x1="22" y1="14" x2="68" y2="76" gradientUnits="userSpaceOnUse">
          <Stop stopColor="#334155" />
          <Stop offset="1" stopColor="#0F172A" />
        </LinearGradient>
        <LinearGradient id="goldClock" x1="68" y1="36" x2="108" y2="78" gradientUnits="userSpaceOnUse">
          <Stop stopColor="#FFE066" />
          <Stop offset="1" stopColor="#F59E0B" />
        </LinearGradient>
        <RadialGradient id="goldOrb" cx="35%" cy="35%" r="65%">
          <Stop stopColor="#FFE885" />
          <Stop offset="1" stopColor="#F59E0B" />
        </RadialGradient>
      </Defs>
      <Ellipse cx={60} cy={83} rx={42} ry={5} fill="rgba(15,23,42,0.08)" />
      <Circle cx={15} cy={60} r={6.5} fill="url(#goldOrb)" />
      <Circle cx={82} cy={18} r={4.5} fill="url(#goldOrb)" />
      <G rotation={-8} origin="46, 48">
        <Rect x={24} y={14} width={46} height={62} rx={10} fill="url(#clipBody)" />
        <Rect x={29} y={21} width={36} height={49} rx={6} fill="#FFFFFF" />
        <Rect x={38} y={10} width={18} height={8} rx={4} fill="#94A3B8" />
        <Circle cx={37} cy={33} r={4} fill="#3B82F6" />
        <Path d="M35.2 33L36.5 34.3L39 31.8" stroke="#FFFFFF" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        <Rect x={44} y={31.5} width={15} height={3} rx={1.5} fill="#CBD5E1" />
        <Circle cx={37} cy={45} r={4} fill="#3B82F6" />
        <Path d="M35.2 45L36.5 46.3L39 43.8" stroke="#FFFFFF" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        <Rect x={44} y={43.5} width={15} height={3} rx={1.5} fill="#CBD5E1" />
        <Circle cx={37} cy={57} r={4} fill="#3B82F6" />
        <Path d="M35.2 57L36.5 58.3L39 55.8" stroke="#FFFFFF" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        <Rect x={44} y={55.5} width={12} height={3} rx={1.5} fill="#CBD5E1" />
      </G>
      <Circle cx={84} cy={58} r={20} fill="url(#goldClock)" />
      <Circle cx={84} cy={58} r={15.5} fill="#FEF08A" />
      <Path d="M84 48V58L91 61" stroke="#111827" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={84} cy={58} r={2.2} fill="#111827" />
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
            <ActivityIndicator size="small" color="#1E3A8A" />
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
              <Svg width={22} height={22} viewBox="0 0 16 16">
                <G
                  fill="none"
                  stroke="#1E3A8A"
                  strokeLinecap="round"
                  strokeLinejoin="round">
                  <Path d="M5.5 12.5a2 2 0 0 1-2 2a2 2 0 0 1-2-2a2 2 0 0 1 2-2a2 2 0 0 1 2 2m9-2a2 2 0 0 1-2 2a2 2 0 0 1-2-2a2 2 0 0 1 2-2a2 2 0 0 1 2 2" />
                  <Path d="M5.5 12.5V5c0-.54.44-1.21 1.35-1.5l6.3-2c.9 0 1.35.88 1.35 1.5v7.58m-9-3.08l9-3" />
                </G>
              </Svg>
              <View style={styles.attachmentVoiceNotePlay}>
                <Svg width={10} height={10} viewBox="0 0 24 24">
                  <Path
                    fill="#1D4ED8"
                    stroke="none"
                    d="M7.01 2a3 3 0 0 1 1.502.41l11.994 6.995A3 3 0 0 1 22 11.998a3 3 0 0 1-1.323 2.49l-.166.105l-12 7A3.002 3.002 0 0 1 4 19V5.001A3 3 0 0 1 7.01 2"
                  />
                </Svg>
              </View>
            </>
          ) : (
            <Svg width={18} height={18} viewBox="0 0 24 24">
              <Path
                fill="#1E3A8A"
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
          <ActivityIndicator size="small" color="#475569" />
        ) : (
          <Icon name="download" size={14} color="#475569" />
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
    taskSubmissionStatus: task.taskSubmissionStatus || 'Not submitted',
    taskSubmissionNote: task.taskSubmissionNote || '',
    taskSubmissionLinks: task.taskSubmissionLinks || [],
    taskSubmissionAttachments: task.taskSubmissionAttachments || [],
    taskSubmittedAt: task.taskSubmittedAt || null,
    updatedAt: task.updatedAt || null,
    priority: task.priority || 'No priority',
    due: task.dueDate,
    status: task.status || 'To do',
    progress: normalizedStatus === 'done'
      ? 100
      : normalizedStatus === 'in progress' ? 50 : 0,
    category: task.category || null,
    tags: task.tags || [],
    description: task.description || null,
    attachments: task.descriptionAttachments || [],
    createdBy: createdBy || project.creatorName || project.creatorEmail || 'Project owner',
    createdByFirebaseUid: task.createdByFirebaseUid || null,
    createdByProfileImage: taskCreatorIsProjectOwner
      ? project.creatorProfileImage || null
      : taskCreator?.profileImage || project.creatorProfileImage || null,
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
    <View
      accessibilityLabel={isOverdue ? 'Task overdue' : `Time remaining: ${label}`}
      style={[styles.taskCountdownPill, isOverdue && styles.taskCountdownPillOverdue]}>
      <Icon
        name="clock"
        size={11}
        color={isOverdue ? '#DC2626' : '#1E3A8A'}
      />
      <Text
        numberOfLines={1}
        style={[styles.taskCountdownText, isOverdue && styles.taskCountdownTextOverdue]}>
        {label}
      </Text>
    </View>
  );
}

function TaskCard({
  task,
  onOpen,
  onStart,
  starting,
}: {
  task: Task;
  onOpen: () => void;
  onStart: () => void;
  starting: boolean;
}) {
  const status = task.status.trim().toLowerCase();
  const done = status === 'done';
  const inProgress = status === 'in progress';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open task ${task.title}`}
      onPress={onOpen}
      style={({ pressed }) => [
        styles.taskCard,
        done && styles.taskCardDone,
        pressed && { opacity: 0.96 },
      ]}>
      <View style={styles.cardMain}>
        <View style={styles.taskTitleRow}>
          <View style={styles.taskTitleIcon}>
            <Icon name="campaign" size={18} color="#1E3A8A" />
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
              size={14}
              color={isDueToday(task.due) ? '#DC2626' : '#FFFFFF'}
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
              <Icon name="listCheck" size={15} color="#334155" />
            </View>
            <View style={styles.metaIconButton}>
              <Icon name="tag" size={15} color="#334155" />
            </View>
            <View style={styles.metaIconButton}>
              <Icon name="users" size={15} color="#334155" />
            </View>
          </View>
        </View>
      </View>

      <View style={styles.cardFooter}>
        <View
          accessibilityLabel={`Project ${task.project}`}
          style={styles.projectMetaRow}>
          <Text numberOfLines={1} style={styles.projectMetaName}>{task.project}</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${starting ? 'Starting' : done ? 'View' : inProgress ? 'Continue' : 'Start'} task ${task.title}`}
          disabled={starting}
          onPress={done || inProgress ? onOpen : onStart}
          style={[
            styles.statusButton,
            !done && !inProgress && styles.startTaskButton,
            inProgress && styles.continueTaskButton,
            starting && styles.taskActionDisabled,
          ]}>
          {starting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              {!inProgress ? (
                <Text style={styles.statusButtonText}>{done ? 'View' : 'Start'}</Text>
              ) : null}
              <Icon name="arrow" size={16} color="#FFFFFF" />
            </>
          )}
        </Pressable>
      </View>
    </Pressable>
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
  const [expandedSprintName, setExpandedSprintName] = useState<string | null>(null);
  const [expandedSubmissionKey, setExpandedSubmissionKey] = useState('');
  const [submissionDrafts, setSubmissionDrafts] = useState<Record<string, {
    note: string;
    attachments: SprintSubmissionAttachment[];
    links: string[];
    linkDraft: string;
    busy: boolean;
    error: string;
  }>>({});

  const activeSubmissionDraft = submissionDrafts[expandedSubmissionKey] || {
    note: '',
    attachments: [] as SprintSubmissionAttachment[],
    links: [] as string[],
    linkDraft: '',
    busy: false,
    error: '',
  };
  const submissionNote = activeSubmissionDraft.note;
  const submissionAttachments = activeSubmissionDraft.attachments;
  const submissionLinks = activeSubmissionDraft.links;
  const submissionLinkDraft = activeSubmissionDraft.linkDraft;
  const submissionBusy = activeSubmissionDraft.busy;
  const submissionError = activeSubmissionDraft.error;

  function updateSubmissionDraft(
    key: string,
    updater: (current: {
      note: string;
      attachments: SprintSubmissionAttachment[];
      links: string[];
      linkDraft: string;
      busy: boolean;
      error: string;
    }) => {
      note: string;
      attachments: SprintSubmissionAttachment[];
      links: string[];
      linkDraft: string;
      busy: boolean;
      error: string;
    },
  ) {
    if (!key) return;
    setSubmissionDrafts((current) => {
      const existing = current[key] || {
        note: '',
        attachments: [],
        links: [],
        linkDraft: '',
        busy: false,
        error: '',
      };
      return { ...current, [key]: updater(existing) };
    });
  }

  function updateActiveSubmissionDraft(updater: Parameters<typeof updateSubmissionDraft>[1]) {
    updateSubmissionDraft(expandedSubmissionKey, updater);
  }

  function setSubmissionNote(value: string) {
    updateActiveSubmissionDraft((current) => ({ ...current, note: value }));
  }

  function setSubmissionAttachments(value: SetStateAction<SprintSubmissionAttachment[]>) {
    updateActiveSubmissionDraft((current) => ({
      ...current,
      attachments: typeof value === 'function' ? value(current.attachments) : value,
    }));
  }

  function setSubmissionLinks(value: SetStateAction<string[]>) {
    updateActiveSubmissionDraft((current) => ({
      ...current,
      links: typeof value === 'function' ? value(current.links) : value,
    }));
  }

  function setSubmissionLinkDraft(value: string) {
    updateActiveSubmissionDraft((current) => ({ ...current, linkDraft: value }));
  }

  function setSubmissionError(value: string) {
    updateActiveSubmissionDraft((current) => ({ ...current, error: value }));
  }

  function setSubmissionBusy(value: boolean) {
    updateActiveSubmissionDraft((current) => ({ ...current, busy: value }));
  }

  useEffect(() => {
    let active = true;

    async function loadAssignedTasks() {
      const currentUser = firebaseAuth.currentUser;
      if (!currentUser) {
        setLoadError('Sign in to see your tasks.');
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
          .map((task) => taskFromHomeTask(
            task,
            result.value.project,
          )));
        }

        if (failedProjects > 0 && successfulProjects === 0) {
          throw new HomeApiError('Your tasks could not be loaded. Please try again later.', 502);
        }
        setTasks(loadedTasks);
        if (failedProjects > 0) {
          setWarning(`Tasks from ${failedProjects} project${failedProjects === 1 ? '' : 's'} could not be loaded.`);
        }
      } catch (error) {
        console.error("Unable to load the signed-in user's tasks:", error);
        if (active) {
          setLoadError(error instanceof HomeApiError
            ? error.message
            : 'Your tasks could not be loaded. Please try again.');
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
  const selectedAssignedSprints = selectedTask
    ? [{
      sprint: {
        name: 'Task submission',
        status: selectedTask.taskSubmissionStatus,
      },
      task: selectedTask,
    }]
    : [];
  const selectedTaskProjectId = selectedTask?.projectId;
  const selectedCreatorProfileImage = selectedTask
    ? (selectedTask.createdByFirebaseUid
      ? profileImagesByUid[selectedTask.createdByFirebaseUid]
      : undefined) ?? selectedTask.createdByProfileImage
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
            taskSubmissionStatus: details.taskSubmissionStatus,
            taskSubmissionNote: details.taskSubmissionNote,
            taskSubmissionLinks: details.taskSubmissionLinks,
            taskSubmissionAttachments: details.taskSubmissionAttachments,
            taskSubmittedAt: details.taskSubmittedAt,
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
    setExpandedSprintName(null);
    setExpandedSubmissionKey('');
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
          throw new Error('Task submission attachments must total 100 MB or less.');
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
      console.error('Unable to add task submission attachments:', error);
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
            throw new Error('Task submission attachments must total 100 MB or less.');
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

  async function submitSelectedTaskForReview(task: Task) {
    if (!task.projectId || submissionBusy) return;
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
      setSubmissionError('Task submission attachments must total 100 MB or less.');
      return;
    }
    if (!note && submissionAttachments.length === 0 && submissionLinks.length === 0) {
      setSubmissionError('Add a submission note, file or voice note, or link before submitting.');
      return;
    }
    const submissionKey = `${task.projectId}:${task.id}`;
    updateSubmissionDraft(submissionKey, (current) => ({
      ...current,
      busy: true,
      error: '',
    }));
    try {
      await submitHomeTaskForReview(
        task.projectId,
        task.id,
        note,
        submissionAttachments,
        submissionLinks,
      );
      const submittedAt = new Date().toISOString();
      setTasks((current) => current.map((item) => item.id === task.id ? {
        ...item,
        taskSubmissionStatus: 'Pending Review',
        taskSubmissionNote: note,
        taskSubmissionLinks: submissionLinks,
        taskSubmissionAttachments: submissionAttachments.map((attachment) => ({
          fileName: attachment.fileName,
          mediaType: attachment.mediaType,
          size: attachment.size,
          isVoiceNote: attachment.is_voice_note === true,
        })),
        taskSubmittedAt: submittedAt,
      } : item));
      updateSubmissionDraft(submissionKey, (current) => ({
        ...current,
        note: '',
        attachments: [],
        links: [],
        linkDraft: '',
        busy: false,
        error: '',
      }));
    } catch (error) {
      console.error('Unable to submit task for review:', error);
      updateSubmissionDraft(submissionKey, (current) => ({
        ...current,
        busy: false,
        error: error instanceof HomeApiError
          ? error.message
          : 'The task could not be submitted for review.',
      }));
    }
  }

  async function nextStatus(task: Task, requestedStatus?: string) {
    if (busyTaskId) return;
    const currentStatus = task.status.trim().toLowerCase();
    const status = requestedStatus || (currentStatus === 'done'
      ? 'To do'
      : currentStatus === 'in progress' ? 'Done' : 'In progress');
    const progress = status === 'Done'
      ? 100
      : status === 'In progress' ? Math.max(task.progress, 25) : 0;

    if (currentStatus === 'in progress' && status === 'Done' &&
      task.taskSubmissionStatus !== 'Completed') {
      setLoadError('This task can be completed after its submission is accepted.');
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
      if (requestedStatus === 'In progress') setFilter('In progress');
    } catch (error) {
      console.error('Unable to update assigned task status:', error);
      setLoadError(error instanceof HomeApiError
        ? error.message
        : 'Task status could not be updated. Please try again.');
    } finally {
      setBusyTaskId(null);
    }
  }

  const canSubmitSelectedTask = Boolean(selectedTask) &&
    !['Pending Review', 'Completed'].includes(selectedTask?.taskSubmissionStatus || '');

  function openTaskSubmissionForm() {
    if (!selectedTask || !canSubmitSelectedTask) return;
    setExpandedSprintName('Task submission');
    setExpandedSubmissionKey(`${selectedTask.projectId}:${selectedTask.id}`);
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
            <View style={styles.sectionTitleWrap}>
              <Text style={styles.sectionTitle}>
                {filter === 'All' || filter === 'Today' ? 'My tasks' : filter}
              </Text>
              <View style={styles.sectionTitleUnderline} />
            </View>
            <Text style={styles.taskCount}>
              {visibleTasks.length} task{visibleTasks.length === 1 ? '' : 's'}
            </Text>
          </View>
        </View>

        <View style={styles.searchBox}>
          <Icon name="search" size={17} color="#64748B" />
          <TextInput
            accessibilityLabel="Search your tasks"
            value={query}
            onChangeText={setQuery}
            placeholder="Search your tasks..."
            placeholderTextColor="#94A3B8"
            returnKeyType="search"
            style={styles.searchInput}
          />
          {query ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear task search"
              onPress={() => setQuery('')}
              style={styles.clearSearchButton}>
              <Icon name="close" size={16} color="#334155" />
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Sort by due date${dueDateAscending === null
                ? ''
                : `, currently ${dueDateAscending ? 'ascending' : 'descending'}`}`}
              onPress={() => setDueDateAscending((ascending) => ascending === null || !ascending)}
              style={[
                styles.searchFilterButton,
                dueDateAscending !== null && styles.searchFilterButtonActive,
              ]}>
              <Icon name="sliders" size={15} color="#0F172A" />
            </Pressable>
          )}
        </View>

        <View style={styles.filterTabsRow} accessibilityLabel="Filter tasks">
          {filters.map((item) => {
            const { title, description } = filterCopy[item];
            const isActive = filter === item;
            const iconColor = isActive ? '#FFFFFF' : '#334155';
            const iconName: IconName = item === 'Today'
              ? 'calendar'
              : item === 'All'
                ? 'users'
                : item === 'In progress'
                  ? 'listCheck'
                  : 'check';

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
                <View style={styles.filterButtonContent}>
                  <View style={styles.filterIconContainer}>
                    <Icon name={iconName} size={17} color={iconColor} />
                  </View>
                  <View style={styles.filterButtonText}>
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
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.7}
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
        </View>

        <View style={styles.taskSection}>
          {loading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator color="#0F172A" />
              <Text style={styles.emptyDescription}>Loading your tasks...</Text>
            </View>
          ) : (
            <View style={styles.taskList}>
              {visibleTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onOpen={() => setSelectedTaskId(task.id)}
                  onStart={() => { void nextStatus(task, 'In progress'); }}
                  starting={busyTaskId === task.id}
                />
              ))}
              {visibleTasks.length <= 1 ? (
                <View style={styles.productiveWrap}>
                  <ProductiveIllustration />
                  <Text style={styles.productiveTitle}>
                    {visibleTasks.length === 0
                      ? (tasks.length === 0 ? 'No tasks available' : 'All caught up!')
                      : 'Stay productive!'}
                  </Text>
                  <Text style={styles.productiveSubtitle}>
                    {visibleTasks.length === 0
                      ? (tasks.length === 0
                        ? 'Tasks from your projects will appear here.'
                        : 'You are clear for this filter. Try switching to All.')
                      : 'You’re all caught up for now.'}
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
                { paddingTop: Math.max(insets.top, 16) },
                { paddingBottom: Math.max(insets.bottom, 12) },
              ]}>
              <View style={styles.detailsHeader}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={expandedSprintName ? 'Open menu' : 'Back to task list'}
                  onPress={expandedSprintName ? onOpenMenu : () => setSelectedTaskId(null)}
                  style={styles.menuButton}>
                  {expandedSprintName ? (
                    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
                      <Path
                        d="M3.75 6h16.5M3.75 18h16.5m-16.5-6h10.5"
                        stroke="#0F172A"
                        strokeWidth={1.8}
                        strokeLinecap="round"
                      />
                    </Svg>
                  ) : (
                    <Icon name="arrowLeft" size={18} color="#0F172A" />
                  )}
                </Pressable>

                <CollabBrandMark />

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
                  <View style={styles.detailTitleRow}>
                    <View style={styles.detailTitleIcon}>
                      <Icon name="campaign" size={20} color="#1E3A8A" />
                    </View>
                    <View style={styles.detailTitleCopy}>
                      <Text style={styles.detailTitle}>{selectedTask.title}</Text>
                    </View>
                  </View>
                  <Text style={styles.detailProject}>
                    [selectedTask.project]
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
                    <Text style={styles.metadataLabel}>Last modified</Text>
                    <View style={styles.metadataValueContainer}>
                      <Icon name="calendar" size={15} color="#334155" />
                      <Text style={styles.metadataValue}>
                        {formatTaskUpdatedAt(selectedTask.updatedAt)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.metadataRow}>
                    <Text style={styles.metadataLabel}>Due date</Text>
                    <View style={styles.metadataValueContainer}>
                      <Icon name="calendar" size={15} color="#334155" />
                      <Text style={styles.metadataValue}>
                        {formatDueDate(selectedTask.due)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.metadataRow}>
                    <Text style={styles.metadataLabel}>Status</Text>
                    <View style={styles.metadataValueContainer}>
                      <View
                        style={[
                          styles.statusBadgePill,
                          (selectedTask.status.trim().toLowerCase() === 'in progress' ||
                            selectedTask.status.trim().toLowerCase() === 'done') &&
                            styles.statusBadgePillActive,
                        ]}>
                        <View
                          style={[
                            styles.statusDot,
                            selectedTask.status.trim().toLowerCase() === 'done'
                              ? styles.statusDotDone
                              : selectedTask.status.trim().toLowerCase() === 'in progress'
                                ? styles.statusDotInProgress
                                : styles.statusDotDefault,
                          ]}
                        />
                        <Text
                          style={[
                            styles.statusBadgeText,
                            (selectedTask.status.trim().toLowerCase() === 'in progress' ||
                              selectedTask.status.trim().toLowerCase() === 'done') &&
                              styles.statusBadgeTextActive,
                          ]}>
                          {selectedTask.status.trim().toLowerCase() === 'in progress'
                            ? 'In Progress'
                            : selectedTask.status}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.metadataRow}>
                    <Text style={styles.metadataLabel}>Priority</Text>
                    <View style={styles.metadataValueContainer}>
                      <View
                        style={[
                          styles.priorityBadgePill,
                          selectedTask.priority.trim().toLowerCase() === 'medium' &&
                            styles.priorityBadgeMedium,
                          !['high', 'medium', 'low'].includes(selectedTask.priority.trim().toLowerCase()) &&
                            styles.priorityBadgeNormal,
                        ]}>
                        <Text
                          style={[
                            styles.priorityText,
                            {
                              color: selectedTask.priority.trim().toLowerCase() === 'medium'
                                ? '#B45309'
                                : ['high', 'low'].includes(selectedTask.priority.trim().toLowerCase())
                                  ? '#DC2626'
                                  : '#64748B',
                            },
                          ]}>
                          {selectedTask.priority || 'Normal'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.metadataRow}>
                    <Text style={[styles.metadataLabel, styles.tagsMetadataLabel]}>Tags</Text>
                    <View style={styles.tagsContainer}>
                      {selectedTask.tags.length ? (
                        selectedTask.tags.map((tag) => (
                          <Text key={tag} style={styles.categoryTag}>{tag}</Text>
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
                  <View style={styles.sectionHeadingRow}>
                    <View style={styles.sectionHeadingIconBadge}>
                      <Icon name="fileText" size={14} color="#D97706" />
                    </View>
                    <Text style={styles.sectionLabel}>Description</Text>
                  </View>
                  <Text style={styles.descriptionText}>
                    {selectedTask.description || 'No description provided.'}
                  </Text>
                </View>

                <View style={styles.attachmentSection}>
                  <View style={styles.attachmentHeaderRow}>
                    <View style={styles.attachmentHeaderLeft}>
                      <Icon name="paperclip" size={16} color="#334155" />
                      <Text style={styles.sectionLabel}>
                        Attachments ({selectedTask.attachments.length})
                      </Text>
                    </View>
                    <Icon name="chevron" size={15} color="#64748B" />
                  </View>
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
                    <Text style={styles.assignedSprintTitle}>Task submission</Text>
                  </View>
                  {selectedAssignedSprints.length > 0 ? (
                    selectedAssignedSprints.map(({ sprint, task: sprintTask }) => {
                      const expanded = expandedSprintName === sprint.name;
                      const taskStatus = sprintTask?.status.trim().toLowerCase() || '';
                      const submissionStatus = sprintTask?.taskSubmissionStatus || sprint.status;
                      const alreadySubmitted = ['Pending Review', 'Completed']
                        .includes(submissionStatus);
                      return (
                        <View key={sprint.name} style={styles.assignedSprintItem}>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`View details for ${sprint.name}`}
                            accessibilityState={{ expanded }}
                            onPress={() => {
                              const nextSprintName = expandedSprintName === sprint.name
                                ? null
                                : sprint.name;
                              setExpandedSprintName(nextSprintName);
                              setExpandedSubmissionKey(nextSprintName
                              ? `${selectedTask.projectId}:${selectedTask.id}`
                                : '');
                            }}
                            style={styles.assignedSprintExpandButton}>
                            <View style={styles.assignedSprintDescription}>
                              <Icon
                                name="bolt"
                                size={15}
                                color="#1E293B"
                              />
                              <Text style={styles.assignedSprintName}>{sprint.name}</Text>
                            </View>
                            <View style={styles.assignedSprintViewDetails}>
                              <Text
                                style={[
                                  styles.assignedSprintStatus,
                                  styles.assignedSprintStatusActive,
                                ]}>
                                {alreadySubmitted ? submissionStatus : 'Active'}
                              </Text>
                              <Icon name={expanded ? 'chevronDown' : 'chevron'} size={15} color="#64748B" />
                            </View>
                          </Pressable>
                          {!expanded && (sprintTask?.description || sprint.description) ? (
                            <Text numberOfLines={2} style={styles.sprintDescription}>
                              {sprintTask?.description || sprint.description}
                            </Text>
                          ) : null}
                          {sprintTask && taskStatus !== 'in progress' &&
                          taskStatus !== 'done' && !alreadySubmitted ? (
                            <View style={styles.assignedSprintStartRow}>
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={`Start ${sprint.name}`}
                                disabled={busyTaskId === sprintTask.id}
                                onPress={() => { void nextStatus(sprintTask); }}
                                style={[
                                  styles.assignedSprintStartButton,
                                  busyTaskId === sprintTask.id && styles.primaryActionDisabled,
                                ]}>
                                {busyTaskId === sprintTask.id ? (
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
                          {expanded ? (
                            <View style={styles.sprintDetails}>
                              <Text style={styles.sprintDescription}>
                                {sprintTask?.description || 'No task details have been added.'}
                              </Text>
                              {sprintTask ? <>
                              <View style={styles.sprintProgressHeading}>
                                <Text style={styles.sectionLabel}>Progress</Text>
                                <Text style={styles.sprintProgressPercent}>
                                  {sprintTask.progress}%
                                </Text>
                              </View>
                              <View
                                accessibilityRole="progressbar"
                                accessibilityValue={{ min: 0, max: 100, now: sprintTask.progress }}
                                style={styles.sprintProgressTrack}>
                                <View
                                  style={[
                                    styles.sprintProgressFill,
                                    { width: `${sprintTask.progress}%` },
                                  ]}
                                />
                              </View>
                              </> : null}

                              {!alreadySubmitted && taskStatus === 'in progress' ? (
                            <View style={styles.sprintSubmissionForm}>
                              <TextInput
                                accessibilityLabel="Task submission notes"
                                placeholder="Summarize the completed task work..."
                                placeholderTextColor="#94A3B8"
                                value={submissionNote}
                                onChangeText={setSubmissionNote}
                                multiline
                                maxLength={5000}
                                style={styles.taskSubmissionNote}
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
                                  <Icon name="folder" size={15} color="#0F172A" />
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
                                    size={voiceNoteActive ? 20 : 19}
                                    color="#FFFFFF"
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
                                      size={18}
                                      color="#FFFFFF"
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
                                <View style={styles.sprintLinkInputWrap}>
                                  <Icon name="link" size={14} color="#94A3B8" />
                                  <TextInput
                                    accessibilityLabel="Task submission link"
                                    placeholder="Add a link (https://...)"
                                    placeholderTextColor="#94A3B8"
                                    value={submissionLinkDraft}
                                    onChangeText={setSubmissionLinkDraft}
                                    autoCapitalize="none"
                                    keyboardType="url"
                                    style={styles.sprintLinkInputField}
                                  />
                                </View>
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel="Add link"
                                  onPress={addSprintSubmissionLink}
                                  style={[styles.sprintMediaAction, styles.sprintMediaActionWithIcon]}>
                                  <Icon name="webPhone" size={15} color="#0F172A" />
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
                                accessibilityLabel="Submit task for review"
                                disabled={submissionBusy || voiceNoteActive}
                                onPress={() => { void submitSelectedTaskForReview(selectedTask); }}
                                style={[
                                  styles.assignedSprintStartButton,
                                  styles.assignedSprintSubmitButton,
                                  (submissionBusy || voiceNoteActive) &&
                                    styles.primaryActionDisabled,
                                ]}>
                                {submissionBusy ? (
                                <ActivityIndicator size="small" color="#FFFFFF" />
                                ) : (
                                  <>
                                  <Text style={styles.assignedSprintSubmitText}>Submit for review</Text>
                                  <Icon name="check" size={16} color="#FFFFFF" />
                                  </>
                                )}
                              </Pressable>
                            </View>
                              ) : alreadySubmitted ? (
                            <View style={styles.sprintSubmittedDetails}>
                              <Text style={styles.sprintSubmittedMessage}>
                              {submissionStatus === 'Completed'
                                ? 'Task accepted'
                                : 'Submitted for review'}
                              </Text>
                              {sprintTask?.taskSubmissionNote ? (
                              <Text style={styles.sprintDescription}>
                                {sprintTask.taskSubmissionNote}
                              </Text>
                              ) : null}
                              {sprintTask?.taskSubmissionAttachments.map((attachment) => (
                              <Text
                                key={attachment.fileName}
                                style={styles.sprintSubmittedLink}>
                                - {attachment.fileName}
                              </Text>
                              ))}
                              {sprintTask?.taskSubmissionLinks.map((link) => (
                              <Text key={link} style={styles.sprintSubmittedLink}>
                                - {link}
                              </Text>
                              ))}
                            </View>
                              ) : submissionStatus === 'Changes Requested' ? (
                              <Text style={styles.sprintSubmissionError}>
                                Changes were requested. Start the task again to update and resubmit it.
                              </Text>
                              ) : null}
                            </View>
                          ) : null}
                        </View>
                      );
                    })
                  ) : (
                    <View style={styles.assignedSprintNoSprintRow}>
                      <Text style={styles.assignedSprintName}>
                        Task submission details are unavailable.
                      </Text>
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

              {!expandedSprintName && canSubmitSelectedTask ? (
                <View style={styles.modalQuickFooter}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Attach file to task"
                    onPress={openTaskSubmissionForm}
                    style={styles.modalQuickPill}>
                    <Icon name="folder" size={15} color="#0F172A" />
                    <Text style={styles.modalQuickPillText}>Attach File</Text>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Record a voice note for the task"
                    onPress={openTaskSubmissionForm}
                    style={styles.modalQuickMic}>
                    <Icon name="mic" size={17} color="#0F172A" />
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Add a link to the task"
                    onPress={openTaskSubmissionForm}
                    style={styles.modalQuickGoldPill}>
                    <Icon name="link" size={15} color="#FFFFFF" />
                    <Text style={styles.modalQuickGoldText}>Add Link</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F4F6FA' },
  taskContent: { flexGrow: 1, gap: 18, paddingHorizontal: 16, paddingTop: 18 },
  searchBox: {
    minHeight: 48,
    marginTop: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E5EAF2',
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 3,
  },
  searchInput: { flex: 1, minWidth: 0, paddingVertical: 10, color: '#0F172A', fontSize: 14 },
  clearSearchButton: { padding: 6 },
  progressCard: {
    padding: 20,
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 24,
    backgroundColor: '#0F172A',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 5,
  },
  progressHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressEyebrow: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  progressComplete: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: 'rgba(17,24,39,0.08)',
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  progressMain: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  progressCount: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  progressTitle: { color: '#FFFFFF', fontSize: 40, lineHeight: 44, fontWeight: '800', letterSpacing: -1.5 },
  progressMeta: { color: '#94A3B8', fontSize: 13, fontWeight: '600' },
  progressPercentBadge: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#3B82F6',
    borderRadius: 27,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  progressPercent: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  weeklyTrack: {
    height: 6,
    marginTop: 16,
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: 'rgba(17,24,39,0.12)',
  },
  weeklyTrackFill: { height: '100%', borderRadius: 999, backgroundColor: '#3B82F6' },
  loadErrorBanner: {
    padding: 14,
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 16,
    backgroundColor: '#FEE2E2',
  },
  loadErrorText: { color: '#DC2626', fontSize: 13, lineHeight: 19, fontWeight: '600' },
  warningText: { color: '#B45309', fontSize: 13, lineHeight: 19, fontWeight: '600' },
  filterTabsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  filterButton: {
    position: 'relative',
    flex: 1,
    minHeight: 78,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E5EAF2',
    borderRadius: 20,
    backgroundColor: '#EFF2F7',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  filterButtonActive: {
    borderColor: '#1E293B',
    backgroundColor: '#0F172A',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.36,
    shadowRadius: 14,
    elevation: 5,
  },
  filterButtonPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.97 }],
  },
  filterButtonContent: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  filterIconContainer: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
  },
  filterButtonText: { alignItems: 'center', justifyContent: 'center', gap: 1, minWidth: 0 },
  filterButtonTitle: {
    color: '#0F172A',
    fontSize: 11.5,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: -0.1,
    textAlign: 'center',
  },
  filterButtonTitleActive: { color: '#FFFFFF' },
  filterButtonDescription: {
    color: '#64748B',
    fontSize: 8.5,
    lineHeight: 11,
    fontWeight: '500',
    textAlign: 'center',
  },
  filterButtonDescriptionActive: { color: '#CBD5E1' },
  taskSection: { gap: 14, marginTop: 0 },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 2,
    marginBottom: 0,
    marginTop: 2,
  },
  sectionTitleCopy: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionTitleWrap: { alignSelf: 'flex-start' },
  sectionTitle: {
    color: '#0F172A',
    fontSize: 23,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  sectionTitleUnderline: {
    height: 3,
    marginTop: 4,
    borderRadius: 999,
    backgroundColor: '#0F172A',
  },
  taskCount: {
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#EFF2F7',
    color: '#475569',
    fontSize: 11.5,
    fontWeight: '600',
  },
  searchFilterButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#EFF2F7',
  },
  searchFilterButtonActive: {
    backgroundColor: '#EEF4FF',
  },
  taskList: { gap: 16 },
  taskCard: {
    minHeight: 204,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 15,
    borderWidth: 1,
    borderColor: '#E5EAF2',
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.07,
    shadowRadius: 22,
    elevation: 4,
  },
  taskCardDone: { opacity: 0.78, backgroundColor: '#EFF2F7' },
  cardMain: { flex: 1 },
  taskTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  taskTitleIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D6E4FF',
    backgroundColor: '#EEF4FF',
    transform: [{ translateY: 0 }],
  },
  taskTitleShift: { transform: [{ translateX: 0 }] },
  taskTitle: {
    flex: 1,
    marginTop: 1,
    color: '#0F172A',
    fontSize: 15.5,
    lineHeight: 21.5,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  taskCountdown: {
    flexShrink: 0,
    marginTop: 2,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#EFF6FF',
    color: '#1E3A8A',
    fontSize: 10.5,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  taskCountdownOverdue: {
    backgroundColor: '#FEE2E2',
    color: '#DC2626',
    fontWeight: '700',
  },
  taskTitleDone: { color: '#64748B', textDecorationLine: 'line-through' },
  taskDescriptionContainer: {
    marginTop: 12,
    paddingTop: 0,
  },
  taskDescription: {
    color: '#475569',
    fontSize: 13,
    lineHeight: 19.5,
  },
  taskMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 'auto',
    paddingTop: 16,
  },
  taskMetaPill: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 13,
    borderRadius: 999,
    backgroundColor: '#0F172A',
  },
  taskMetaText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  dueToday: { backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FECACA' },
  dueTodayText: { color: '#DC2626' },
  metaIcons: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 'auto' },
  metaIconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EFF2F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sprintCount: {
    flexShrink: 0,
    textAlignVertical: 'center',
    minWidth: 0,
    color: '#0F172A',
    fontSize: 11.5,
    fontWeight: '700',
    textAlign: 'left',
  },
  cardFooter: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  projectMetaRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#EFF2F7',
  },
  projectMetaName: { maxWidth: '88%', flexShrink: 1, color: '#475569', fontSize: 11, fontWeight: '600' },
  avatarRing: {
    width: 34,
    height: 34,
    overflow: 'hidden',
    textAlign: 'center',
    textAlignVertical: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    borderRadius: 17,
    color: '#FFFFFF',
    backgroundColor: '#0F172A',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 30,
  },
  statusButton: {
    minWidth: 84,
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: '#0F172A',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 3,
  },
  startTaskButton: {
    backgroundColor: '#1D4ED8',
    shadowColor: '#1D4ED8',
  },
  continueTaskButton: {
    width: 38,
    minWidth: 38,
    height: 38,
    minHeight: 38,
    paddingHorizontal: 0,
    borderRadius: 19,
    backgroundColor: '#0F172A',
  },
  taskActionDisabled: { opacity: 0.55 },
  statusButtonText: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '700' },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 48,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#CBD5E1',
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
  },
  emptyIcon: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#D6E4FF',
    backgroundColor: '#EEF4FF',
  },
  emptyTitle: { marginTop: 12, color: '#0F172A', fontSize: 16, fontWeight: '800' },
  emptyDescription: { marginTop: 4, color: '#64748B', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.48)',
  },
  taskDetailsCard: {
    width: '100%',
    overflow: 'hidden',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: '#F4F6FA',
    paddingTop: 16,
    paddingHorizontal: 18,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.16,
    shadowRadius: 26,
    elevation: 14,
  },
  detailsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
    paddingBottom: 10,
  },
  modalBrand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  menuButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5EAF2',
    borderRadius: 20,
    backgroundColor: '#EFF2F7',
  },
  modalLogo: { width: 108, height: 30 },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5EAF2',
    borderRadius: 20,
    backgroundColor: '#EFF2F7',
  },
  closeIcon: { color: '#0F172A', fontSize: 22, lineHeight: 24, fontWeight: '500' },
  detailsScroll: { flex: 1 },
  detailsContent: { paddingBottom: 32, gap: 18 },
  titleSection: { gap: 6, paddingBottom: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusDotDone: { backgroundColor: '#15803D' },
  statusDotInProgress: { backgroundColor: '#15803D' },
  statusDotDefault: { backgroundColor: '#94A3B8' },
  detailProject: { color: '#64748B', fontSize: 12.5, lineHeight: 18, fontWeight: '500' },
  detailTitle: {
    color: '#0F172A',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  metadataSection: {
    gap: 13,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E5EAF2',
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 3,
  },
  metadataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    minHeight: 28,
    columnGap: 12,
    rowGap: 6,
  },
  metadataLabel: { width: 92, color: '#64748B', fontSize: 12.5, fontWeight: '500' },
  tagsMetadataLabel: { width: 92 },
  metadataValueContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  metadataValue: { flexShrink: 1, color: '#0F172A', fontSize: 13, fontWeight: '700' },
  metadataIcon: { color: '#334155', fontSize: 16, fontWeight: '600' },
  creatorAvatar: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#D6E4FF',
    borderRadius: 13,
    backgroundColor: '#EEF4FF',
  },
  creatorAvatarImage: { width: '100%', height: '100%' },
  creatorAvatarText: { color: '#1E3A8A', fontSize: 10, fontWeight: '700' },
  metadataMuted: { color: '#64748B', fontSize: 12, fontWeight: '500' },
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
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    backgroundColor: '#EEF2FF',
    color: '#3730A3',
    fontSize: 11,
    fontWeight: '600',
  },
  priorityText: { fontSize: 12.5, fontWeight: '700' },
  descriptionSection: { gap: 8, paddingHorizontal: 2 },
  sectionLabel: { color: '#0F172A', fontSize: 13.5, fontWeight: '700', letterSpacing: -0.1 },
  descriptionText: { color: '#475569', fontSize: 13.5, lineHeight: 21, fontWeight: '400' },
  attachmentSection: {
    gap: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5EAF2',
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 2,
  },
  assignedSprintSection: {
    gap: 12,
    paddingTop: 6,
  },
  assignedSprintHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  assignedSprintTitle: { color: '#0F172A', fontSize: 15.5, fontWeight: '800', letterSpacing: -0.2 },
  assignedSprintCount: {
    minWidth: 26,
    height: 26,
    lineHeight: 22,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
    color: '#1E3A8A',
    backgroundColor: '#EEF4FF',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  assignedSprintItem: {
    gap: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5EAF2',
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 3,
  },
  assignedSprintExpandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 0,
    paddingVertical: 2,
  },
  assignedSprintStatus: {
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#EFF2F7',
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
  },
  assignedSprintStatusActive: {
    backgroundColor: '#DCFCE7',
    color: '#15803D',
  },
  assignedSprintViewDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    transform: [{ translateY: 0 }],
  },
  assignedSprintExpandText: { color: '#64748B', fontSize: 11.5, fontWeight: '600' },
  assignedSprintStartRow: { alignItems: 'flex-end', marginTop: 4 },
  assignedSprintNoSprintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5EAF2',
  },
  sprintDetails: { gap: 13, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  sprintDescription: { color: '#475569', fontSize: 13, lineHeight: 20 },
  sprintProgressHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sprintProgressPercent: { color: '#0F172A', fontSize: 12, fontWeight: '700' },
  sprintProgressTrack: { height: 7, overflow: 'hidden', borderRadius: 999, backgroundColor: '#E2E8F0' },
  sprintProgressFill: { height: '100%', borderRadius: 999, backgroundColor: '#1D4ED8' },
  sprintSubmissionForm: { gap: 12, paddingTop: 4 },
  taskSubmissionNote: {
    minHeight: 104,
    padding: 14,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    color: '#0F172A',
    fontSize: 13,
    lineHeight: 20,
    textAlignVertical: 'top',
  },
  sprintMediaHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sprintMediaLimit: { color: '#64748B', fontSize: 11.5, fontWeight: '500' },
  sprintMediaActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  sprintMediaAction: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E5EAF2',
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  sprintMediaActionWithIcon: { flexDirection: 'row', gap: 7 },
  sprintMediaIconButton: {
    width: 42,
    height: 42,
    paddingHorizontal: 0,
    borderRadius: 21,
    borderWidth: 0,
    backgroundColor: '#0F172A',
  },
  sprintRecordingWaveform: {
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2.5,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#EEF4FF',
  },
  sprintRecordingWaveformBar: { width: 2, borderRadius: 2, backgroundColor: '#1D4ED8' },
  sprintMediaActionText: { color: '#0F172A', fontSize: 12.5, fontWeight: '700' },
  sprintSubmissionAttachment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#EFF2F7',
    borderWidth: 1,
    borderColor: '#E5EAF2',
  },
  sprintSubmissionAttachmentName: { flex: 1, color: '#0F172A', fontSize: 12, fontWeight: '600' },
  sprintSubmissionRemove: { padding: 4 },
  sprintSubmissionRemoveText: { color: '#DC2626', fontSize: 11, fontWeight: '700' },
  sprintLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sprintLinkInput: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    color: '#0F172A',
    fontSize: 12.5,
  },
  sprintSubmissionError: { color: '#DC2626', fontSize: 12, lineHeight: 17, fontWeight: '600' },
  sprintSubmittedDetails: {
    gap: 8,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#DCFCE7',
  },
  sprintSubmittedMessage: { color: '#15803D', fontSize: 13, fontWeight: '700' },
  sprintSubmittedLink: { color: '#475569', fontSize: 12 },
  assignedSprintDescription: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
  },
  assignedSprintBullet: { color: '#0F172A', fontSize: 15, fontWeight: '800' },
  assignedSprintName: { flex: 1, color: '#0F172A', fontSize: 13.5, lineHeight: 19, fontWeight: '700' },
  assignedSprintStartButton: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: '#1D4ED8',
  },
  assignedSprintSubmitButton: {
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: '#0F172A',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 14,
    elevation: 4,
  },
  assignedSprintSubmitText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  assignedSprintStartText: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '700' },
  taskAttachmentCard: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E5EAF2',
    borderRadius: 14,
    backgroundColor: '#EFF2F7',
  },
  attachmentImagePreview: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 10,
    backgroundColor: '#EEF4FF',
  },
  attachmentImage: { width: '100%', height: '100%' },
  attachmentImageUnavailable: { color: '#DC2626', fontSize: 16, fontWeight: '700' },
  attachmentAudioTile: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D6E4FF',
    backgroundColor: '#EEF4FF',
  },
  attachmentVoiceNotePlay: {
    position: 'absolute',
    right: 3,
    bottom: 6,
  },
  attachmentFileIconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentFileIcon: {
    width: 44,
    height: 44,
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
  taskAttachmentCopy: { flex: 1, minWidth: 0, gap: 3 },
  taskAttachmentName: { color: '#0F172A', fontSize: 12.5, fontWeight: '700' },
  taskAttachmentDetails: { color: '#64748B', fontSize: 10.5, fontWeight: '500' },
  attachmentAudioProgressTrack: {
    height: 4,
    overflow: 'hidden',
    borderRadius: 2,
    backgroundColor: '#E2E8F0',
  },
  attachmentAudioProgress: { height: '100%', borderRadius: 2, backgroundColor: '#1D4ED8' },
  attachmentAudioTime: {
    alignSelf: 'flex-end',
    color: '#64748B',
    fontSize: 9.5,
    fontWeight: '600',
  },
  attachmentError: { color: '#DC2626', fontSize: 9.5, fontWeight: '600' },
  attachmentDownloadButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5EAF2',
  },
  attachmentActionDisabled: { opacity: 0.55 },
  primaryAction: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
    borderRadius: 999,
    backgroundColor: '#0F172A',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 3,
  },
  primaryActionDisabled: { opacity: 0.65 },
  primaryActionText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  taskCountdownPill: {
    flexShrink: 0,
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#EFF6FF',
  },
  taskCountdownPillOverdue: {
    backgroundColor: '#FEE2E2',
  },
  taskCountdownText: {
    color: '#1E3A8A',
    fontSize: 10.5,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  taskCountdownTextOverdue: {
    color: '#DC2626',
  },
  sprintCountWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  sprintCountDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0F172A',
  },
  productiveWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 20,
    paddingBottom: 12,
  },
  productiveTitle: {
    marginTop: 8,
    color: '#0F172A',
    fontSize: 14.5,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  productiveSubtitle: {
    marginTop: 3,
    color: '#64748B',
    fontSize: 12,
    textAlign: 'center',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  brandWordmark: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  brandDot: {
    color: '#0F172A',
  },
  detailTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  detailTitleIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D6E4FF',
    backgroundColor: '#EEF4FF',
  },
  detailTitleCopy: {
    flex: 1,
  },
  statusBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#EFF2F7',
  },
  statusBadgePillActive: {
    backgroundColor: '#DCFCE7',
  },
  statusBadgeText: {
    color: '#475569',
    fontSize: 11.5,
    fontWeight: '700',
  },
  statusBadgeTextActive: {
    color: '#15803D',
  },
  priorityBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#FEE2E2',
  },
  priorityBadgeMedium: {
    backgroundColor: '#FEF3C7',
  },
  priorityBadgeNormal: {
    backgroundColor: '#EFF2F7',
  },
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionHeadingIconBadge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF4FF',
  },
  attachmentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  attachmentHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sprintLinkInputWrap: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
  },
  sprintLinkInputField: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 8,
    color: '#0F172A',
    fontSize: 12.5,
  },
  modalQuickFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 12,
    paddingBottom: 6,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    backgroundColor: '#F4F6FA',
  },
  modalQuickPill: {
    flex: 1,
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5EAF2',
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  modalQuickPillText: {
    color: '#0F172A',
    fontSize: 12.5,
    fontWeight: '700',
  },
  modalQuickMic: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: '#E5EAF2',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  modalQuickGoldPill: {
    flex: 1,
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 999,
    backgroundColor: '#0F172A',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.34,
    shadowRadius: 12,
    elevation: 3,
  },
  modalQuickGoldText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800',
  },
});
