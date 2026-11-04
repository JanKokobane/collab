import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  ImageBackground,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ListRenderItem,
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, G, Path, SvgXml } from 'react-native-svg';
import { router } from 'expo-router';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import {
  fetchConversations,
  fetchMessagingProjects,
  fetchMessages,
  markConversationRead,
  MessagesApiError,
  normalizeMessage,
  sendMessage,
  createClientMessageId,
  createConversation,
  updateMessage,
  deleteMessage,
  clearConversationMessages,
  fetchCallHistory,
  hideConversation,
  type CallHistoryItem,
  type Conversation,
  type ConversationType,
  type MessagingProject,
  type Message,
  type MessageAttachment,
} from '@/lib/messagesApi';
import { MessagesRealtime } from '@/lib/messagesRealtime';
import { firebaseAuth } from '@/lib/firebase';

type MessageEvent = { message?: Record<string, unknown> };
type ConversationEvent = { conversation_id?: string };
type MessagesSection = 'messages' | 'channels' | 'groups' | 'calls';

const messageSections: { id: MessagesSection; label: string }[] = [
  { id: 'messages', label: 'Messages' },
  { id: 'channels', label: 'Channels' },
  { id: 'groups', label: 'Groups' },
  { id: 'calls', label: 'Calls' },
];
const maxMessageAttachmentBytes = 200 * 1024 * 1024;
const maxMessageAttachments = 10;
const voiceNoteIconSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><g fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="4"><rect width="14" height="27" x="17" y="4" rx="7"/><path stroke-linecap="round" d="M9 23c0 8.284 6.716 15 15 15s15-6.716 15-15M24 38v6"/></g></svg>';
const attachmentIconSvgs = {
  pdf: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><path fill="#ef5350" d="M13 9h5.5L13 3.5zM6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2m4.93 10.44c.41.9.93 1.64 1.53 2.15l.41.32c-.87.16-2.07.44-3.34.93l-.11.04l.5-1.04c.45-.87.78-1.66 1.01-2.4m6.48 3.81c.18-.18.27-.41.28-.66c.03-.2-.02-.39-.12-.55c-.29-.47-1.04-.69-2.28-.69l-1.29.07l-.87-.58c-.63-.52-1.2-1.43-1.6-2.56l.04-.14c.33-1.33.64-2.94-.02-3.6a.85.85 0 0 0-.61-.24h-.24c-.37 0-.7.39-.79.77c-.37 1.33-.15 2.06.22 3.27v.01c-.25.88-.57 1.9-1.08 2.93l-.96 1.8l-.89.49c-1.2.75-1.77 1.59-1.88 2.12c-.04.19-.02.36.05.54l.03.05l.48.31l.44.11c.81 0 1.73-.95 2.97-3.07l.18-.07c1.03-.33 2.31-.56 4.03-.75c1.03.51 2.24.74 3 .74c.44 0 .74-.11.91-.3m-.41-.71l.09.11c-.01.1-.04.11-.09.13h-.04l-.19.02c-.46 0-1.17-.19-1.9-.51c.09-.1.13-.1.23-.1c1.4 0 1.8.25 1.9.35M7.83 17c-.65 1.19-1.24 1.85-1.69 2c.05-.38.5-1.04 1.21-1.69zm3.02-6.91c-.23-.9-.24-1.63-.07-2.05l.07-.12l.15.05c.17.24.19.56.09 1.1l-.03.16l-.16.82z"/></svg>',
  word: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><path fill="#01579b" d="M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2m7 1.5V9h5.5zM7 13l1.5 7h2l1.5-3l1.5 3h2l1.5-7h1v-2h-4v2h1l-.9 4.2L13 15h-2l-1.1 2.2L9 13h1v-2H6v2z"/></svg>',
  powerpoint: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><path fill="#e64a19" d="M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2m7 1.5V9h5.5zM8 11v2h1v6H8v1h4v-1h-1v-2h2a3 3 0 0 0 3-3a3 3 0 0 0-3-3zm5 2a1 1 0 0 1 1 1a1 1 0 0 1-1 1h-2v-2z"/></svg>',
  image: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 16 16"><path fill="#26a69a" d="M8.5 6h4l-4-4zM3.875 1H9.5l4 4v8.6c0 .773-.616 1.4-1.375 1.4h-8.25c-.76 0-1.375-.627-1.375-1.4V2.4c0-.777.612-1.4 1.375-1.4M4 13.6h8V8l-2.625 2.8L8 9.4zm1.25-7.7c-.76 0-1.375.627-1.375 1.4s.616 1.4 1.375 1.4c.76 0 1.375-.627 1.375-1.4S6.009 5.9 5.25 5.9"/></svg>',
  audio: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path fill="#ef5350" d="M16 2a14 14 0 1 0 14 14A14 14 0 0 0 16 2m6 10h-4v8a4 4 0 1 1-4-4a3.96 3.96 0 0 1 2 .555V8h6Z"/></svg>',
  video: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path fill="#ff9800" d="m24 6l2 6h-4l-2-6h-3l2 6h-4l-2-6h-3l2 6H8L6 6H5a3 3 0 0 0-3 3v14a3 3 0 0 0 3 3h22a3 3 0 0 0 3-3V6Z"/></svg>',
  archive: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><path fill="#afb42b" d="M14 17h-2v-2h-2v-2h2v2h2m0-6h-2v2h2v2h-2v-2h-2V9h2V7h-2V5h2v2h2m5-4H5c-1.11 0-2 .89-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2"/></svg>',
  document: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><g fill="none"><path d="M0 0h24v24H0z"/><path fill="#42a5f5" d="M8 16h8v2H8zm0-4h8v2H8zm6-10H6c-1.1 0-2 .9-2 2v16c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8zm4 18H6V4h7v5h5z"/></g></svg>',
};

function getAttachmentIconXml(attachment: MessageAttachment): string {
  const mediaType = attachment.mediaType.toLowerCase();
  const extension = attachment.fileName.toLowerCase().split('.').pop() || '';
  if (mediaType === 'application/pdf' || extension === 'pdf') return attachmentIconSvgs.pdf;
  if (mediaType.startsWith('image/') || ['avif', 'bmp', 'gif', 'heic', 'jpeg', 'jpg', 'png', 'svg', 'webp'].includes(extension)) {
    return attachmentIconSvgs.image;
  }
  if (mediaType.startsWith('audio/') || attachment.is_voice_note ||
      ['aac', 'flac', 'm4a', 'mp3', 'ogg', 'wav'].includes(extension)) {
    return attachmentIconSvgs.audio;
  }
  if (mediaType.startsWith('video/') || ['avi', 'mkv', 'mov', 'mp4', 'webm'].includes(extension)) {
    return attachmentIconSvgs.video;
  }
  if (['zip', 'rar', '7z', 'gz', 'tar'].includes(extension)) return attachmentIconSvgs.archive;
  if (['doc', 'docx', 'odt', 'rtf'].includes(extension) ||
      mediaType.includes('msword') || mediaType.includes('wordprocessingml')) {
    return attachmentIconSvgs.word;
  }
  if (['ppt', 'pptx', 'odp'].includes(extension) || mediaType.includes('presentation')) {
    return attachmentIconSvgs.powerpoint;
  }
  return attachmentIconSvgs.document;
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
}

function formatVoiceDuration(durationSeconds: number): string {
  const minutes = Math.floor(durationSeconds / 60).toString().padStart(2, '0');
  const seconds = (durationSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function getAttachmentDuration(attachment: MessageAttachment): number {
  if (Number.isFinite(attachment.duration_seconds) && attachment.duration_seconds! > 0) {
    return attachment.duration_seconds!;
  }
  const savedDuration = attachment.fileName.match(/^voice-note-(\d+)s-/i)?.[1];
  return Number(savedDuration) || 0;
}

function getAttachmentWaveform(attachment: MessageAttachment): number[] {
  if (attachment.waveform_peaks?.length === 40 &&
      attachment.waveform_peaks.every((peak) => Number.isFinite(peak))) {
    return attachment.waveform_peaks.map((peak) => Math.max(0, Math.min(1, peak)));
  }

  let seed = [...attachment.fileName].reduce((sum, character) => sum + character.charCodeAt(0), 17);
  return Array.from({ length: 40 }, () => {
    seed = (seed * 9301 + 49297) % 233280;
    return 0.18 + (seed / 233280) * 0.82;
  });
}

function buildVoiceWaveformPeaks(samples: number[], peakCount = 40): number[] {
  if (!samples.length) return Array(peakCount).fill(0.08);
  return Array.from({ length: peakCount }, (_, index) => {
    const start = Math.floor(index * samples.length / peakCount);
    const end = Math.max(start + 1, Math.floor((index + 1) * samples.length / peakCount));
    return Math.max(0.08, ...samples.slice(start, end));
  });
}

function getSafeAttachmentName(fileName: string): string {
  const safeName = fileName.replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_').trim();
  return safeName && safeName !== '.' && safeName !== '..' ? safeName : 'attachment';
}

function getAttachmentBase64Data(attachment: MessageAttachment): string {
  const match = attachment.data.match(/^data:[^,]*;base64,([A-Za-z0-9+/]*={0,2})$/);
  if (!match) throw new Error('This attachment has an invalid file payload.');
  return match[1];
}

async function writeAttachmentToDirectory(
  directory: Directory,
  attachment: MessageAttachment,
): Promise<File> {
  const originalName = getSafeAttachmentName(attachment.fileName);
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
  await file.write(getAttachmentBase64Data(attachment), { encoding: 'base64' });
  return file;
}

let activeVoiceNotePlayer: ReturnType<typeof useAudioPlayer> | null = null;

function VoiceNotePlayer({ attachment }: { attachment: MessageAttachment }) {
  const player = useAudioPlayer(null, { updateInterval: 100 });
  const status = useAudioPlayerStatus(player);
  const [waveformWidth, setWaveformWidth] = useState(0);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [playbackError, setPlaybackError] = useState('');
  const sourceLoaded = useRef(false);
  const playbackFile = useRef<File | null>(null);
  const waveform = getAttachmentWaveform(attachment);
  const duration = status.duration > 0 ? status.duration : getAttachmentDuration(attachment);
  const progress = duration > 0 ? Math.min(1, status.currentTime / duration) : 0;
  const playbackSpeeds = [1, 1.5, 2];

  useEffect(() => () => {
    if (activeVoiceNotePlayer === player) activeVoiceNotePlayer = null;
    player.pause();
    try {
      if (playbackFile.current?.exists) playbackFile.current.delete();
    } catch (cause) {
      console.error('Unable to remove the temporary voice-note file:', cause);
    }
  }, [player]);

  const togglePlayback = async () => {
    if (status.playing) {
      player.pause();
      return;
    }

    try {
      setPlaybackError('');
      if (activeVoiceNotePlayer && activeVoiceNotePlayer !== player) {
        activeVoiceNotePlayer.pause();
        void activeVoiceNotePlayer.seekTo(0).catch((cause) => {
          console.error('Unable to reset the previous voice note:', cause);
        });
      }
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      if (!sourceLoaded.current) {
        const file = new File(
          Paths.cache,
          `${Date.now()}-${Math.random().toString(36).slice(2)}-${getSafeAttachmentName(attachment.fileName)}`,
        );
        try {
          await file.write(getAttachmentBase64Data(attachment), { encoding: 'base64' });
        } catch (cause) {
          if (file.exists) file.delete();
          throw cause;
        }
        playbackFile.current = file;
        player.replace(file.uri);
        sourceLoaded.current = true;
      }
      if (status.didJustFinish || (duration > 0 && status.currentTime >= duration - 0.1)) {
        await player.seekTo(0);
      }
      activeVoiceNotePlayer = player;
      player.play();
    } catch (cause) {
      console.error('Unable to play message voice note:', cause);
      setPlaybackError('This audio could not be played.');
    }
  };

  const seekWaveform = (locationX: number) => {
    if (!status.isLoaded || !duration || !waveformWidth) return;
    const seekTo = Math.max(0, Math.min(1, locationX / waveformWidth)) * duration;
    void player.seekTo(seekTo).catch((cause) => {
      console.error('Unable to seek message voice note:', cause);
      setPlaybackError('The audio position could not be changed.');
    });
  };

  const changeSpeed = () => {
    const nextIndex = (speedIndex + 1) % playbackSpeeds.length;
    setSpeedIndex(nextIndex);
    player.setPlaybackRate(playbackSpeeds[nextIndex]);
  };

  return (
    <View style={styles.voicePlayerContainer}>
      <View style={styles.voicePlayer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={status.playing ? 'Pause voice note' : 'Play voice note'}
          onPress={() => { void togglePlayback(); }}
          style={({ pressed }) => [styles.voicePlayerButton, pressed && styles.pressed]}>
          <Svg width={20} height={20} viewBox="0 0 24 24">
            <Path
              d={status.playing ? 'M7 5h4v14H7zM14 5h4v14h-4z' : 'm8 5 11 7-11 7z'}
              fill="#242424"
            />
          </Svg>
        </Pressable>
        <View style={styles.voicePlayerTimeline}>
          <Pressable
            accessibilityRole="adjustable"
            accessibilityLabel="Voice note playback position"
            accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
            disabled={!status.isLoaded}
            onLayout={(event) => setWaveformWidth(event.nativeEvent.layout.width)}
            onPress={(event) => seekWaveform(event.nativeEvent.locationX)}
            style={({ pressed }) => [styles.voicePlayerWaveform, pressed && styles.voicePlayerWaveformPressed]}>
            {waveform.map((peak, index) => (
              <View
                key={index}
                style={[
                  styles.voicePlayerWaveformBar,
                  { height: `${16 + Math.round(peak * 84)}%` },
                  index < Math.round(progress * waveform.length) && styles.voicePlayerWaveformBarPlayed,
                ]}
              />
            ))}
          </Pressable>
          <Text style={styles.voicePlayerTime}>
            {formatVoiceDuration(Math.floor(status.currentTime))} / {formatVoiceDuration(Math.ceil(duration))}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Playback speed ${playbackSpeeds[speedIndex]}x`}
          onPress={changeSpeed}
          style={({ pressed }) => [styles.voicePlayerSpeed, pressed && styles.pressed]}>
          <Text style={styles.voicePlayerSpeedText}>{playbackSpeeds[speedIndex]}x</Text>
        </Pressable>
      </View>
      {!!(playbackError || status.error) && (
        <Text style={styles.voicePlayerError}>{playbackError || status.error}</Text>
      )}
    </View>
  );
}

function getConversationTitle(conversation: Conversation, currentUid: string): string {
  if (conversation.type === 'channel') return `# ${conversation.name || 'Channel'}`;
  const others = conversation.participants.filter((member) => member.firebaseUid !== currentUid);
  if (conversation.type === 'group') {
    return conversation.name || others.map((member) => member.name || member.email).join(', ') || 'Group conversation';
  }
  return others[0]?.name || others[0]?.email || 'Direct message';
}

function getLatestPreview(message: Message): string {
  return message.body || (message.attachments.length ? 'Attachment' : 'New message');
}

function mergeMessage(current: Message[], incoming: Message): Message[] {
  const existingIndex = current.findIndex((message) =>
    message.id === incoming.id ||
    (incoming.clientMessageId && message.clientMessageId === incoming.clientMessageId),
  );
  const next = [...current];
  if (existingIndex < 0) next.push(incoming);
  else next[existingIndex] = { ...next[existingIndex], ...incoming };
  return next.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';
}

function ParticipantAvatar({
  uri,
  name,
  size,
}: {
  uri?: string | null;
  name: string;
  size: number;
}) {
  if (uri?.trim()) {
    return (
      <Image
        accessibilityLabel={`${name} profile picture`}
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    );
  }
  return (
    <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={styles.conversationAvatarText}>{initials(name)}</Text>
    </View>
  );
}

export default function MessagesScreen() {
  const insets = useSafeAreaInsets();
  const audioRecorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });
  const recorderState = useAudioRecorderState(audioRecorder);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [projects, setProjects] = useState<MessagingProject[]>([]);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [createType, setCreateType] = useState<ConversationType>('direct');
  const [createProjectId, setCreateProjectId] = useState('');
  const [createName, setCreateName] = useState('');
  const [selectedMemberUids, setSelectedMemberUids] = useState<string[]>([]);
  const [creatingConversation, setCreatingConversation] = useState(false);
  const [actionMessage, setActionMessage] = useState<Message | null>(null);
  const [savingAttachmentKey, setSavingAttachmentKey] = useState<string | null>(null);
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [forwardTarget, setForwardTarget] = useState<Message | null>(null);
  const [activeSection, setActiveSection] = useState<MessagesSection>('messages');
  const [callHistory, setCallHistory] = useState<CallHistoryItem[]>([]);
  const [loadingCallHistory, setLoadingCallHistory] = useState(false);
  const [selectedAttachments, setSelectedAttachments] = useState<MessageAttachment[]>([]);
  const [pickingAttachment, setPickingAttachment] = useState(false);
  const [voiceNoteBusy, setVoiceNoteBusy] = useState(false);
  const [voiceRecordingSession, setVoiceRecordingSession] = useState(false);
  const [voiceRecordingPaused, setVoiceRecordingPaused] = useState(false);
  const [voiceWaveformLevels, setVoiceWaveformLevels] = useState<number[]>(() => Array(40).fill(0.08));
  const currentUserId = user?.uid || '';

  const realtimeRef = useRef<MessagesRealtime | null>(null);
  const joinedConversationIds = useRef(new Set<string>());
  const conversationsRef = useRef<Conversation[]>([]);
  const selectedConversationIdRef = useRef<string | null>(null);
  const cursorRef = useRef<string | null>(null);
  const loadingOlderRef = useRef(false);
  const activeLoadId = useRef(0);
  const voiceRecordingSamples = useRef<number[]>([]);
  const messageInputRef = useRef<TextInput>(null);

  conversationsRef.current = conversations;
  selectedConversationIdRef.current = selectedConversationId;

  useEffect(() => {
    const metering = recorderState.metering;
    if (!voiceRecordingSession || voiceRecordingPaused || !recorderState.isRecording ||
        typeof metering !== 'number' || !Number.isFinite(metering)) return;
    const level = Math.max(0.08, Math.min(1, (metering + 60) / 60));
    voiceRecordingSamples.current.push(level);
    setVoiceWaveformLevels((current) => [...current.slice(1), level]);
  }, [
    recorderState.isRecording,
    recorderState.metering,
    voiceRecordingPaused,
    voiceRecordingSession,
  ]);

  const handleApiError = useCallback(async (cause: unknown, fallback: string) => {
    const message = cause instanceof Error ? cause.message : fallback;
    setError(message || fallback);
    if (cause instanceof MessagesApiError && cause.status === 401) {
      try {
        await signOut(firebaseAuth);
      } catch (signOutError) {
        console.error('Unable to sign out after an unauthorized messaging response:', signOutError);
      }
      router.replace('/');
    }
  }, []);

  useEffect(() => onAuthStateChanged(firebaseAuth, (currentUser) => {
    setUser(currentUser);
    setAuthReady(true);
    if (!currentUser) router.replace('/');
  }), []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void fetchMessagingProjects()
      .then((result) => {
        if (active) setProjects(result);
      })
      .catch((cause) => {
        if (active) void handleApiError(cause, 'Project members could not be loaded.');
      });
    return () => { active = false; };
  }, [user, handleApiError]);

  const refreshConversations = useCallback(async () => {
    try {
      setError('');
      const result = await fetchConversations();
      setConversations(result);
      return result;
    } catch (cause) {
      await handleApiError(cause, 'Conversations could not be loaded.');
      return null;
    } finally {
      setLoadingConversations(false);
      setRefreshing(false);
    }
  }, [handleApiError]);

  const loadCallHistory = useCallback(async () => {
    setLoadingCallHistory(true);
    try {
      setCallHistory(await fetchCallHistory());
    } catch (cause) {
      await handleApiError(cause, 'Call history could not be loaded.');
    } finally {
      setLoadingCallHistory(false);
    }
  }, [handleApiError]);

  useEffect(() => {
    if (activeSection !== 'calls' || selectedConversationId || loadingConversations) return;
    void loadCallHistory();
  }, [activeSection, selectedConversationId, loadingConversations, loadCallHistory]);

  const loadThread = useCallback(async (conversationId: string) => {
    const loadId = ++activeLoadId.current;
    selectedConversationIdRef.current = conversationId;
    setSelectedConversationId(conversationId);
    setMessages([]);
    cursorRef.current = null;
    setHasMore(false);
    setError('');
    setLoadingMessages(true);
    try {
      const page = await fetchMessages(conversationId);
      if (loadId !== activeLoadId.current || selectedConversationIdRef.current !== conversationId) return;
      setMessages(page.messages);
      cursorRef.current = page.nextCursor;
      setHasMore(page.hasMore);
      try {
        await markConversationRead(conversationId);
        setConversations((current) => current.map((conversation) =>
          conversation.id === conversationId ? { ...conversation, unreadCount: 0 } : conversation,
        ));
      } catch (cause) {
        await handleApiError(cause, 'Messages loaded, but could not be marked as read.');
      }
    } catch (cause) {
      if (loadId === activeLoadId.current) await handleApiError(cause, 'Messages could not be loaded.');
    } finally {
      if (loadId === activeLoadId.current) setLoadingMessages(false);
    }
  }, [handleApiError]);

  const startConversationCreation = (type: ConversationType = 'direct', forward?: Message | null) => {
    setCreateType(type);
    setCreateProjectId(projects[0]?.id || '');
    setCreateName('');
    setSelectedMemberUids([]);
    setForwardTarget(forward || null);
    setCreateModalVisible(true);
  };

  const handleCreateConversation = async () => {
    const requiredMembers = createType === 'direct' ? 1 : createType === 'group' ? 2 : 1;
    if (selectedMemberUids.length < requiredMembers) {
      setError(createType === 'direct'
        ? 'Select one accepted project member.'
        : createType === 'group'
          ? 'Select at least two accepted project members.'
          : 'Select at least one accepted project member.');
      return;
    }
    if (createType !== 'direct' && !createName.trim()) {
      setError(createType === 'channel' ? 'Enter a channel name.' : 'Enter a group name.');
      return;
    }
    const project = projects.find((item) => item.id === createProjectId);
    if (!project) {
      setError('Select a project you belong to.');
      return;
    }
    if (forwardTarget && forwardTarget.attachments.length) {
      setError('Forwarding attachments is not available in the mobile app yet.');
      return;
    }
    if (forwardTarget && !forwardTarget.body.trim()) {
      setError('Forwarding attachment-only messages is not available in the mobile app yet.');
      return;
    }
    setCreatingConversation(true);
    setError('');
    try {
      const conversationId = await createConversation({
        projectId: project.id,
        type: createType,
        name: createName.trim(),
        memberFirebaseUids: selectedMemberUids,
      });
      if (forwardTarget) {
        await sendMessage({
          conversationId,
          body: forwardTarget.body,
          clientMessageId: createClientMessageId(),
          forwardedFrom: { senderName: forwardTarget.senderName },
        });
      }
      setCreateModalVisible(false);
      setForwardTarget(null);
      await refreshConversations();
      await loadThread(conversationId);
    } catch (cause) {
      await handleApiError(cause, 'The conversation could not be created.');
    } finally {
      setCreatingConversation(false);
    }
  };

  useEffect(() => {
    if (!user) return undefined;
    let active = true;
    const socket = new MessagesRealtime(user);
    realtimeRef.current = socket;
    joinedConversationIds.current.clear();

    const joinAvailableConversations = () => {
      if (!socket.isConnected) return;
      conversationsRef.current.forEach((conversation) => {
        if (joinedConversationIds.current.has(conversation.id)) return;
        joinedConversationIds.current.add(conversation.id);
        socket.emitWithAck('conversation:join', conversation.id).catch((cause) => {
          joinedConversationIds.current.delete(conversation.id);
          if (socket.isConnected) {
            console.warn('Unable to join messaging conversation:', conversation.id, cause);
          }
          if (selectedConversationIdRef.current === conversation.id) {
            setError(cause instanceof Error ? cause.message : 'Conversation access was denied.');
          }
        });
      });
    };

    const refreshAndJoin = async () => {
      const result = await refreshConversations();
      if (active && result) joinAvailableConversations();
    };

    const removers = [
      socket.on('connect', () => {
        if (!active) return;
        setRealtimeConnected(true);
        joinedConversationIds.current.clear();
        joinAvailableConversations();
      }),
      socket.on('disconnect', () => setRealtimeConnected(false)),
      socket.on('transport-error', () => setRealtimeConnected(false)),
      socket.on('conversation:created', () => { void refreshAndJoin(); }),
      socket.on('conversations:refresh', () => { void refreshAndJoin(); }),
      socket.on('conversation:removed', (event?: ConversationEvent) => {
        const id = event?.conversation_id;
        if (!id) return;
        joinedConversationIds.current.delete(id);
        setConversations((current) => current.filter((conversation) => conversation.id !== id));
        if (selectedConversationIdRef.current === id) {
          activeLoadId.current += 1;
          selectedConversationIdRef.current = null;
          setSelectedConversationId(null);
          setMessages([]);
          setReplyTarget(null);
          setEditingMessageId(null);
          setDraft('');
        }
      }),
      socket.on('conversation:cleared', (event?: ConversationEvent) => {
        const id = event?.conversation_id;
        if (id && id === selectedConversationIdRef.current) void loadThread(id);
      }),
      socket.on('message:created', (event?: MessageEvent) => {
        if (!event?.message) return;
        const message = normalizeMessage(event.message);
        setConversations((current) => current.map((conversation) => {
          if (conversation.id !== message.conversationId) return conversation;
          const isOpen = selectedConversationIdRef.current === conversation.id;
          if (isOpen && message.senderUid !== user.uid) {
            void markConversationRead(conversation.id).catch((cause) =>
              handleApiError(cause, 'The incoming message could not be marked as read.'),
            );
          }
          return {
            ...conversation,
            latestMessage: getLatestPreview(message),
            latestMessageCreatedAt: message.createdAt,
            unreadCount: isOpen || message.senderUid === user.uid
              ? 0
              : conversation.unreadCount + 1,
          };
        }));
        if (selectedConversationIdRef.current === message.conversationId) {
          setMessages((current) => mergeMessage(current, message));
        }
      }),
      socket.on('message:updated', (event?: MessageEvent) => {
        if (!event?.message) return;
        const message = normalizeMessage(event.message);
        if (selectedConversationIdRef.current === message.conversationId) {
          setMessages((current) => mergeMessage(current, message));
        }
      }),
      socket.on('message:deleted', (event?: {
        conversation_id?: string;
        message_id?: string;
        scope?: string;
        hidden_for_uid?: string | null;
      }) => {
        if (!event?.conversation_id || !event.message_id) return;
        if (event.conversation_id !== selectedConversationIdRef.current) return;
        if (event.scope === 'me' && event.hidden_for_uid === user.uid) {
          setMessages((current) => current.filter((message) => message.id !== event.message_id));
        } else if (event.scope === 'everyone') {
          setMessages((current) => current.map((message) => message.id === event.message_id
            ? { ...message, body: 'This message was deleted', attachments: [], deleted: true }
            : message,
          ));
        }
      }),
      socket.on('message:read', (event?: {
        conversation_id?: string;
        firebase_uid?: string;
        read_at?: string;
      }) => {
        if (event?.conversation_id !== selectedConversationIdRef.current ||
            event.firebase_uid === user.uid || !event.read_at) return;
        setMessages((current) => current.map((message) =>
          message.senderUid === user.uid && !message.readAt
            ? { ...message, readAt: event.read_at || null }
            : message,
        ));
      }),
      socket.on('presence:updated', (event?: {
        firebase_uid?: string;
        is_online?: boolean;
        last_seen_at?: string;
      }) => {
        if (!event?.firebase_uid) return;
        setConversations((current) => current.map((conversation) => ({
          ...conversation,
          participants: conversation.participants.map((participant) =>
            participant.firebaseUid === event.firebase_uid
              ? {
                  ...participant,
                  isOnline: Boolean(event.is_online),
                  lastSeenAt: event.last_seen_at || null,
                }
              : participant,
          ),
        })));
      }),
    ];

    void refreshAndJoin();
    socket.start();
    return () => {
      active = false;
      removers.forEach((remove) => remove());
      socket.stop();
      joinedConversationIds.current.clear();
      if (realtimeRef.current === socket) realtimeRef.current = null;
      setRealtimeConnected(false);
    };
  }, [user, handleApiError, loadThread, refreshConversations]);

  useEffect(() => {
    if (!realtimeConnected || !realtimeRef.current?.isConnected) return;
    conversations.forEach((conversation) => {
      if (joinedConversationIds.current.has(conversation.id)) return;
      joinedConversationIds.current.add(conversation.id);
      realtimeRef.current?.emitWithAck('conversation:join', conversation.id).catch((cause) => {
        joinedConversationIds.current.delete(conversation.id);
        if (realtimeRef.current?.isConnected) {
          console.warn('Unable to join messaging conversation:', conversation.id, cause);
        }
      });
    });
  }, [conversations, realtimeConnected]);

  const loadOlderMessages = useCallback(async () => {
    const conversationId = selectedConversationIdRef.current;
    if (!conversationId || !cursorRef.current || !hasMore || loadingOlderRef.current) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    try {
      const page = await fetchMessages(conversationId, cursorRef.current);
      if (selectedConversationIdRef.current !== conversationId) return;
      setMessages((current) => {
        const ids = new Set(current.map((message) => message.id));
        const olderMessages = page.messages.filter((message) => !ids.has(message.id));
        return [...olderMessages, ...current].sort(
          (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
        );
      });
      cursorRef.current = page.nextCursor;
      setHasMore(page.hasMore);
    } catch (cause) {
      await handleApiError(cause, 'Older messages could not be loaded.');
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, [hasMore, handleApiError]);

  const openConversation = (conversationId: string) => {
    setSelectedAttachments([]);
    void loadThread(conversationId);
  };

  const handlePickAttachment = async () => {
    if (Platform.OS === 'web' || pickingAttachment || sending || editingMessageId ||
        voiceNoteBusy || recorderState.isRecording) return;
    setPickingAttachment(true);
    setError('');
    try {
      const selection = await File.pickFileAsync({ mimeTypes: ['*/*'] });
      if (selection.canceled || !selection.result) return;
      const file = selection.result;
      const size = file.size;
      const queuedBytes = selectedAttachments.reduce((total, attachment) => total + attachment.size, 0);
      if (!Number.isSafeInteger(size) || size <= 0) {
        setError('This file is empty or could not be read.');
        return;
      }
      if (selectedAttachments.length >= maxMessageAttachments) {
        setError(`You can attach up to ${maxMessageAttachments} files to a message.`);
        return;
      }
      if (queuedBytes + size > maxMessageAttachmentBytes) {
        setError('Attachments must total 200 MB or less per message.');
        return;
      }
      const mediaType = file.type && file.type.length <= 128
        ? file.type
        : 'application/octet-stream';
      const data = await file.base64();
      if (!data) {
        setError('The selected file could not be read.');
        return;
      }
      setSelectedAttachments((current) => [...current, {
        fileName: file.name.slice(0, 255) || 'Attachment',
        mediaType,
        size,
        data: `data:${mediaType};base64,${data}`,
      }]);
    } catch (cause) {
      console.error('Unable to select message attachment:', cause);
      setError(cause instanceof Error
        ? `The file could not be attached: ${cause.message}`
        : 'The file could not be attached.');
    } finally {
      setPickingAttachment(false);
    }
  };

  const handleVoiceNotePress = async () => {
    if (voiceNoteBusy || sending || pickingAttachment || editingMessageId ||
        voiceRecordingSession) return;
    if (selectedAttachments.length >= maxMessageAttachments) {
      setError(`You can attach up to ${maxMessageAttachments} files to a message.`);
      return;
    }
    messageInputRef.current?.blur();
    Keyboard.dismiss();
    setVoiceNoteBusy(true);
    setError('');
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setError('Allow microphone access to record a voice note.');
        return;
      }
      messageInputRef.current?.blur();
      Keyboard.dismiss();
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await audioRecorder.prepareToRecordAsync();
      voiceRecordingSamples.current = [];
      setVoiceWaveformLevels(Array(40).fill(0.08));
      setVoiceRecordingPaused(false);
      Keyboard.dismiss();
      setVoiceRecordingSession(true);
      audioRecorder.record({ forDuration: 3600 });
    } catch (cause) {
      console.error('Unable to record voice note:', cause);
      setVoiceRecordingSession(false);
      setError(cause instanceof Error
        ? `The voice note could not be recorded: ${cause.message}`
        : 'The voice note could not be recorded.');
      if (!recorderState.isRecording) {
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch((modeError) => {
          console.error('Unable to reset audio mode after recording error:', modeError);
        });
      }
    } finally {
      setVoiceNoteBusy(false);
    }
  };

  const toggleVoiceRecordingPause = () => {
    if (!voiceRecordingSession || voiceNoteBusy) return;
    try {
      if (voiceRecordingPaused) {
        audioRecorder.record({ forDuration: 3600 });
        setVoiceRecordingPaused(false);
      } else {
        audioRecorder.pause();
        setVoiceRecordingPaused(true);
      }
    } catch (cause) {
      console.error('Unable to change voice recording state:', cause);
      setError(cause instanceof Error ? cause.message : 'The recording could not be paused or resumed.');
    }
  };

  const finishVoiceRecording = async (discard: boolean) => {
    if (!voiceRecordingSession || voiceNoteBusy) return;
    setVoiceNoteBusy(true);
    setError('');
    try {
      const durationSeconds = Math.max(1, Math.ceil(recorderState.durationMillis / 1000));
      if (recorderState.isRecording || voiceRecordingPaused) await audioRecorder.stop();
      setVoiceRecordingSession(false);
      setVoiceRecordingPaused(false);
      try {
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      } catch (modeError) {
        console.error('Unable to reset audio mode after recording:', modeError);
        setError('The recording finished, but audio settings could not be restored.');
      }

      const uri = audioRecorder.uri;
      if (!uri) throw new Error('The voice note could not be saved.');
      const file = new File(uri);
      if (discard) {
        file.delete();
        voiceRecordingSamples.current = [];
        setVoiceWaveformLevels(Array(40).fill(0.08));
        return;
      }

      const size = file.size;
      const queuedBytes = selectedAttachments.reduce((total, attachment) => total + attachment.size, 0);
      if (!Number.isSafeInteger(size) || size <= 0) {
        file.delete();
        throw new Error('The voice note was empty or could not be read.');
      }
      if (selectedAttachments.length >= maxMessageAttachments) {
        file.delete();
        throw new Error(`You can attach up to ${maxMessageAttachments} files to a message.`);
      }
      if (queuedBytes + size > maxMessageAttachmentBytes) {
        file.delete();
        throw new Error('Attachments must total 200 MB or less per message.');
      }

      const data = await file.base64();
      if (!data) {
        file.delete();
        throw new Error('The voice note could not be read.');
      }
      const mediaType = 'audio/mp4';
      const voiceNote: MessageAttachment = {
        fileName: `voice-note-${durationSeconds}s-${Date.now()}.m4a`,
        mediaType,
        size,
        data: `data:${mediaType};base64,${data}`,
        is_voice_note: true,
        duration_seconds: durationSeconds,
        waveform_peaks: buildVoiceWaveformPeaks(voiceRecordingSamples.current),
      };
      voiceRecordingSamples.current = [];
      setVoiceWaveformLevels(Array(40).fill(0.08));
      setVoiceNoteBusy(false);
      await handleSend([...selectedAttachments, voiceNote]);
    } catch (cause) {
      console.error(discard ? 'Unable to discard voice note:' : 'Unable to finish voice note:', cause);
      setVoiceRecordingSession(false);
      setVoiceRecordingPaused(false);
      setError(cause instanceof Error ? cause.message : 'The voice note could not be finished.');
    } finally {
      setVoiceNoteBusy(false);
    }
  };

  const handleSend = async (attachmentsOverride?: MessageAttachment[]) => {
    const body = draft.trim();
    const attachments = attachmentsOverride ?? selectedAttachments;
    const conversationId = selectedConversationIdRef.current;
    if ((!body && attachments.length === 0) || !conversationId || sending || pickingAttachment ||
        (voiceNoteBusy && !attachmentsOverride) || (recorderState.isRecording && !attachmentsOverride)) return;
    if (body.length > 5000) {
      setError('Messages can contain at most 5,000 characters.');
      return;
    }
    if (editingMessageId) {
      setSending(true);
      setError('');
      try {
        await updateMessage(conversationId, editingMessageId, 'edit', { body });
        setDraft('');
        setEditingMessageId(null);
        await loadThread(conversationId);
      } catch (cause) {
        await handleApiError(cause, 'The message could not be edited.');
      } finally {
        setSending(false);
      }
      return;
    }
    const clientMessageId = createClientMessageId();
    const reply = replyTarget;
    const optimistic: Message = {
      id: `temp:${clientMessageId}`,
      conversationId,
      clientMessageId,
      senderUid: user?.uid || '',
      senderEmail: user?.email?.toLowerCase() || '',
      senderName: user?.displayName || user?.email?.split('@')[0] || 'You',
      body,
      createdAt: new Date().toISOString(),
      editedAt: null,
      readAt: null,
      deleted: false,
      attachments,
      reactions: [],
      replyToId: reply?.id || null,
      replyToBody: reply?.body || null,
      replyToSenderName: reply?.senderName || null,
      forwardedFrom: null,
      pinned: false,
      isDecision: false,
    };
    setSending(true);
    setDraft('');
    setError('');
    setMessages((current) => mergeMessage(current, optimistic));
    const latestMessage = body || attachments[0].fileName;
    setConversations((current) => current.map((conversation) =>
      conversation.id === conversationId
        ? { ...conversation, latestMessage, latestMessageCreatedAt: optimistic.createdAt }
        : conversation,
    ));
    try {
      const saved = await sendMessage({
        conversationId,
        body,
        clientMessageId,
        attachments,
        replyToId: reply?.id,
      });
      setMessages((current) => mergeMessage(current, saved));
      setSelectedAttachments([]);
      setReplyTarget(null);
    } catch (cause) {
      setMessages((current) => current.filter((message) => message.clientMessageId !== clientMessageId));
      setDraft(body);
      setSelectedAttachments(attachments);
      setConversations((current) => current.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, latestMessage: 'Message failed to send' }
          : conversation,
      ));
      await handleApiError(cause, 'The message could not be sent.');
    } finally {
      setSending(false);
    }
  };

  const runMessageAction = async (
    message: Message,
    action: 'pin' | 'decision' | 'reaction',
    body: Record<string, unknown> = {},
  ) => {
    try {
      await updateMessage(message.conversationId, message.id, action, body);
      setActionMessage(null);
      await loadThread(message.conversationId);
    } catch (cause) {
      await handleApiError(cause, 'The message action could not be completed.');
    }
  };

  const handleAttachmentFileAction = async (
    attachment: MessageAttachment,
    action: 'download' | 'saveAs',
    key: string,
  ) => {
    if (savingAttachmentKey) return;
    setSavingAttachmentKey(key);
    setActionMessage(null);
    try {
      let file: File;
      if (action === 'download') {
        const downloadsDirectory = new Directory(Paths.document, 'Downloads');
        if (!downloadsDirectory.exists) downloadsDirectory.create({ intermediates: true });
        file = await writeAttachmentToDirectory(downloadsDirectory, attachment);
        Alert.alert('Download complete', `${attachment.fileName} was saved to the app's Downloads.`);
      } else if (Platform.OS === 'android') {
        const directory = await Directory.pickDirectoryAsync();
        file = await writeAttachmentToDirectory(directory, attachment);
        Alert.alert('File saved', `${attachment.fileName} was saved to the selected folder.`);
      } else if (Platform.OS === 'ios') {
        const previewDirectory = new Directory(Paths.cache, 'message-attachments');
        if (!previewDirectory.exists) previewDirectory.create({ intermediates: true });
        file = await writeAttachmentToDirectory(previewDirectory, attachment);
        await file.preview({ title: attachment.fileName, mimeType: attachment.mediaType });
      } else {
        throw new Error('Saving attachments is only available in the mobile app.');
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Please try again.';
      Alert.alert(
        action === 'download' ? 'Download failed' : 'Save as failed',
        message || 'Please try again.',
      );
    } finally {
      setSavingAttachmentKey(null);
    }
  };

  const handleDeleteMessage = async (message: Message, scope: 'me' | 'everyone') => {
    setActionMessage(null);
    try {
      await deleteMessage(message.conversationId, message.id, scope);
      if (scope === 'me') {
        setMessages((current) => current.filter((item) => item.id !== message.id));
      } else {
        setMessages((current) => current.map((item) => item.id === message.id
          ? { ...item, body: 'This message was deleted', attachments: [], deleted: true }
          : item,
        ));
      }
    } catch (cause) {
      await handleApiError(cause, 'The message could not be deleted.');
    }
  };

  const confirmConversationAction = (action: 'clear' | 'hide') => {
    if (!selectedConversation) return;
    const conversation = selectedConversation;
    const isHide = action === 'hide';
    Alert.alert(
      isHide ? 'Hide this conversation?' : 'Clear all messages?',
      isHide
        ? 'This removes the conversation from your list only.'
        : 'This clears messages from your view only. Other members will still see them.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isHide ? 'Hide' : 'Clear',
          style: 'destructive',
          onPress: () => {
            const request = isHide ? hideConversation(conversation.id) : clearConversationMessages(conversation.id);
            void request.then(async () => {
              if (isHide) {
                activeLoadId.current += 1;
                setSelectedConversationId(null);
                selectedConversationIdRef.current = null;
                setMessages([]);
                setReplyTarget(null);
                setEditingMessageId(null);
                setDraft('');
                await refreshConversations();
              } else {
                setMessages([]);
                cursorRef.current = null;
                setHasMore(false);
              }
            }).catch((cause) => {
              void handleApiError(cause, isHide
                ? 'The conversation could not be hidden.'
                : 'Messages could not be cleared.');
            });
          },
        },
      ],
    );
  };

  const selectedConversation = conversations.find(
    (conversation) => conversation.id === selectedConversationId,
  ) || null;
  const directPeer = selectedConversation?.type === 'direct'
    ? selectedConversation.participants.find((member) => member.firebaseUid !== currentUserId) || null
    : null;
  const visibleConversations = conversations.filter((conversation) =>
    activeSection === 'messages'
      ? conversation.type === 'direct'
      : activeSection === 'channels'
        ? conversation.type === 'channel'
        : activeSection === 'groups' && conversation.type === 'group',
  );
  const activeProject = projects.find((project) => project.id === createProjectId) || null;
  const eligibleProjectMembers = activeProject
    ? [activeProject.creator, ...activeProject.acceptedMembers]
      .filter((member, index, list) =>
        member.firebaseUid !== currentUserId &&
        list.findIndex((candidate) => candidate.firebaseUid === member.firebaseUid) === index)
    : [];

  const renderMessage: ListRenderItem<Message> = ({ item }) => {
    const own = item.senderUid === currentUserId;
    const sender = selectedConversation?.participants.find(
      (participant) => participant.firebaseUid === item.senderUid,
    );
    return (
      <View style={[styles.messageRow, own ? styles.messageRowOwn : styles.messageRowOther]}>
        <ParticipantAvatar
          uri={sender?.profileImage || (own ? user?.photoURL : '')}
          name={item.senderName}
          size={30}
        />
        <View style={styles.messageContent}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Message from ${item.senderName}`}
            accessibilityHint="Long press to open message actions."
            onLongPress={() => setActionMessage(item)}
            delayLongPress={350}
            style={[styles.messageBubble, own ? styles.messageBubbleOwn : styles.messageBubbleOther]}>
            {!own && <Text style={styles.messageSender}>{item.senderName}</Text>}
            {!!item.pinned && <Text style={styles.messageMarker}>📌 Pinned</Text>}
            {!!item.isDecision && <Text style={styles.messageMarker}>Decision</Text>}
            {!!item.forwardedFrom && (
              <Text style={styles.messageMarker}>Forwarded from {item.forwardedFrom.senderName}</Text>
            )}
            {!!item.replyToId && (
              <View style={styles.replyQuote}>
                <Text style={styles.replyQuoteSender}>{item.replyToSenderName || 'Message'}</Text>
                <Text numberOfLines={1} style={styles.replyQuoteBody}>{item.replyToBody || 'Attachment'}</Text>
              </View>
            )}
            {(item.deleted || item.body) && (
              <Text style={[styles.messageBody, own && styles.messageBodyOwn]}>
                {item.deleted ? 'This message was deleted' : item.body}
              </Text>
            )}
            {!item.deleted && item.attachments.map((attachment, index) => (
              attachment.is_voice_note || attachment.mediaType.startsWith('audio/') ? (
                <View key={`${attachment.fileName}-${index}`} style={styles.messageAttachment}>
                  <VoiceNotePlayer attachment={attachment} />
                </View>
              ) : attachment.mediaType.startsWith('image/') ? (
                <View key={`${attachment.fileName}-${index}`} style={styles.messageAttachment}>
                  <Image
                    accessibilityLabel={attachment.fileName}
                    source={{ uri: attachment.data }}
                    resizeMode="cover"
                    style={styles.messageAttachmentImage}
                  />
                  <View style={styles.attachmentCaption}>
                    <SvgXml xml={getAttachmentIconXml(attachment)} width={24} height={24} />
                    <Text numberOfLines={1} style={styles.messageAttachmentName}>
                      {attachment.fileName} · {formatFileSize(attachment.size)}
                    </Text>
                  </View>
                </View>
              ) : (
                <View key={`${attachment.fileName}-${index}`} style={styles.messageAttachment}>
                  <View style={styles.messageAttachmentDocumentPreview}>
                    <SvgXml xml={getAttachmentIconXml(attachment)} width={48} height={48} />
                  </View>
                  <View style={styles.attachmentCaption}>
                    <Text numberOfLines={1} style={styles.messageAttachmentName}>
                      {attachment.fileName} · {formatFileSize(attachment.size)}
                    </Text>
                  </View>
                </View>
              )
            ))}
            {item.reactions.length > 0 && (
              <View style={styles.reactions}>
                {item.reactions.filter((reaction) => reaction.users.length > 0).map((reaction) => (
                  <Pressable
                    key={reaction.emoji}
                    accessibilityRole="button"
                    accessibilityLabel={`React with ${reaction.emoji}`}
                    onPress={() => void runMessageAction(item, 'reaction', { emoji: reaction.emoji })}
                    style={styles.reactionChip}>
                    <Text style={styles.reactionText}>{reaction.emoji} {reaction.users.length}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            <View style={styles.messageMeta}>
              {item.editedAt && <Text style={[styles.messageTime, own && styles.messageTimeOwn]}>Edited · </Text>}
              <Text style={[styles.messageTime, own && styles.messageTimeOwn]}>
                {new Date(item.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </Text>
              {own && (
                <Text style={[styles.messageReceipt, item.readAt && styles.messageReceiptRead]}>
                  {item.readAt ? ' ✓✓' : ' ✓'}
                </Text>
              )}
            </View>
          </Pressable>
        </View>
      </View>
    );
  };

  if (!authReady || !user) {
    return <View style={styles.loading}><ActivityIndicator color="#F5B800" /></View>;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.pageHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={selectedConversation ? 'Back to conversations' : 'Back to workspace'}
          onPress={() => {
            if (selectedConversation) {
              activeLoadId.current += 1;
              selectedConversationIdRef.current = null;
              setSelectedConversationId(null);
              setMessages([]);
            } else {
              router.replace('/workspace');
            }
          }}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <Text style={styles.backButtonText}>{selectedConversation ? '‹' : '‹'}</Text>
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>
            {selectedConversation
              ? getConversationTitle(selectedConversation, currentUserId)
              : messageSections.find((section) => section.id === activeSection)?.label || 'Messages'}
          </Text>
          <Text style={styles.headerSubtitle}>
            {!realtimeConnected
              ? 'Live updates reconnecting…'
              : selectedConversation
                ? selectedConversation.type === 'direct'
                  ? directPeer?.isOnline ? 'Online' : formatLastSeen(directPeer?.lastSeenAt || null)
                  : `${selectedConversation.participants.length} members`
                : 'Live updates on'}
          </Text>
        </View>
        {selectedConversation?.type === 'direct' && (
          <View style={styles.callActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Start voice call"
              onPress={() => Alert.alert('Voice calls unavailable', 'Voice calling is not available in the mobile app yet.')}
              style={({ pressed }) => [styles.headerIconButton, pressed && styles.pressed]}>
              <Svg width={22} height={22} viewBox="0 0 24 24">
                <G fill="none">
                <Path
                  d="M21 22c-3.8 0-7.338-1.115-10.307-3.036a19.1 19.1 0 0 1-5.657-5.657A18.9 18.9 0 0 1 2 3h6.778L9.97 8.372l-2.024 2.024a15.07 15.07 0 0 0 5.657 5.657l2.024-2.025L21 15.223zm-.018-14.758a6 6 0 0 0-4.226-4.228m.848 5.14a2.5 2.5 0 0 0-1.761-1.762"
                  stroke="#44444B"
                  strokeLinecap="square"
                  strokeWidth={2}
                />
                </G>
              </Svg>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Start video call"
              onPress={() => Alert.alert('Video calls unavailable', 'Video calling is not available in the mobile app yet.')}
              style={({ pressed }) => [styles.headerIconButton, pressed && styles.pressed]}>
              <Svg width={22} height={22} viewBox="0 0 24 24">
                <Path
                  d="M3.59 19.499a2 2 0 0 1-2-2V6.502a2 2 0 0 1 2-2h11.211a2 2 0 0 1 2 2v10.997a2 2 0 0 1-2 2zm13.731-4.998a1 1 0 0 1-.52-.877v-3.247a1 1 0 0 1 .52-.877l3.608-1.976a1 1 0 0 1 1.48.877v7.2a1 1 0 0 1-1.48.876z"
                  fill="none"
                  stroke="#44444B"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                />
                <Path
                  d="M6.091 9.122a.36.36 0 0 0-.332.333c0 .166.166.332.332.332m0-.665c.167 0 .333.166.333.333a.36.36 0 0 1-.333.332m6.211-.665a.36.36 0 0 0-.332.333c0 .166.166.332.332.332m0-.665c.167 0 .333.166.333.333a.36.36 0 0 1-.333.332m.194 3.204a3.593 3.593 0 0 1-6.6 0"
                  fill="none"
                  stroke="#44444B"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  strokeMiterlimit={10}
                />
              </Svg>
            </Pressable>
          </View>
        )}
        {!selectedConversation && activeSection !== 'calls' && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Start a conversation"
            onPress={() => startConversationCreation(
              activeSection === 'channels'
                ? 'channel'
                : activeSection === 'groups'
                  ? 'group'
                  : 'direct',
            )}
            style={({ pressed }) => [styles.createButton, pressed && styles.pressed]}>
            <Text style={styles.createButtonText}>+</Text>
          </Pressable>
        )}
      </View>

      {!!error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={() => setError('')}>
            <Text style={styles.dismissError}>×</Text>
          </Pressable>
        </View>
      )}

      {!selectedConversation ? (
        <>
          {activeSection === 'calls' ? (
            <FlatList
              data={callHistory}
              keyExtractor={(item) => item.id}
              contentContainerStyle={callHistory.length ? styles.conversationList : styles.emptyList}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing || loadingCallHistory}
                  onRefresh={() => {
                    setRefreshing(true);
                    void loadCallHistory().finally(() => setRefreshing(false));
                  }}
                />
              }
              ListEmptyComponent={
                loadingConversations || loadingCallHistory
                  ? <ActivityIndicator color="#F5B800" style={styles.listIndicator} />
                  : <Text style={styles.emptyText}>No calls yet.</Text>
              }
              renderItem={({ item }) => {
                const isCaller = item.callerUid === currentUserId;
                const peerName = isCaller ? item.calleeName : item.callerName;
                const peer = conversations
                  .find((conversation) => conversation.id === item.conversationId)
                  ?.participants.find((member) => member.firebaseUid === (isCaller ? item.calleeUid : item.callerUid));
                const missed = item.status === 'missed' || item.status === 'declined';
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${missed ? 'Missed' : isCaller ? 'Outgoing' : 'Incoming'} ${item.type} call with ${peerName}`}
                    onPress={() => openConversation(item.conversationId)}
                    style={({ pressed }) => [styles.conversationRow, pressed && styles.pressed]}>
                    <View style={styles.conversationAvatar}>
                      <ParticipantAvatar uri={peer?.profileImage} name={peerName} size={46} />
                    </View>
                    <View style={styles.conversationCopy}>
                      <View style={styles.conversationTitleRow}>
                        <Text numberOfLines={1} style={styles.conversationTitle}>{peerName}</Text>
                        <Text style={styles.conversationDate}>{formatConversationDate(item.createdAt)}</Text>
                      </View>
                      <Text style={[styles.conversationPreview, missed && styles.missedCall]}>
                        {missed ? 'Missed' : isCaller ? 'Outgoing' : 'Incoming'} {item.type} call
                      </Text>
                    </View>
                    <Text style={[styles.callTypeIcon, missed && styles.missedCall]}>
                      {item.type === 'video' ? '▣' : '☎'}
                    </Text>
                  </Pressable>
                );
              }}
            />
          ) : (
            <FlatList
              data={visibleConversations}
              keyExtractor={(item) => item.id}
              contentContainerStyle={visibleConversations.length ? styles.conversationList : styles.emptyList}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => {
                    setRefreshing(true);
                    void refreshConversations();
                  }}
                />
              }
              ListEmptyComponent={
                loadingConversations
                  ? <ActivityIndicator color="#F5B800" style={styles.listIndicator} />
                  : <Text style={styles.emptyText}>
                    {activeSection === 'messages'
                      ? 'No direct messages yet.'
                      : activeSection === 'channels'
                        ? 'No channels yet.'
                        : 'No groups yet.'}
                  </Text>
              }
              renderItem={({ item }) => {
                const title = getConversationTitle(item, currentUserId);
                const directPeer = item.participants.find((member) => member.firebaseUid !== currentUserId);
                const avatarMember = directPeer || item.participants.find(
                  (member) => member.firebaseUid !== currentUserId,
                );
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${title}${item.unreadCount ? `, ${item.unreadCount} unread` : ''}`}
                    onPress={() => openConversation(item.id)}
                    style={({ pressed }) => [styles.conversationRow, pressed && styles.pressed]}>
                    <View style={styles.conversationAvatar}>
                      <ParticipantAvatar
                        uri={avatarMember?.profileImage}
                        name={avatarMember?.name || title.replace(/^[#◉]\s*/, '')}
                        size={46}
                      />
                      {directPeer?.isOnline && <View style={styles.onlineDot} />}
                    </View>
                    <View style={styles.conversationCopy}>
                      <View style={styles.conversationTitleRow}>
                        <Text numberOfLines={1} style={styles.conversationTitle}>{title}</Text>
                        {!!item.latestMessageCreatedAt && (
                          <Text style={styles.conversationDate}>
                            {formatConversationDate(item.latestMessageCreatedAt)}
                          </Text>
                        )}
                      </View>
                      <Text numberOfLines={1} style={styles.conversationPreview}>
                        {item.latestMessage || 'Start a conversation'}
                      </Text>
                    </View>
                    {item.unreadCount > 0 && (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadText}>{item.unreadCount > 99 ? '99+' : item.unreadCount}</Text>
                      </View>
                    )}
                  </Pressable>
                );
              }}
            />
          )}
          <View style={styles.bottomNavigator} accessibilityRole="tablist">
            {messageSections.map((section) => {
              const selected = section.id === activeSection;
              return (
                <Pressable
                  key={section.id}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  accessibilityLabel={section.label}
                  onPress={() => setActiveSection(section.id)}
                  style={({ pressed }) => [
                    styles.bottomNavTab,
                    selected && styles.bottomNavTabSelected,
                    pressed && styles.pressed,
                  ]}>
                  {section.id === 'messages' && (
                    <Svg style={styles.bottomNavIcon} width={24} height={24} viewBox="0 0 24 24">
                      <Path
                        fill={selected ? '#242424' : '#77777F'}
                        d="M23.963 9.61c-.09-2-1.61-4.821-4.191-6.882A12.25 12.25 0 0 0 12.16.008a12.36 12.36 0 0 0-8.122 2.83A11.33 11.33 0 0 0 .037 10.44c-.18 3.06.3 4.851 1.37 6.082s2.941 2 5.482 2.85c.09 0 .12.15.17.3c.114.51.114 1.04 0 1.55a4.44 4.44 0 0 1-.9 2.081a.43.43 0 0 0 .36.69q.441.01.88-.05a8.8 8.8 0 0 0 3.56-1.16a5.4 5.4 0 0 0 1.001-.95c.69-.84 1.28-1.9 1.62-2.34c.41 0 1.4 0 2.441-.13a13.5 13.5 0 0 0 1.76-.3a8.35 8.35 0 0 0 4.862-3.562a10 10 0 0 0 1.32-5.891m-2 5.481a7.54 7.54 0 0 1-4.352 3.321q-.819.214-1.66.31c-1.32.16-2.4-.07-2.73.17s-.921 1.33-1.561 2.16a5.3 5.3 0 0 1-1.09 1.121a7.8 7.8 0 0 1-3.251 1c.378-.729.597-1.53.64-2.35a3.6 3.6 0 0 0-.18-1.59a1.12 1.12 0 0 0-.64-.7c-2.33-.851-4.001-1.461-5.001-2.661s-1.25-2.681-1-5.362a10.2 10.2 0 0 1 3.7-6.792a11.35 11.35 0 0 1 7.402-2.56a11.2 11.2 0 0 1 6.942 2.4c2.35 1.82 3.81 4.301 3.93 6.102a9.16 9.16 0 0 1-1.21 5.431z"
                      />
                      <Path
                        fill={selected ? '#242424' : '#77777F'}
                        d="M5.138 8.779a1.49 1.49 0 0 0 1.35-2.64c-1.43-.85-3.45 1.87-1.35 2.64m1.37 3.391c-1.43-.84-3.45 1.84-1.35 2.65a1.5 1.5 0 0 0 1.35-2.65M19.342 7.3c-.49-.06-1.87-.2-3.471-.29H12.9a40 40 0 0 0-3.462.32a.3.3 0 0 0 .03.6c.71 0 2 .12 3.441.18h2.94c1.591-.1 2.942-.1 3.432-.1a.34.34 0 0 0 .37-.31a.35.35 0 0 0-.31-.4m-.249 5.47H14.3c-.48 0-1 0-1.44.08c-1.631.13-3.002.3-3.322.31a.3.3 0 1 0 0 .601c.36 0 1.73.16 3.401.18h1.44c.44 0 1-.06 1.44-.1a78 78 0 0 0 3.352-.36a.34.34 0 1 0 0-.68z"
                      />
                    </Svg>
                  )}
                  {section.id === 'channels' && (
                    <Svg style={styles.bottomNavIcon} width={24} height={24} viewBox="0 0 20 20">
                      <Path
                        fill={selected ? '#242424' : '#77777F'}
                        d="M14.158 1.026a.5.5 0 0 1 .317.632l-.5 1.5a.5.5 0 0 1-.95-.316l.5-1.5a.5.5 0 0 1 .633-.316m3.697 1.828a.5.5 0 1 0-.708-.707l-2 2a.5.5 0 0 0 .707.707zm-10.248.292a2 2 0 0 1 3.261-.515l6.587 6.98a2 2 0 0 1-.648 3.203L12.87 14.55A3.504 3.504 0 0 1 9.5 19a3.5 3.5 0 0 1-2.975-1.655l-1.2.529a1.5 1.5 0 0 1-1.661-.308l-1.222-1.21a1.5 1.5 0 0 1-.299-1.71zm-.154 13.789a2.5 2.5 0 0 0 4.488-1.977zm2.688-13.617a1 1 0 0 0-1.63.257l-5.465 11.5a.5.5 0 0 0 .1.569l1.222 1.211a.5.5 0 0 0 .553.102L16.403 11.9a1 1 0 0 0 .325-1.601zM17 6a.5.5 0 0 0 0 1h1.5a.5.5 0 1 0 0-1z"
                      />
                    </Svg>
                  )}
                  {section.id === 'groups' && (
                    <Svg style={styles.bottomNavIcon} width={24} height={24} viewBox="0 0 48 48">
                      <Path
                        fill={selected ? '#242424' : '#77777F'}
                        fillRule="evenodd"
                        d="M28 16c0 2.21-1.79 4-4 4s-4-1.79-4-4s1.79-4 4-4s4 1.79 4 4m-2 0a1.999 1.999 0 1 1-4 0a1.999 1.999 0 1 1 4 0m-8 1.5a4.5 4.5 0 0 1-4.5 4.5A4.5 4.5 0 0 1 9 17.5c0-2.486 2.014-4.5 4.5-4.5s4.5 2.014 4.5 4.5m-2 0c0 1.382-1.118 2.5-2.5 2.5a2.5 2.5 0 0 1-2.5-2.5c0-1.382 1.118-2.5 2.5-2.5s2.5 1.118 2.5 2.5M4 29.455C4 25.827 10.663 24 14 24c.801 0 1.794.105 2.84.316C18.133 23.31 20.673 22 24 22s5.867 1.31 7.16 2.316C32.206 24.106 33.199 24 34 24c3.337 0 10 1.827 10 5.454V36H4zm2 0c0-.237.094-.552.512-.974c.437-.44 1.128-.884 2.037-1.281C10.38 26.4 12.605 26 14 26s3.622.4 5.45 1.2c.91.397 1.601.842 2.038 1.281c.418.422.512.737.512.973V34H6zm22.55-4.41A10.3 10.3 0 0 0 24 24c-1.875 0-3.432.495-4.55 1.045c2.44.897 4.55 2.368 4.55 4.41c0-2.042 2.11-3.513 4.55-4.41m-2.038 3.436c-.418.422-.512.737-.512.973V34h16v-4.546c0-.236-.094-.551-.512-.973c-.437-.44-1.128-.884-2.037-1.281C37.62 26.4 35.395 26 34 26s-3.622.4-5.45 1.2c-.91.397-1.601.842-2.038 1.281M34.5 22c2.486 0 4.5-2.014 4.5-4.5S36.986 13 34.5 13a4.5 4.5 0 0 0-4.5 4.5a4.5 4.5 0 0 0 4.5 4.5m0-2c1.382 0 2.5-1.118 2.5-2.5S35.882 15 34.5 15a2.5 2.5 0 0 0-2.5 2.5c0 1.382 1.118 2.5 2.5 2.5"
                        clipRule="evenodd"
                      />
                    </Svg>
                  )}
                  {section.id === 'calls' && (
                    <Svg style={styles.bottomNavIcon} width={24} height={24} viewBox="0 0 24 24">
                      <G
                        fill="none"
                        stroke={selected ? '#242424' : '#77777F'}
                        strokeWidth={1.5}
                      >
                        <Path d="m4.74 14.369l1.954-1.387a5.3 5.3 0 0 1 1.746-.823c.732-.195 1.06-.595 1.06-1.448c0-2.165 5-2.395 5 0c0 .853.328 1.253 1.06 1.447c.642.172 1.2.435 1.746.824l1.954 1.386c.883.628 1.295.931 1.524 1.414c.216.454.216.986.216 2.05c0 1.914 0 2.871-.536 3.484c-.649.743-2.336.68-3.372.68H6.908c-1.036 0-2.689.103-3.372-.68C3 20.703 3 19.746 3 17.832c0-1.064 0-1.596.216-2.05c.23-.482.64-.786 1.524-1.414Z" />
                        <Circle cx={12} cy={17} r={2} />
                        <Path
                          strokeLinejoin="round"
                          d="M6.96 3.698c-1.318.376-2.266.843-3.134 1.407c-1.373.892-1.962 2.499-1.8 4.05c.068.656.595.97 1.205.8c.464-.13.928-.255 1.389-.391c1.347-.4 1.664-.886 1.851-2.265zm0 0c3.259-.93 6.821-.93 10.08 0m0 0c1.318.376 2.266.843 3.134 1.407c1.373.892 1.962 2.499 1.8 4.05c-.068.656-.595.97-1.205.8c-.463-.13-.928-.255-1.389-.391c-1.347-.4-1.664-.886-1.851-2.265z"
                        />
                      </G>
                    </Svg>
                  )}
                  <Text style={[styles.bottomNavLabel, selected && styles.bottomNavLabelSelected]}>
                    {section.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : (
        <KeyboardAvoidingView
          style={styles.thread}
          behavior="padding"
          keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 64 : 0}>
          <ImageBackground
            source={require('../../assets/images/message-chat-bg.png')}
            resizeMode="repeat"
            imageStyle={styles.chatBackgroundImage}
            style={styles.chatBackground}>
            {loadingMessages && messages.length === 0 ? (
              <View style={styles.threadLoading}><ActivityIndicator color="#F5B800" /></View>
            ) : (
              <FlatList
                inverted
                data={[...messages].reverse()}
                keyExtractor={(item) => item.id}
                renderItem={renderMessage}
                style={styles.messageFeed}
                contentContainerStyle={messages.length ? styles.messageList : styles.emptyThread}
                maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
                onEndReached={() => { if (hasMore) void loadOlderMessages(); }}
                onEndReachedThreshold={0.3}
                ListFooterComponent={loadingOlder
                  ? <ActivityIndicator color="#F5B800" style={styles.olderIndicator} />
                  : undefined}
                ListEmptyComponent={
                  <Text style={styles.emptyText}>No messages yet. Send the first message.</Text>
                }
              />
            )}
          <View style={styles.composer}>
            {(replyTarget || editingMessageId) && !voiceRecordingSession && (
              <View style={styles.composerContext}>
                <View style={styles.composerContextText}>
                  <Text style={styles.composerContextTitle}>
                    {editingMessageId ? 'Editing message' : `Replying to ${replyTarget?.senderName || 'message'}`}
                  </Text>
                  <Text numberOfLines={1} style={styles.composerContextBody}>
                    {editingMessageId
                      ? 'Update your message'
                      : replyTarget?.body || (replyTarget?.attachments.length ? 'Attachment' : 'Message')}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Cancel reply or edit"
                  onPress={() => {
                    setReplyTarget(null);
                    setEditingMessageId(null);
                    setDraft('');
                  }}>
                  <Text style={styles.dismissError}>×</Text>
                </Pressable>
              </View>
            )}
            {voiceRecordingSession ? (
              <View style={styles.recordingPanel}>
                <View style={styles.recordingWaveRow}>
                  <View style={styles.recordingWaveform} accessibilityLabel="Voice recording waveform">
                    {voiceWaveformLevels.map((level, index) => (
                      <View
                        key={index}
                        style={[
                          styles.recordingWaveformBar,
                          { height: 3 + level * 24 },
                        ]}
                      />
                    ))}
                  </View>
                  <Text style={styles.recordingTime}>
                    {formatVoiceDuration(Math.floor(recorderState.durationMillis / 1000))}
                  </Text>
                </View>
                <View style={styles.recordingActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Discard voice note"
                    disabled={voiceNoteBusy}
                    onPress={() => { void finishVoiceRecording(true); }}
                    style={({ pressed }) => [styles.recordingDiscardButton, pressed && styles.pressed]}>
                    {voiceNoteBusy
                      ? <ActivityIndicator size="small" color="#FF526B" />
                      : (
                        <Svg width={21} height={21} viewBox="0 0 24 24">
                          <Path
                            d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6zM8 9h8v10H8zm7.5-5-1-1h-5l-1 1H5v2h14V4z"
                            fill="#FF526B"
                          />
                        </Svg>
                      )}
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={voiceRecordingPaused ? 'Resume voice recording' : 'Pause voice recording'}
                    disabled={voiceNoteBusy}
                    onPress={toggleVoiceRecordingPause}
                    style={({ pressed }) => [styles.recordingPauseButton, pressed && styles.pressed]}>
                    <Svg width={21} height={21} viewBox="0 0 48 48">
                      <Path
                        d="M24 38v6M9 23a15 15 0 0 0 30 0"
                        fill="none"
                        stroke="#FFFFFF"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={4}
                      />
                      <Path
                        d="M17 11a7 7 0 0 1 14 0v13a7 7 0 0 1-14 0z"
                        fill="none"
                        stroke="#FFFFFF"
                        strokeWidth={4}
                      />
                    </Svg>
                    <Text style={styles.recordingPauseText}>{voiceRecordingPaused ? 'Resume' : 'Pause'}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Send voice note"
                    disabled={voiceNoteBusy || sending}
                    onPress={() => { void finishVoiceRecording(false); }}
                    style={({ pressed }) => [styles.recordingSendButton, pressed && styles.pressed]}>
                    {voiceNoteBusy
                      ? <ActivityIndicator size="small" color="#242424" />
                      : (
                        <Svg width={20} height={20} viewBox="0 0 24 24">
                          <Path
                            d="M22 12L3 20l3.563-8L3 4zM6.5 12H22"
                            fill="none"
                            stroke="#242424"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                          />
                        </Svg>
                      )}
                  </Pressable>
                </View>
              </View>
            ) : (
              <>
            <View style={styles.composerRow}>
              {!editingMessageId && Platform.OS !== 'web' && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Attach a file"
                  accessibilityState={{
                    disabled: sending || pickingAttachment || voiceNoteBusy || recorderState.isRecording,
                  }}
                  disabled={sending || pickingAttachment || voiceNoteBusy || recorderState.isRecording}
                  onPress={() => { void handlePickAttachment(); }}
                  style={({ pressed }) => [
                    styles.attachButton,
                    pressed && styles.pressed,
                  ]}>
                  {pickingAttachment
                    ? <ActivityIndicator size="small" color="#FFFFFF" />
                    : <Text style={styles.attachButtonText}>+</Text>}
                </Pressable>
              )}
              <View style={styles.composerInputWrap}>
                <TextInput
                  ref={messageInputRef}
                  accessibilityLabel="Write a message"
                  placeholder="Write a message…"
                  placeholderTextColor="#96969D"
                  value={draft}
                  onChangeText={setDraft}
                  multiline
                  maxLength={5000}
                  editable={!sending}
                  style={styles.composerInput}
                  onSubmitEditing={() => { void handleSend(); }}
                />
                {!editingMessageId && Platform.OS !== 'web' && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Record a voice note"
                    accessibilityState={{
                      disabled: sending || pickingAttachment || voiceNoteBusy || selectedAttachments.length >= maxMessageAttachments,
                      busy: voiceNoteBusy,
                    }}
                    disabled={sending || pickingAttachment || voiceNoteBusy || selectedAttachments.length >= maxMessageAttachments}
                    onPressIn={() => {
                      messageInputRef.current?.blur();
                      Keyboard.dismiss();
                    }}
                    onPress={() => { void handleVoiceNotePress(); }}
                    style={({ pressed }) => [
                      styles.voiceNoteButton,
                        pressed && styles.pressed,
                      ]}>
                    {voiceNoteBusy
                      ? <ActivityIndicator size="small" color="#242424" />
                      : <SvgXml xml={voiceNoteIconSvg} width={18} height={18} />}
                  </Pressable>
                )}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={editingMessageId ? 'Save edited message' : 'Send message'}
                accessibilityState={{
                  disabled: !(draft.trim() || selectedAttachments.length) || sending || pickingAttachment ||
                    voiceNoteBusy || recorderState.isRecording,
                }}
                disabled={!(draft.trim() || selectedAttachments.length) || sending || pickingAttachment ||
                  voiceNoteBusy || recorderState.isRecording}
                onPress={() => { void handleSend(); }}
                style={({ pressed }) => [
                  styles.sendButton,
                  pressed && styles.pressed,
                ]}>
                {sending
                  ? <ActivityIndicator size="small" color="#242424" />
                  : editingMessageId
                    ? <Text style={styles.sendButtonText}>✓</Text>
                    : (
                      <Svg width={22} height={22} viewBox="0 0 24 24">
                        <Path
                          d="M22 12L3 20l3.563-8L3 4zM6.5 12H22"
                          fill="none"
                          stroke="#242424"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                        />
                      </Svg>
                    )}
              </Pressable>
            </View>
            {!!selectedAttachments.length && (
              <View style={styles.stagedAttachments}>
                {selectedAttachments.map((attachment, index) => (
                  <View key={`${attachment.fileName}-${index}`} style={styles.stagedAttachment}>
                    <Text numberOfLines={1} style={styles.stagedAttachmentName}>
                      {attachment.fileName} · {formatFileSize(attachment.size)}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${attachment.fileName}`}
                      disabled={sending}
                      onPress={() => setSelectedAttachments((current) =>
                        current.filter((_, attachmentIndex) => attachmentIndex !== index))}
                      style={styles.removeAttachmentButton}>
                      <Text style={styles.removeAttachmentText}>×</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
              </>
            )}
          </View>
          </ImageBackground>
        </KeyboardAvoidingView>
      )}

      <Modal
        visible={createModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCreateModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.createModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {forwardTarget ? 'Forward message' : 'New conversation'}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close new conversation"
                onPress={() => setCreateModalVisible(false)}>
                <Text style={styles.dismissError}>×</Text>
              </Pressable>
            </View>
            {!projects.length ? (
              <Text style={styles.emptyText}>No accessible projects are available.</Text>
            ) : (
              <>
                <View style={styles.conversationTypeRow}>
                  {(['direct', 'group', 'channel'] as const).map((type) => (
                    <Pressable
                      key={type}
                      accessibilityRole="button"
                      accessibilityState={{ selected: createType === type }}
                      onPress={() => {
                        setCreateType(type);
                        setSelectedMemberUids([]);
                      }}
                      style={[styles.typeChip, createType === type && styles.typeChipSelected]}>
                      <Text style={[styles.typeChipText, createType === type && styles.typeChipTextSelected]}>
                        {type === 'direct' ? 'Direct' : type === 'group' ? 'Group' : 'Channel'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.formLabel}>Project</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.projectPicker}>
                  {projects.map((project) => (
                    <Pressable
                      key={project.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: createProjectId === project.id }}
                      onPress={() => {
                        setCreateProjectId(project.id);
                        setSelectedMemberUids([]);
                      }}
                      style={[styles.projectChip, createProjectId === project.id && styles.typeChipSelected]}>
                      <Text style={[
                        styles.typeChipText,
                        createProjectId === project.id && styles.typeChipTextSelected,
                      ]}>
                        {project.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
                {createType !== 'direct' && (
                  <>
                    <Text style={styles.formLabel}>{createType === 'channel' ? 'Channel name' : 'Group name'}</Text>
                    <TextInput
                      accessibilityLabel={createType === 'channel' ? 'Channel name' : 'Group name'}
                      value={createName}
                      onChangeText={setCreateName}
                      maxLength={60}
                      placeholder={createType === 'channel' ? 'e.g. design-team' : 'e.g. Product launch'}
                      style={styles.nameInput}
                    />
                  </>
                )}
                <Text style={styles.formLabel}>
                  {createType === 'direct' ? 'Choose one teammate' : 'Choose project teammates'}
                </Text>
                <ScrollView style={styles.memberPicker} keyboardShouldPersistTaps="handled">
                  {eligibleProjectMembers.map((member) => {
                    const selected = selectedMemberUids.includes(member.firebaseUid);
                    return (
                      <Pressable
                        key={member.firebaseUid}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: selected }}
                        onPress={() => setSelectedMemberUids((current) =>
                          selected
                            ? current.filter((uid) => uid !== member.firebaseUid)
                            : [...current, member.firebaseUid],
                        )}
                        style={[styles.memberRow, selected && styles.memberRowSelected]}>
                        <ParticipantAvatar uri={member.profileImage} name={member.name} size={38} />
                        <View style={styles.memberDetails}>
                          <Text numberOfLines={1} style={styles.memberName}>{member.name}</Text>
                          <Text numberOfLines={1} style={styles.memberEmail}>{member.email}</Text>
                        </View>
                        <Text style={styles.memberCheck}>{selected ? '✓' : '○'}</Text>
                      </Pressable>
                    );
                  })}
                  {!eligibleProjectMembers.length && (
                    <Text style={styles.emptyText}>No accepted teammates are available in this project.</Text>
                  )}
                </ScrollView>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: creatingConversation }}
                  disabled={creatingConversation}
                  onPress={() => void handleCreateConversation()}
                  style={[styles.createSubmit, creatingConversation && styles.createSubmitDisabled]}>
                  {creatingConversation
                    ? <ActivityIndicator color="#FFFFFF" />
                    : <Text style={styles.createSubmitText}>
                        {forwardTarget ? 'Create and forward' : 'Create conversation'}
                      </Text>}
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={Boolean(actionMessage)}
        transparent
        animationType="fade"
        onRequestClose={() => setActionMessage(null)}>
        <Pressable style={styles.actionsBackdrop} onPress={() => setActionMessage(null)}>
          <Pressable style={styles.actionsModal} onPress={() => undefined}>
            <ScrollView style={styles.actionScroll}>
              <Text style={styles.modalTitle}>Message actions</Text>
              {actionMessage && (
                <>
                  {actionMessage.attachments.length > 0 && !actionMessage.deleted && (
                    <>
                      <Text style={styles.formLabel}>Attachments</Text>
                      {actionMessage.attachments.map((attachment, index) => {
                        const key = `${actionMessage.id}:${index}`;
                        const isSaving = savingAttachmentKey === key;
                        return (
                          <View key={`${attachment.fileName}-${index}`} style={styles.attachmentAction}>
                            <Text numberOfLines={1} style={styles.attachmentActionName}>
                              {attachment.fileName}
                            </Text>
                            <View style={styles.attachmentActionButtons}>
                              {(['download', 'saveAs'] as const).map((action) => (
                                <Pressable
                                  key={action}
                                  accessibilityRole="button"
                                  accessibilityLabel={`${action === 'download' ? 'Download' : 'Save as'} ${attachment.fileName}`}
                                  disabled={Boolean(savingAttachmentKey)}
                                  onPress={() => void handleAttachmentFileAction(attachment, action, key)}
                                  style={[
                                    styles.attachmentActionButton,
                                    savingAttachmentKey && styles.attachmentActionButtonDisabled,
                                  ]}>
                                  <Text style={styles.attachmentActionButtonText}>
                                    {isSaving
                                      ? 'Saving…'
                                      : action === 'download' ? 'Download' : 'Save as'}
                                  </Text>
                                </Pressable>
                              ))}
                            </View>
                          </View>
                        );
                      })}
                    </>
                  )}
                  <Pressable style={styles.actionItem} onPress={() => {
                    setReplyTarget(actionMessage);
                    setEditingMessageId(null);
                    setDraft('');
                    setActionMessage(null);
                  }}>
                    <Text style={styles.actionText}>Reply</Text>
                  </Pressable>
                  {actionMessage.senderUid === currentUserId && !actionMessage.deleted && (
                    <Pressable style={styles.actionItem} onPress={() => {
                      setEditingMessageId(actionMessage.id);
                      setReplyTarget(null);
                      setDraft(actionMessage.body);
                      setSelectedAttachments([]);
                      setActionMessage(null);
                    }}>
                      <Text style={styles.actionText}>Edit</Text>
                    </Pressable>
                  )}
                  {!actionMessage.deleted && (
                    <>
                      <Text style={styles.formLabel}>React</Text>
                      <View style={styles.reactionChoices}>
                        {['👍', '❤️', '😂', '🎉', '👀', '🙌', '🔥', '✅', '🤔', '😄'].map((emoji) => (
                          <Pressable
                            key={emoji}
                            accessibilityRole="button"
                            accessibilityLabel={`React with ${emoji}`}
                            onPress={() => void runMessageAction(actionMessage, 'reaction', { emoji })}
                            style={styles.reactionChoice}>
                            <Text style={styles.reactionChoiceText}>{emoji}</Text>
                          </Pressable>
                        ))}
                      </View>
                      {(['pin', 'decision'] as const).map((action) => (
                        <Pressable
                          key={action}
                          style={styles.actionItem}
                          onPress={() => void runMessageAction(actionMessage, action)}>
                          <Text style={styles.actionText}>
                            {action === 'pin'
                              ? actionMessage.pinned ? 'Unpin message' : 'Pin message'
                              : actionMessage.isDecision ? 'Remove decision label' : 'Mark as decision'}
                          </Text>
                        </Pressable>
                      ))}
                      <Pressable style={styles.actionItem} onPress={() => {
                        const target = actionMessage;
                        setActionMessage(null);
                        startConversationCreation('direct', target);
                      }}>
                        <Text style={styles.actionText}>Forward</Text>
                      </Pressable>
                    </>
                  )}
                  <Pressable style={styles.actionItem} onPress={() => void handleDeleteMessage(actionMessage, 'me')}>
                    <Text style={styles.actionDanger}>Delete for me</Text>
                  </Pressable>
                  {actionMessage.senderUid === currentUserId && !actionMessage.deleted && (
                    <Pressable style={styles.actionItem} onPress={() => void handleDeleteMessage(actionMessage, 'everyone')}>
                      <Text style={styles.actionDanger}>Delete for everyone</Text>
                    </Pressable>
                  )}
                </>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function formatConversationDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  return date.toDateString() === now.toDateString()
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatLastSeen(value: string | null): string {
  if (!value) return 'Last seen unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Last seen unavailable';

  const now = new Date();
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (date.toDateString() === now.toDateString()) return `Last seen today at ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `Last seen yesterday at ${time}`;

  return `Last seen ${date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  })} at ${time}`;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8F8FA' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8F8FA' },
  pageHeader: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E4E4E7',
    backgroundColor: '#FFFFFF',
  },
  backButton: { width: 40, height: 44, alignItems: 'flex-start', justifyContent: 'center' },
  backButtonText: { color: '#26262A', fontSize: 34, lineHeight: 38 },
  headerCopy: { flex: 1, marginLeft: 5 },
  headerTitle: { color: '#222226', fontSize: 16, fontWeight: '800' },
  headerSubtitle: { marginTop: 3, color: '#85858C', fontSize: 11 },
  callActions: { flexDirection: 'row', alignItems: 'center', marginLeft: 4 },
  headerIconButton: { width: 38, height: 40, alignItems: 'center', justifyContent: 'center' },
  createButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
    borderRadius: 19,
    backgroundColor: '#242424',
  },
  createButtonText: { color: '#FFFFFF', fontSize: 27, lineHeight: 31, fontWeight: '500' },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: '#FEF2F2',
  },
  errorText: { flex: 1, color: '#B42318', fontSize: 12, lineHeight: 17 },
  dismissError: { marginLeft: 10, color: '#B42318', fontSize: 20 },
  conversationList: { paddingVertical: 8 },
  emptyList: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  listIndicator: { marginTop: 40 },
  emptyText: { color: '#85858C', fontSize: 14, textAlign: 'center' },
  conversationRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E9E9EC',
  },
  bottomNavigator: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingTop: 7,
    paddingBottom: 5,
    borderTopWidth: 1,
    borderTopColor: '#E4E4E7',
    backgroundColor: '#FFFFFF',
  },
  bottomNavTab: {
    flex: 1,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    marginHorizontal: 2,
    borderRadius: 12,
  },
  bottomNavTabSelected: { backgroundColor: 'transparent' },
  bottomNavIcon: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  bottomNavLabel: { color: '#77777F', fontSize: 11, fontWeight: '700' },
  bottomNavLabelSelected: { color: '#242424' },
  callTypeIcon: { marginLeft: 8, color: '#287B6E', fontSize: 18 },
  missedCall: { color: '#B42318' },
  conversationAvatar: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderRadius: 23,
    backgroundColor: '#F4F4F5',
  },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8E7DE' },
  conversationAvatarText: { color: '#573F38', fontSize: 13, fontWeight: '800' },
  onlineDot: {
    position: 'absolute',
    right: -1,
    bottom: 0,
    width: 11,
    height: 11,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    borderRadius: 6,
    backgroundColor: '#10B981',
  },
  conversationCopy: { flex: 1, minWidth: 0 },
  conversationTitleRow: { flexDirection: 'row', alignItems: 'center' },
  conversationTitle: { flex: 1, color: '#26262A', fontSize: 14, fontWeight: '700' },
  conversationDate: { marginLeft: 7, color: '#9999A0', fontSize: 10 },
  conversationPreview: { marginTop: 5, color: '#797980', fontSize: 12 },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: '#F5B800',
  },
  unreadText: { color: '#242424', fontSize: 10, fontWeight: '800' },
  thread: { flex: 1 },
  chatBackground: { flex: 1 },
  chatBackgroundImage: { opacity: 0.15 },
  messageFeed: { backgroundColor: 'transparent' },
  threadLoading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  messageList: { paddingHorizontal: 14, paddingVertical: 16 },
  emptyThread: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  olderIndicator: { marginVertical: 12 },
  messageRow: { width: '100%', flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginVertical: 4 },
  messageRowOwn: { justifyContent: 'flex-start', flexDirection: 'row-reverse' },
  messageRowOther: { justifyContent: 'flex-start' },
  messageContent: { maxWidth: '82%' },
  messageBubble: {
    maxWidth: '100%',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 16,
  },
  messageBubbleOwn: { backgroundColor: '#000000', borderBottomRightRadius: 5 },
  messageBubbleOther: { backgroundColor: '#000000', borderBottomLeftRadius: 5 },
  messageMarker: { marginBottom: 4, color: '#88888F', fontSize: 10, fontWeight: '600' },
  replyQuote: {
    marginBottom: 6,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 5,
    backgroundColor: '#4A4A4A',
  },
  replyQuoteSender: { color: '#F5B800', fontSize: 10, fontWeight: '800' },
  replyQuoteBody: { marginTop: 2, color: '#D6D6D6', fontSize: 11 },
  messageSender: { marginBottom: 4, color: '#D6D6D6', fontSize: 10, fontWeight: '800' },
  messageBody: { color: '#FFFFFF', fontSize: 14, lineHeight: 20 },
  messageBodyOwn: { color: '#FFFFFF' },
  messageAttachment: { marginTop: 7 },
  voicePlayerContainer: { maxWidth: '100%' },
  voicePlayer: {
    width: 280,
    maxWidth: '100%',
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#000000',
  },
  voicePlayerButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: '#F5B800',
  },
  voicePlayerTimeline: { flex: 1, minWidth: 0, gap: 4 },
  voicePlayerWaveform: {
    height: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 2,
  },
  voicePlayerWaveformPressed: { opacity: 0.8 },
  voicePlayerWaveformBar: {
    minWidth: 2,
    maxWidth: 3,
    flex: 1,
    borderRadius: 2,
    backgroundColor: '#727272',
  },
  voicePlayerWaveformBarPlayed: { backgroundColor: '#F5B800' },
  voicePlayerTime: {
    color: '#FFFFFF',
    fontSize: 9,
    fontVariant: ['tabular-nums'],
  },
  voicePlayerSpeed: {
    minWidth: 30,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#292929',
  },
  voicePlayerSpeedText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  voicePlayerError: { marginTop: 3, color: '#FF8A8A', fontSize: 9 },
  messageAttachmentImage: { width: 200, height: 150, borderRadius: 8, backgroundColor: '#343434' },
  messageAttachmentDocumentPreview: {
    width: 200,
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#343434',
  },
  messageAttachmentName: { flex: 1, flexShrink: 1, color: '#FFFFFF', fontSize: 11 },
  attachmentCaption: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4 },
  messageMeta: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 },
  reactions: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 5 },
  reactionChip: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 12, backgroundColor: '#F1F1F2' },
  reactionText: { color: '#34343A', fontSize: 11 },
  messageTime: { color: '#D5D5D5', fontSize: 9 },
  messageTimeOwn: { color: '#D5D5D5' },
  messageReceipt: { color: '#D5D5D5', fontSize: 9 },
  messageReceiptRead: { color: '#76D7C4' },
  composer: {
    flexDirection: 'column',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: 'transparent',
  },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  composerInputWrap: { flex: 1, minHeight: 42, maxHeight: 120, justifyContent: 'center' },
  attachButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    backgroundColor: '#242424',
  },
  attachButtonText: { marginTop: -2, color: '#FFFFFF', fontSize: 29, lineHeight: 34 },
  voiceNoteButton: {
    position: 'absolute',
    right: 7,
    bottom: 5,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  recordingPanel: {
    gap: 6,
    padding: 4,
    borderRadius: 12,
    backgroundColor: '#3A3A3A',
  },
  recordingWaveRow: { minHeight: 20, flexDirection: 'row', alignItems: 'center' },
  recordingTime: {
    marginLeft: 8,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  recordingWaveform: {
    height: 28,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  recordingWaveformBar: {
    width: 2,
    borderRadius: 99,
    backgroundColor: '#F5B800',
  },
  recordingActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  recordingDiscardButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  recordingPauseButton: {
    minHeight: 42,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 10,
    borderRadius: 21,
    backgroundColor: '#000000',
  },
  recordingPauseText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  recordingSendButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    backgroundColor: '#F5B800',
  },
  stagedAttachments: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  stagedAttachment: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 9,
    paddingRight: 4,
    borderRadius: 15,
    backgroundColor: '#242424',
  },
  stagedAttachmentName: { maxWidth: 250, color: '#FFFFFF', fontSize: 10 },
  removeAttachmentButton: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  removeAttachmentText: { color: '#F5B800', fontSize: 18, lineHeight: 20 },
  composerContext: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#F2F4F3',
  },
  composerContextText: { flex: 1, marginRight: 8 },
  composerContextTitle: { color: '#287B6E', fontSize: 11, fontWeight: '800' },
  composerContextBody: { marginTop: 2, color: '#71717A', fontSize: 11 },
  composerInput: {
    flex: 1,
    maxHeight: 120,
    minHeight: 42,
    paddingHorizontal: 14,
    paddingRight: 42,
    paddingTop: 11,
    paddingBottom: 9,
    borderRadius: 18,
    backgroundColor: '#F4F4F5',
    color: '#222226',
    fontSize: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 6,
    elevation: 4,
  },
  sendButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    backgroundColor: '#F5B800',
  },
  sendButtonText: { marginTop: -2, color: '#242424', fontSize: 25, fontWeight: '700' },
  pressed: { opacity: 0.72 },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  actionsBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 18,
    backgroundColor: 'transparent',
  },
  createModal: {
    maxHeight: '90%',
    padding: 18,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  modalTitle: { color: '#222226', fontSize: 17, fontWeight: '800' },
  conversationTypeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  typeChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, backgroundColor: '#F1F1F3' },
  typeChipSelected: { backgroundColor: '#242424' },
  typeChipText: { color: '#52525B', fontSize: 12, fontWeight: '700' },
  typeChipTextSelected: { color: '#FFFFFF' },
  projectPicker: { maxHeight: 44, marginBottom: 10 },
  projectChip: { alignSelf: 'flex-start', marginRight: 7, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 18, backgroundColor: '#F1F1F3' },
  formLabel: { marginTop: 10, marginBottom: 6, color: '#52525B', fontSize: 11, fontWeight: '800' },
  nameInput: {
    minHeight: 42,
    marginBottom: 4,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    borderRadius: 8,
    color: '#222226',
  },
  memberPicker: { maxHeight: 250, marginTop: 2 },
  memberRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
    padding: 8,
    borderWidth: 1,
    borderColor: '#E8E8EB',
    borderRadius: 9,
  },
  memberRowSelected: { borderColor: '#287B6E', backgroundColor: '#F1F8F6' },
  memberDetails: { flex: 1 },
  memberName: { color: '#29292D', fontSize: 12, fontWeight: '700' },
  memberEmail: { marginTop: 3, color: '#77777F', fontSize: 10 },
  memberCheck: { width: 22, color: '#287B6E', fontSize: 18, textAlign: 'center' },
  createSubmit: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    borderRadius: 9,
    backgroundColor: '#287B6E',
  },
  createSubmitDisabled: { opacity: 0.4 },
  createSubmitText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  actionsModal: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 420,
    maxHeight: '90%',
    padding: 18,
    borderWidth: 1,
    borderColor: '#D4D4D8',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 8,
  },
  actionScroll: { flexGrow: 0 },
  actionItem: { minHeight: 42, justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E4E4E7' },
  actionText: { color: '#29292D', fontSize: 13, fontWeight: '600' },
  actionDanger: { color: '#B42318', fontSize: 13, fontWeight: '700' },
  attachmentAction: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E4E4E7' },
  attachmentActionName: { color: '#29292D', fontSize: 12, fontWeight: '600' },
  attachmentActionButtons: { flexDirection: 'row', gap: 8, marginTop: 7 },
  attachmentActionButton: {
    flex: 1,
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
    backgroundColor: '#F1F1F3',
  },
  attachmentActionButtonDisabled: { opacity: 0.5 },
  attachmentActionButtonText: { color: '#29292D', fontSize: 12, fontWeight: '700' },
  reactionChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  reactionChoice: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: '#F1F1F3' },
  reactionChoiceText: { fontSize: 20 },
});
