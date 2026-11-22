import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAvatarSource, getUserInitials, useDashboard } from '../../context/DashboardContext';
import {
  type TeammateRecord,
  useMessagesCall
} from '../../context/MessagesCallContext';
import type { NormalizedCallRecord } from '../../context/MessagesCallContext';
import type { ChatAttachment, ChatMessage, Conversation } from '../../types/dashboard';
import { createClassNames } from '../../utils/cx';
import { FileTypeIcon, formatFileSize } from '../../utils/fileIcons';
import callStyles from '../CallOverlay/CallOverlay.module.css';
import styles from './Messages.module.css';

const cx = createClassNames(styles);

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '🎉', '🙏', '🔥', '👏', '✅', '👀'];
const WAVEFORM_BAR_COUNT = 40;
const MAX_TOTAL_ATTACHMENT_BYTES = 200 * 1024 * 1024;
const VOICE_PLAYBACK_SPEEDS = [1, 1.5, 2] as const;

type TimelineEntry =
  | { kind: 'message'; id: string; timestampMs: number; message: ChatMessage }
  | { kind: 'call'; id: string; timestampMs: number; call: NormalizedCallRecord };

interface VoiceNotePlayerProps {
  src: string;
  durationSeconds?: number;
  waveformPeaks?: number[];
}

function formatClockSeconds(rawSeconds = 0): string {
  const safe = Math.max(0, Math.round(Number(rawSeconds) || 0));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function formatMessageTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatLastSeen(iso?: string | null): string {
  if (!iso) return 'Offline';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Offline';
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 60_000) return 'Last seen just now';
  if (diffMs < 3600_000) return `Last seen ${Math.max(1, Math.floor(diffMs / 60_000))}m ago`;
  if (diffMs < 86_400_000) {
    return `Last seen today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  return `Last seen ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
}

function normalizePeaks(peaks?: number[]): number[] {
  const out: number[] = [];
  if (Array.isArray(peaks) && peaks.length) {
    for (let i = 0; i < WAVEFORM_BAR_COUNT; i++) {
      const idx = Math.floor((i / WAVEFORM_BAR_COUNT) * peaks.length);
      const val = Number(peaks[idx]);
      out.push(Math.max(16, Math.min(100, Number.isFinite(val) ? val : 36)));
    }
    return out;
  }
  for (let i = 0; i < WAVEFORM_BAR_COUNT; i++) {
    out.push(24 + ((i * 19 + 11) % 62));
  }
  return out;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`Unable to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Unable to encode recorded audio'));
    reader.readAsDataURL(blob);
  });
}

const VoiceNotePlayer: React.FC<VoiceNotePlayerProps> = ({
  src,
  durationSeconds = 0,
  waveformPeaks
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const boostReadyRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(durationSeconds || 0);
  const [speedIdx, setSpeedIdx] = useState(0);

  const peaks = useMemo(() => normalizePeaks(waveformPeaks), [waveformPeaks]);
  const playbackRate = VOICE_PLAYBACK_SPEEDS[speedIdx];

  useEffect(() => {
    if (durationSeconds && durationSeconds > 0 && !totalDuration) {
      setTotalDuration(durationSeconds);
    }
  }, [durationSeconds, totalDuration]);

  useEffect(() => {
    return () => {
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
  }, []);

  const ensureBoostChain = useCallback(() => {
    if (boostReadyRef.current || !audioRef.current) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const source = ctx.createMediaElementSource(audioRef.current);
      const gain = ctx.createGain();
      gain.gain.value = 2;
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.ratio.value = 4;
      source.connect(gain);
      gain.connect(compressor);
      compressor.connect(ctx.destination);
      audioCtxRef.current = ctx;
      boostReadyRef.current = true;
    } catch {
      // Fall back to direct element playback
    }
  }, []);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      return;
    }
    ensureBoostChain();
    if (audioCtxRef.current?.state === 'suspended') {
      await audioCtxRef.current.resume().catch(() => {});
    }
    audio.playbackRate = playbackRate;
    await audio.play().catch(() => {});
  };

  const cycleSpeed = () => {
    const nextIdx = (speedIdx + 1) % VOICE_PLAYBACK_SPEEDS.length;
    setSpeedIdx(nextIdx);
    if (audioRef.current) {
      audioRef.current.playbackRate = VOICE_PLAYBACK_SPEEDS[nextIdx];
    }
  };

  const effectiveDuration = totalDuration || durationSeconds || 1;
  const progress = Math.min(1, Math.max(0, currentTime / Math.max(0.1, effectiveDuration)));
  const playedBars = Math.round(progress * peaks.length);

  const seekToRatio = (ratio: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const dur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : effectiveDuration;
    const target = Math.max(0, Math.min(dur, ratio * dur));
    audio.currentTime = target;
    setCurrentTime(target);
  };

  return (
    <div className={cx('messages-voice-note-player')}>
      <audio
        ref={audioRef}
        className={cx('messages-voice-note-audio')}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setTotalDuration(d);
        }}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
        }}
      />
      <button
        type="button"
        className={cx('messages-voice-play')}
        aria-label={isPlaying ? 'Pause voice note' : 'Play voice note'}
        onClick={togglePlay}
      >
        {isPlaying ? (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <polygon points="7 5 19 12 7 19 7 5" />
          </svg>
        )}
      </button>

      <div className={cx('messages-voice-note-visualizer')}>
        <div
          className={cx('messages-voice-waveform')}
          role="slider"
          tabIndex={0}
          aria-label="Voice note progress"
          aria-valuemin={0}
          aria-valuemax={Math.round(effectiveDuration)}
          aria-valuenow={Math.round(currentTime)}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            if (rect.width > 0) {
              seekToRatio((e.clientX - rect.left) / rect.width);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') {
              e.preventDefault();
              seekToRatio(progress + 0.1);
            } else if (e.key === 'ArrowLeft') {
              e.preventDefault();
              seekToRatio(progress - 0.1);
            }
          }}
        >
          {peaks.map((heightPct, idx) => (
            <span
              key={idx}
              className={cx('messages-waveform-bar', idx < playedBars && 'is-played')}
              style={{ '--bar-height': `${heightPct}%` } as React.CSSProperties}
            />
          ))}
        </div>
        <span className={cx('messages-voice-time')}>
          {formatClockSeconds(isPlaying || currentTime > 0 ? currentTime : totalDuration)}
        </span>
      </div>

      <button
        type="button"
        className={cx('messages-voice-speed')}
        aria-label={`Playback speed ${playbackRate}x`}
        onClick={cycleSpeed}
      >
        {playbackRate}x
      </button>
    </div>
  );
};

export const Messages: React.FC = () => {
  const {
    currentUser,
    firebaseUser,
    projects,
    pendingMessageContext,
    clearPendingMessageContext,
    setActiveModal,
    openTaskDetails,
    showDashboardToast,
    refreshAllDashboardData
  } = useDashboard();

  const {
    conversations,
    teammates,
    activeConversationId,
    activeConversation,
    messages,
    callHistory,
    hasOlderMessages,
    loadingConversations,
    loadingMessages,
    loadingOlderMessages,
    messagesError,
    presenceMap,
    selectConversation,
    loadOlderMessages,
    sendMessage,
    editMessage,
    toggleReaction,
    togglePinMessage,
    toggleDecisionMessage,
    deleteMessage,
    forwardMessage,
    createConversation,
    clearConversation,
    deleteConversation,
    summarizeConversation,
    startCall,
    joinOngoingCall
  } = useMessagesCall();

  const currentUid = firebaseUser?.uid || currentUser?.uid || '';

  // Composer & context state
  const [composerText, setComposerText] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [editingMsg, setEditingMsg] = useState<ChatMessage | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [composerEmojiOpen, setComposerEmojiOpen] = useState(false);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isPausedRecording, setIsPausedRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingWaveBars, setRecordingWaveBars] = useState<number[]>(() =>
    Array.from({ length: WAVEFORM_BAR_COUNT }, () => 18)
  );

  // Menus & highlight state
  const [openMessageMenuId, setOpenMessageMenuId] = useState<string | null>(null);
  const [openMessageEmojiId, setOpenMessageEmojiId] = useState<string | null>(null);
  const [threadActionsOpen, setThreadActionsOpen] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);

  // Modals state
  const [createModalType, setCreateModalType] = useState<'channel' | 'group' | 'direct' | null>(null);
  const [createName, setCreateName] = useState('');
  const [createProjectId, setCreateProjectId] = useState('');
  const [createSelectedUids, setCreateSelectedUids] = useState<string[]>([]);
  const [createMemberSearch, setCreateMemberSearch] = useState('');
  const [creatingConv, setCreatingConv] = useState(false);

  const [forwardMsg, setForwardMsg] = useState<ChatMessage | null>(null);
  const [forwardSearch, setForwardSearch] = useState('');
  const [forwardSelectedConvIds, setForwardSelectedConvIds] = useState<string[]>([]);
  const [forwarding, setForwarding] = useState(false);

  const [clearOrDeleteModal, setClearOrDeleteModal] = useState<'clear' | 'delete' | null>(null);
  const [briefingModal, setBriefingModal] = useState<{
    title: string;
    summary: string;
    loading: boolean;
    error: string;
  } | null>(null);
  const [viewerAttachment, setViewerAttachment] = useState<ChatAttachment | null>(null);

  // Refs
  const feedRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const prevThreadLenRef = useRef(0);
  const prevConvIdRef = useRef<string | null>(null);

  // Recording refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordedPeaksRef = useRef<number[]>([]);
  const recordingActionRef = useRef<'send' | 'cancel'>('cancel');
  const recordingTimerRef = useRef<number | null>(null);
  const recordingAnimRef = useRef<number | null>(null);
  const recordingAudioCtxRef = useRef<AudioContext | null>(null);
  const recordingAnalyserRef = useRef<AnalyserNode | null>(null);
  const recordingStartMsRef = useRef<number>(0);
  const recordingAccumMsRef = useRef<number>(0);
  const isPausedRecordingRef = useRef(false);
  isPausedRecordingRef.current = isPausedRecording;

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = () => {
      setOpenMessageMenuId(null);
      setOpenMessageEmojiId(null);
      setThreadActionsOpen(false);
      setComposerEmojiOpen(false);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Pending message context routing (e.g. jump to task chat message)
  useEffect(() => {
    if (!pendingMessageContext) return;
    const { conversationId, projectId, messageId } = pendingMessageContext;
    if (conversationId) {
      if (conversationId !== activeConversationId) {
        selectConversation(conversationId);
      }
    } else if (projectId) {
      const match = conversations.find((c) => c.projectId === projectId);
      if (match && match.id !== activeConversationId) {
        selectConversation(match.id);
      }
    }
    if (messageId) {
      setHighlightedMessageId(messageId);
      window.setTimeout(() => {
        const el = document.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 240);
      window.setTimeout(() => setHighlightedMessageId(null), 3200);
    }
    clearPendingMessageContext();
  }, [
    pendingMessageContext,
    conversations,
    activeConversationId,
    selectConversation,
    clearPendingMessageContext
  ]);

  // Auto-scroll to bottom when switching threads or receiving new messages
  useEffect(() => {
    const feed = feedRef.current;
    if (!feed) return;
    const convChanged = prevConvIdRef.current !== activeConversationId;
    const grew = messages.length > prevThreadLenRef.current;
    const nearBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 180;

    if (convChanged || (grew && (nearBottom || prevThreadLenRef.current === 0))) {
      requestAnimationFrame(() => {
        if (feedRef.current) {
          feedRef.current.scrollTop = feedRef.current.scrollHeight;
        }
      });
    }
    prevConvIdRef.current = activeConversationId;
    prevThreadLenRef.current = messages.length;
  }, [activeConversationId, messages.length]);

  // Cleanup recorder on unmount
  const stopRecordingHardware = useCallback(() => {
    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (recordingAnimRef.current) {
      cancelAnimationFrame(recordingAnimRef.current);
      recordingAnimRef.current = null;
    }
    if (recordingAudioCtxRef.current) {
      recordingAudioCtxRef.current.close().catch(() => {});
      recordingAudioCtxRef.current = null;
      recordingAnalyserRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          // ignore
        }
      });
      mediaStreamRef.current = null;
    }
    mediaRecorderRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      stopRecordingHardware();
    };
  }, [stopRecordingHardware]);

  // Derived conversation groupings
  const { channelConversations, directConversations, groupConversations } = useMemo(() => {
    const channels: Conversation[] = [];
    const directs: Conversation[] = [];
    const groups: Conversation[] = [];
    conversations.forEach((c) => {
      const t = (c.type || 'channel').toLowerCase();
      if (t === 'direct' || t === 'dm') directs.push(c);
      else if (t === 'group') groups.push(c);
      else channels.push(c);
    });
    return {
      channelConversations: channels,
      directConversations: directs,
      groupConversations: groups
    };
  }, [conversations]);

  // Map teammate UID -> direct conversation stats
  const dmByTeammateUid = useMemo(() => {
    const map = new Map<string, Conversation>();
    directConversations.forEach((c) => {
      const peer = (c.participants || []).find((p) => p.firebaseUid !== currentUid);
      if (peer?.firebaseUid) {
        map.set(peer.firebaseUid, c);
      }
    });
    return map;
  }, [directConversations, currentUid]);

  // Resolve display name and DM peer status for a conversation
  const getConversationDisplay = useCallback(
    (conv: Conversation) => {
      const t = (conv.type || 'channel').toLowerCase();
      if (t === 'direct' || t === 'dm') {
        const peer = (conv.participants || []).find((p) => p.firebaseUid !== currentUid);
        const peerUid = peer?.firebaseUid || '';
        const presence = peerUid ? presenceMap[peerUid] : undefined;
        const isOnline = presence !== undefined ? presence.isOnline : Boolean(peer?.isOnline);
        const lastSeenAt = presence?.lastSeenAt ?? peer?.lastSeenAt ?? null;
        return {
          displayName: peer?.name || conv.name || 'Direct Message',
          isDirect: true,
          peerUid,
          isOnline,
          lastSeenAt,
          subtitle: isOnline ? 'Online' : formatLastSeen(lastSeenAt)
        };
      }
      const count = conv.participants?.length || 0;
      return {
        displayName: conv.name || conv.title || (t === 'group' ? 'Group Chat' : 'Channel'),
        isDirect: false,
        peerUid: '',
        isOnline: false,
        lastSeenAt: null,
        subtitle:
          t === 'group'
            ? `${count} member${count === 1 ? '' : 's'} · Group conversation`
            : `${count} member${count === 1 ? '' : 's'} · Project channel`
      };
    },
    [currentUid, presenceMap]
  );

  // Merge chronological timeline of messages + call logs
  const timeline = useMemo<TimelineEntry[]>(() => {
    const msgEntries: TimelineEntry[] = messages.map((msg) => ({
      kind: 'message',
      id: `msg_${msg.id}`,
      timestampMs: new Date(msg.createdAt || 0).getTime() || 0,
      message: msg
    }));
    const callEntries: TimelineEntry[] = callHistory.map((call) => ({
      kind: 'call',
      id: `call_${call.callId}`,
      timestampMs: new Date(call.startedAt || 0).getTime() || 0,
      call
    }));
    return [...msgEntries, ...callEntries].sort((a, b) => a.timestampMs - b.timestampMs);
  }, [messages, callHistory]);

  const activeConvDisplay = activeConversation ? getConversationDisplay(activeConversation) : null;

  // Handle infinite scroll up for older messages
  const handleFeedScroll = () => {
    const feed = feedRef.current;
    if (!feed || loadingOlderMessages || !hasOlderMessages) return;
    if (feed.scrollTop < 80) {
      const prevHeight = feed.scrollHeight;
      loadOlderMessages().then(() => {
        requestAnimationFrame(() => {
          if (feedRef.current) {
            feedRef.current.scrollTop = feedRef.current.scrollHeight - prevHeight;
          }
        });
      });
    }
  };

  // Start or open a DM with a teammate
  const handleStartDirectMessage = async (mate: TeammateRecord) => {
    const existing = dmByTeammateUid.get(mate.firebaseUid);
    if (existing) {
      selectConversation(existing.id);
      return;
    }
    await createConversation({
      type: 'direct',
      memberFirebaseUids: [mate.firebaseUid]
    });
  };

  // Attachments handler
  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || !fileList.length) return;
    const files = Array.from(fileList);
    const currentTotal = pendingAttachments.reduce((sum, a) => sum + (Number(a.size) || 0), 0);
    const addedTotal = files.reduce((sum, f) => sum + f.size, 0);
    if (currentTotal + addedTotal > MAX_TOTAL_ATTACHMENT_BYTES) {
      showDashboardToast('Attachments exceed the 200 MB limit per message.', 'error');
      return;
    }
    try {
      const encoded = await Promise.all(
        files.map(async (file) => {
          const dataUrl = await readFileAsDataUrl(file);
          return {
            name: file.name,
            fileName: file.name,
            mimeType: file.type || 'application/octet-stream',
            mediaType: file.type || 'application/octet-stream',
            size: file.size,
            data: dataUrl,
            dataUrl
          } as ChatAttachment;
        })
      );
      setPendingAttachments((prev) => [...prev, ...encoded]);
    } catch (err: any) {
      showDashboardToast(err?.message || 'Unable to attach file.', 'error');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Composer submit (send new or save edit)
  const handleComposerSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!activeConversationId || isSending) return;
    const trimmed = composerText.trim();

    if (editingMsg) {
      if (!trimmed) return;
      setIsSending(true);
      try {
        await editMessage(editingMsg.id, trimmed);
        setEditingMsg(null);
        setComposerText('');
      } finally {
        setIsSending(false);
      }
      return;
    }

    if (!trimmed && !pendingAttachments.length) return;
    setIsSending(true);
    const attachmentsToSend = pendingAttachments.map((att) => ({
      ...att,
      fileName: att.fileName || att.name,
      mediaType: att.mimeType || 'application/octet-stream',
      data: att.dataUrl || (att.data as string)
    }));
    const replyId = replyingTo?.id || null;

    setComposerText('');
    setPendingAttachments([]);
    setReplyingTo(null);

    try {
      await sendMessage({
        body: trimmed,
        attachments: attachmentsToSend,
        replyToId: replyId
      });
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  };

  // Voice recording pipeline
  const startVoiceRecording = async () => {
    if (!activeConversationId || isRecording) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      showDashboardToast('Voice recording is not supported in this browser.', 'error');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const mimeCandidates = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/mp4', ''];
      const chosenMime = mimeCandidates.find((m) => !m || MediaRecorder.isTypeSupported(m)) || '';
      const recorder = chosenMime
        ? new MediaRecorder(stream, { mimeType: chosenMime })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;
      recordedChunksRef.current = [];
      recordedPeaksRef.current = [];
      recordingActionRef.current = 'cancel';
      recordingAccumMsRef.current = 0;
      recordingStartMsRef.current = Date.now();
      setRecordingSeconds(0);
      setIsPausedRecording(false);
      setIsRecording(true);

      // WebAudio analyser for waveform bars
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);
          recordingAudioCtxRef.current = ctx;
          recordingAnalyserRef.current = analyser;
          const bins = new Uint8Array(analyser.frequencyBinCount);

          const pump = () => {
            if (!recordingAnalyserRef.current) return;
            if (!isPausedRecordingRef.current) {
              recordingAnalyserRef.current.getByteFrequencyData(bins);
              const avg =
                bins.reduce((sum, v) => sum + v, 0) / Math.max(1, bins.length);
              const level = Math.max(12, Math.min(100, Math.round((avg / 140) * 100)));
              recordedPeaksRef.current.push(level);
              if (recordedPeaksRef.current.length > 2400) {
                recordedPeaksRef.current.shift();
              }
              setRecordingWaveBars((prev) => [...prev.slice(1), level]);
            }
            recordingAnimRef.current = requestAnimationFrame(pump);
          };
          recordingAnimRef.current = requestAnimationFrame(pump);
        }
      } catch {
        // Live visualizer is optional
      }

      recordingTimerRef.current = window.setInterval(() => {
        if (!isPausedRecordingRef.current) {
          const elapsed = recordingAccumMsRef.current + (Date.now() - recordingStartMsRef.current);
          setRecordingSeconds(Math.floor(elapsed / 1000));
        }
      }, 250);

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          recordedChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        const action = recordingActionRef.current;
        const mimeType = recorder.mimeType || chosenMime || 'audio/webm';
        const finalDuration = Math.max(
          1,
          Math.round(
            (recordingAccumMsRef.current +
              (isPausedRecordingRef.current ? 0 : Date.now() - recordingStartMsRef.current)) /
              1000
          )
        );
        const chunks = recordedChunksRef.current.slice();
        const rawPeaks = recordedPeaksRef.current.slice();

        stopRecordingHardware();
        setIsRecording(false);
        setIsPausedRecording(false);

        if (action !== 'send' || !chunks.length) return;
        try {
          const blob = new Blob(chunks, { type: mimeType });
          const dataUrl = await blobToDataUrl(blob);
          const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'm4a' : 'webm';
          const fileName = `voice-note-${Date.now()}.${ext}`;
          const peaks = normalizePeaks(rawPeaks);
          await sendMessage({
            body: '',
            attachments: [
              {
                name: fileName,
                fileName,
                mimeType,
                mediaType: mimeType,
                size: blob.size,
                data: dataUrl,
                dataUrl,
                isVoiceNote: true,
                is_voice_note: true,
                durationSeconds: finalDuration,
                duration_seconds: finalDuration,
                waveformPeaks: peaks,
                waveform_peaks: peaks
              } as ChatAttachment
            ],
            replyToId: replyingTo?.id || null
          });
          setReplyingTo(null);
        } catch (err: any) {
          showDashboardToast(err?.message || 'Unable to send voice note.', 'error');
        }
      };

      recorder.start(200);
    } catch (err: any) {
      stopRecordingHardware();
      setIsRecording(false);
      showDashboardToast(err?.message || 'Microphone permission is required for voice notes.', 'error');
    }
  };

  const togglePauseRecording = () => {
    const rec = mediaRecorderRef.current;
    if (!rec) return;
    if (!isPausedRecording && rec.state === 'recording') {
      rec.pause();
      recordingAccumMsRef.current += Date.now() - recordingStartMsRef.current;
      setIsPausedRecording(true);
    } else if (isPausedRecording && rec.state === 'paused') {
      rec.resume();
      recordingStartMsRef.current = Date.now();
      setIsPausedRecording(false);
    }
  };

  const finishVoiceRecording = (action: 'send' | 'cancel') => {
    recordingActionRef.current = action;
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.stop();
    } else {
      stopRecordingHardware();
      setIsRecording(false);
      setIsPausedRecording(false);
    }
  };

  // Catch Me Up AI Briefing
  const handleCatchMeUp = async () => {
    if (!activeConversationId) return;
    setBriefingModal({
      title: `AI Briefing — ${activeConvDisplay?.displayName || 'Channel'}`,
      summary: '',
      loading: true,
      error: ''
    });
    try {
      const summary = await summarizeConversation(activeConversationId);
      setBriefingModal({
        title: `AI Briefing — ${activeConvDisplay?.displayName || 'Channel'}`,
        summary,
        loading: false,
        error: ''
      });
    } catch (err: any) {
      setBriefingModal({
        title: `AI Briefing — ${activeConvDisplay?.displayName || 'Channel'}`,
        summary: '',
        loading: false,
        error: err?.message || 'Unable to generate chat briefing.'
      });
    }
  };

  // Convert message to task
  const handleConvertMessageToTask = (msg: ChatMessage) => {
    const projectId =
      activeConversation?.projectId || msg.linkedProjectId || projects[0]?.projectId || '';
    const cleanedBody = (msg.body || '').trim();
    const firstLine = cleanedBody.split('\n')[0]?.slice(0, 90) || 'Follow-up task from chat';
    setActiveModal({
      type: 'createTask',
      projectId,
      prefill: {
        title: firstLine,
        description: cleanedBody
      }
    });
  };

  // Create Channel / Group / Direct modal submit
  const handleCreateConversationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createModalType || creatingConv) return;
    if (createModalType === 'direct' && !createSelectedUids.length) {
      showDashboardToast('Select a teammate to message.', 'error');
      return;
    }
    if (createModalType === 'group' && createSelectedUids.length < 1) {
      showDashboardToast('Select at least one member for the group.', 'error');
      return;
    }
    if ((createModalType === 'channel' || createModalType === 'group') && !createName.trim()) {
      showDashboardToast('Please enter a name.', 'error');
      return;
    }

    setCreatingConv(true);
    try {
      const created = await createConversation({
        type: createModalType,
        name: createName.trim() || undefined,
        projectId: createModalType === 'channel' && createProjectId ? createProjectId : undefined,
        memberFirebaseUids: createSelectedUids
      });
      if (created) {
        setCreateModalType(null);
        setCreateName('');
        setCreateProjectId('');
        setCreateSelectedUids([]);
        setCreateMemberSearch('');
      }
    } finally {
      setCreatingConv(false);
    }
  };

  // Forward modal submit
  const handleForwardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forwardMsg || !forwardSelectedConvIds.length || forwarding) return;
    setForwarding(true);
    try {
      await Promise.all(
        forwardSelectedConvIds.map((targetId) => forwardMessage(forwardMsg, targetId))
      );
      setForwardMsg(null);
      setForwardSelectedConvIds([]);
      setForwardSearch('');
    } finally {
      setForwarding(false);
    }
  };

  // Refresh linked tasks when returning or opening task
  const handleOpenLinkedTask = async (msg: ChatMessage) => {
    if (!msg.linkedTaskId) return;
    await refreshAllDashboardData().catch(() => {});
    openTaskDetails(msg.linkedTaskId);
  };

  // Filtered teammates for Create modal
  const filteredCreateTeammates = useMemo(() => {
    const q = createMemberSearch.trim().toLowerCase();
    return teammates.filter(
      (t) =>
        !q ||
        t.name.toLowerCase().includes(q) ||
        t.email.toLowerCase().includes(q)
    );
  }, [teammates, createMemberSearch]);

  // Filtered conversations for Forward modal
  const forwardCandidates = useMemo(() => {
    const q = forwardSearch.trim().toLowerCase();
    return conversations.filter((c) => {
      if (c.id === forwardMsg?.conversationId) return false;
      const disp = getConversationDisplay(c);
      return !q || disp.displayName.toLowerCase().includes(q);
    });
  }, [conversations, forwardMsg, forwardSearch, getConversationDisplay]);

  const avatarTones = ['purple', 'blue', 'orange', 'pink'] as const;

  const renderConversationButton = (conv: Conversation) => {
    const isActive = conv.id === activeConversationId;
    const unread = Number(conv.unreadCount) || 0;
    const { displayName, isDirect, isOnline } = getConversationDisplay(conv);
    return (
      <button
        key={conv.id}
        type="button"
        className={cx('messages-conversation', isActive && 'active', unread > 0 && 'has-unread')}
        onClick={() => selectConversation(conv.id)}
      >
        <div className={cx('messages-conversation-title-row')}>
          <span className={cx('messages-conversation-name')}>
            {isDirect && isOnline ? '● ' : conv.type === 'channel' ? '# ' : ''}
            {displayName}
          </span>
          {unread > 0 && <span className={cx('messages-unread-count')}>{unread}</span>}
        </div>
        <span className={cx('messages-conversation-preview')}>
          {conv.lastMessageText || 'No messages yet'}
        </span>
      </button>
    );
  };

  return (
    <section
      id="messages-container"
      className={`${cx('messages-page')} messages-page`}
      aria-label="Team Messages"
    >
      {/* Left Sidebar: Channels, DMs, Groups, Teammates */}
      <aside className={cx('messages-sidebar')}>
        <div className={cx('messages-sidebar-header')}>
          <div>
            <h2>Messages</h2>
            <p>Channels, groups &amp; direct chats</p>
          </div>
          <button
            id="messages-new-channel"
            type="button"
            className={cx('messages-new-button')}
            title="New channel"
            aria-label="New channel"
            onClick={() => {
              setCreateName('');
              setCreateProjectId(projects[0]?.projectId || '');
              setCreateSelectedUids([]);
              setCreateMemberSearch('');
              setCreateModalType('channel');
            }}
          >
            +
          </button>
        </div>

        <div className={cx('messages-sidebar-actions')}>
          <button
            id="messages-new-direct"
            type="button"
            className={cx('messages-direct-button')}
            onClick={() => {
              setCreateName('');
              setCreateSelectedUids([]);
              setCreateMemberSearch('');
              setCreateModalType('direct');
            }}
          >
            Direct Message
          </button>
          <button
            id="messages-new-group"
            type="button"
            className={cx('messages-direct-button')}
            onClick={() => {
              setCreateName('');
              setCreateSelectedUids([]);
              setCreateMemberSearch('');
              setCreateModalType('group');
            }}
          >
            New Group
          </button>
        </div>

        <div id="messages-conversation-list" className={cx('messages-conversation-list')}>
          {loadingConversations && !conversations.length ? (
            <p className={cx('messages-list-empty')}>Loading conversations...</p>
          ) : !conversations.length ? (
            <p className={cx('messages-list-empty')}>
              No conversations yet. Start a channel or direct message.
            </p>
          ) : (
            <>
              {channelConversations.length > 0 && (
                <>
                  <div className={cx('messages-list-heading')}>Channels</div>
                  {channelConversations.map(renderConversationButton)}
                </>
              )}
              {directConversations.length > 0 && (
                <>
                  <div className={cx('messages-list-heading')}>Direct Messages</div>
                  {directConversations.map(renderConversationButton)}
                </>
              )}
              {groupConversations.length > 0 && (
                <>
                  <div className={cx('messages-list-heading')}>Groups</div>
                  {groupConversations.map(renderConversationButton)}
                </>
              )}
            </>
          )}
        </div>

        <div className={cx('messages-people-section')}>
          <div className={cx('messages-list-heading')}>Teammates</div>
          <div id="messages-people-list" className={cx('messages-people-list')}>
            <button type="button" className={cx('messages-person', 'messages-person-self')} disabled>
              <span className={cx('messages-person-avatar')}>
                {getAvatarSource(currentUser) ? (
                  <img
                    src={getAvatarSource(currentUser)}
                    alt={currentUser.name}
                    style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                  />
                ) : (
                  getUserInitials(currentUser.name)
                )}
              </span>
              <span className={cx('messages-person-details')}>
                <strong>{currentUser.name} (You)</strong>
                <small>Online</small>
              </span>
            </button>

            {teammates.map((mate) => {
              const existingDm = dmByTeammateUid.get(mate.firebaseUid);
              const unread = Number(existingDm?.unreadCount) || 0;
              return (
                <button
                  key={mate.firebaseUid}
                  type="button"
                  className={cx('messages-person')}
                  onClick={() => handleStartDirectMessage(mate)}
                >
                  <span className={cx('messages-person-avatar')}>
                    {mate.profileImage ? (
                      <img
                        src={mate.profileImage}
                        alt={mate.name}
                        style={{
                          width: '100%',
                          height: '100%',
                          borderRadius: '50%',
                          objectFit: 'cover'
                        }}
                      />
                    ) : (
                      mate.initials
                    )}
                  </span>
                  <span className={cx('messages-person-details')}>
                    <strong>{mate.name}</strong>
                    <small>{mate.isOnline ? 'Online' : formatLastSeen(mate.lastSeenAt)}</small>
                  </span>
                  {unread > 0 && (
                    <span className={cx('messages-person-message-count')}>{unread}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      {/* Main Conversation Thread */}
      <div className={cx('messages-thread')}>
        <header id="messages-thread-header" className={cx('messages-thread-header')}>
          {activeConversation && activeConvDisplay ? (
            <>
              <div>
                <h2>{activeConvDisplay.displayName}</h2>
                {activeConvDisplay.isDirect ? (
                  <p
                    className={cx(
                      'messages-presence',
                      activeConvDisplay.isOnline
                        ? 'messages-presence-online'
                        : 'messages-presence-offline'
                    )}
                  >
                    {activeConvDisplay.isOnline && <span className={cx('messages-presence-dot')} />}
                    <span>{activeConvDisplay.subtitle}</span>
                  </p>
                ) : (
                  <p>{activeConvDisplay.subtitle}</p>
                )}
              </div>

              <div className={cx('messages-thread-actions')}>
                <button
                  type="button"
                  className={callStyles['collab-call-launch']}
                  title="Start voice call"
                  aria-label="Start voice call"
                  onClick={() => startCall('audio', activeConversation)}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                </button>

                <button
                  type="button"
                  className={callStyles['collab-call-launch']}
                  title="Start video call"
                  aria-label="Start video call"
                  onClick={() => startCall('video', activeConversation)}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <polygon points="23 7 16 12 23 17 23 7" />
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                  </svg>
                </button>

                {!activeConvDisplay.isDirect && (
                  <button
                    type="button"
                    className={cx('catch-up-ai-btn')}
                    disabled={Boolean(briefingModal?.loading)}
                    onClick={handleCatchMeUp}
                  >
                    ⚡ Catch Me Up
                  </button>
                )}

                <div
                  className={cx('message-actions', threadActionsOpen && 'open')}
                  style={{ position: 'relative', right: 'auto', left: 'auto', visibility: 'visible', opacity: 1 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    className={cx('message-actions-trigger')}
                    aria-label="Conversation options"
                    aria-expanded={threadActionsOpen}
                    onClick={() => setThreadActionsOpen((prev) => !prev)}
                  >
                    ⋮
                  </button>
                  <div
                    className={cx('message-actions-menu', 'messages-thread-actions-menu')}
                    hidden={!threadActionsOpen}
                  >
                    <button
                      type="button"
                      className={cx('message-action-option')}
                      onClick={() => {
                        setThreadActionsOpen(false);
                        setClearOrDeleteModal('clear');
                      }}
                    >
                      Clear all messages
                    </button>
                    <button
                      type="button"
                      className={cx('message-action-option', 'destructive')}
                      onClick={() => {
                        setThreadActionsOpen(false);
                        setClearOrDeleteModal('delete');
                      }}
                    >
                      Delete chat for me
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div>
              <h2>Select a conversation</h2>
              <p>Choose a teammate or channel to begin messaging.</p>
            </div>
          )}
        </header>

        <div id="messages-error" className={cx('messages-error')} hidden={!messagesError}>
          {messagesError}
        </div>

        <div
          id="messages-feed"
          ref={feedRef}
          className={cx('messages-feed')}
          onScroll={handleFeedScroll}
        >
          {!activeConversation ? (
            <div className={cx('messages-placeholder')}>
              Select a channel, group, or direct conversation from the left panel.
            </div>
          ) : loadingMessages ? (
            <div className={cx('messages-placeholder')}>Loading conversation...</div>
          ) : !timeline.length ? (
            <div className={cx('messages-placeholder')}>
              No messages yet. Say hello to start the conversation.
            </div>
          ) : (
            <>
              {loadingOlderMessages && (
                <div className={cx('messages-placeholder')} style={{ margin: '4px auto' }}>
                  Loading earlier messages...
                </div>
              )}

              {timeline.map((entry) => {
                if (entry.kind === 'call') {
                  const call = entry.call;
                  const missed = Boolean(call.isMissed);
                  const ongoing = call.status === 'active' || call.status === 'ringing';
                  const typeLabel = call.callType === 'video' ? 'Video call' : 'Voice call';
                  const durationLabel = call.durationSeconds
                    ? ` · ${formatClockSeconds(call.durationSeconds)}`
                    : '';
                  return (
                    <div key={entry.id} className={cx('call-log-row')}>
                      <div className={cx('call-log-card', missed && 'is-missed')}>
                        <span className={cx('call-log-icon')} aria-hidden="true">
                          {call.callType === 'video' ? '📹' : '📞'}
                        </span>
                        <div className={cx('call-log-copy')}>
                          <strong className={cx('call-log-label')}>
                            {missed
                              ? `Missed ${typeLabel.toLowerCase()}`
                              : ongoing
                                ? `Ongoing ${typeLabel.toLowerCase()}`
                                : `${typeLabel}${durationLabel}`}
                          </strong>
                          <span className={cx('call-log-participant')}>
                            Started by {call.initiatorName || 'Teammate'}
                          </span>
                          <span className={cx('call-log-time')}>
                            {formatMessageTime(call.startedAt)}
                          </span>
                        </div>
                        {ongoing && (
                          <button
                            type="button"
                            className="primary-button"
                            style={{ minHeight: '32px', padding: '6px 12px', fontSize: '11px' }}
                            onClick={() => joinOngoingCall(call)}
                          >
                            Join
                          </button>
                        )}
                      </div>
                    </div>
                  );
                }

                const msg = entry.message;
                const isOwn =
                  Boolean(currentUid) &&
                  (msg.senderFirebaseUid === currentUid || msg.senderId === currentUid);
                const isDeleted = Boolean(msg.deletedForEveryone);
                const reactionEntries = Object.entries(msg.reactions || {}).filter(
                  ([, uids]) => uids.length > 0
                );
                const isReadByOther =
                  isOwn &&
                  Array.isArray(msg.readBy) &&
                  msg.readBy.some((u) => u && u !== currentUid);

                return (
                  <div
                    key={entry.id}
                    data-message-id={msg.id}
                    className={cx(
                      'message-row',
                      isOwn ? ['own', 'message-row-sent'] : 'message-row-received',
                      highlightedMessageId === msg.id && 'is-context-target'
                    )}
                  >
                    <div
                      className={cx(
                        'message-content',
                        isOwn ? 'message-content-sent' : 'message-content-received'
                      )}
                    >
                      <div
                        className={cx(
                          'message-bubble',
                          isOwn && 'message-bubble-sent'
                        )}
                      >
                        {!isOwn && (
                          <div className={cx('message-meta')}>
                            {msg.senderName || 'Teammate'}
                          </div>
                        )}

                        {msg.isPinned && (
                          <div className={cx('message-pinned-label')}>📌 Pinned</div>
                        )}
                        {msg.forwardedFrom && (
                          <div className={cx('message-forwarded-label')}>
                            ↪ Forwarded from {msg.forwardedFrom.senderName || 'Teammate'}
                          </div>
                        )}
                        {msg.isDecision && (
                          <div className={cx('message-decision-label')}>✓ Decision</div>
                        )}
                        {msg.linkedTaskId && (
                          <button
                            type="button"
                            className={cx('message-linked-task-badge')}
                            onClick={() => handleOpenLinkedTask(msg)}
                          >
                            🗂 {msg.linkedTaskTitle || 'View Linked Task'}
                          </button>
                        )}

                        {msg.replyTo && !isDeleted && (
                          <div className={cx('message-reply-quote')}>
                            <strong>{msg.replyTo.senderName || 'Teammate'}</strong>
                            <span>{msg.replyTo.body || 'Attachment'}</span>
                          </div>
                        )}

                        {isDeleted ? (
                          <p className={cx('message-text', 'deleted')}>
                            This message was deleted.
                          </p>
                        ) : (
                          <>
                            {msg.body && (
                              <p
                                className={cx(
                                  'message-text',
                                  isOwn && 'message-text-sent'
                                )}
                              >
                                {msg.body}
                              </p>
                            )}

                            {(msg.attachments || []).map((att, idx) => {
                              const fileName = att.fileName || att.name || 'Attachment';
                              const mime = att.mimeType || att.type || '';
                              const src = att.dataUrl || att.data_url || att.url || '';
                              const isAudio =
                                Boolean(att.isVoiceNote) || mime.startsWith('audio/');
                              const isImage =
                                !isAudio &&
                                (mime.startsWith('image/') ||
                                  /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(fileName));

                              if (isAudio && src) {
                                return (
                                  <VoiceNotePlayer
                                    key={`${msg.id}_att_${idx}`}
                                    src={src}
                                    durationSeconds={att.durationSeconds}
                                    waveformPeaks={att.waveformPeaks}
                                  />
                                );
                              }

                              if (isImage && src) {
                                return (
                                  <button
                                    key={`${msg.id}_att_${idx}`}
                                    type="button"
                                    className={cx('message-attachment-preview', 'image')}
                                    onClick={() => setViewerAttachment(att)}
                                  >
                                    <img src={src} alt={fileName} />
                                  </button>
                                );
                              }

                              return (
                                <button
                                  key={`${msg.id}_att_${idx}`}
                                  type="button"
                                  className={cx(
                                    'message-attachment',
                                    'message-attachment-file'
                                  )}
                                  onClick={() => setViewerAttachment(att)}
                                >
                                  <span className={cx('message-file-icon')}>
                                    <FileTypeIcon fileName={fileName} mimeType={mime} size={28} />
                                  </span>
                                  <span className={cx('message-attachment-preview-details')}>
                                    <strong>{fileName}</strong>
                                    <small>{formatFileSize(att.size)}</small>
                                  </span>
                                </button>
                              );
                            })}
                          </>
                        )}

                        <div className={cx('message-time-row')}>
                          {msg.editedAt && !isDeleted && (
                            <span className={cx('message-edited-label')}>edited</span>
                          )}
                          <span className={cx('message-time')}>
                            {formatMessageTime(msg.createdAt)}
                          </span>
                          {isOwn && !isDeleted && (
                            <span
                              className={cx('message-status', isReadByOther && 'read')}
                              title={isReadByOther ? 'Read' : msg.optimistic ? 'Sending' : 'Sent'}
                            >
                              {msg.failed ? '!' : isReadByOther ? '✓✓' : '✓'}
                            </span>
                          )}
                        </div>

                        {/* Hover Actions Menu */}
                        {!isDeleted && (
                          <>
                            <div
                              className={cx('message-add-reaction-wrap')}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                className={cx('message-add-reaction')}
                                aria-label="Add reaction"
                                onClick={() => {
                                  setOpenMessageMenuId(null);
                                  setOpenMessageEmojiId((prev) =>
                                    prev === msg.id ? null : msg.id
                                  );
                                }}
                              >
                                ☺
                              </button>
                              <div
                                className={cx('messages-emoji-menu')}
                                hidden={openMessageEmojiId !== msg.id}
                              >
                                {QUICK_EMOJIS.map((emoji) => (
                                  <button
                                    key={emoji}
                                    type="button"
                                    className={cx('messages-emoji-choice')}
                                    onClick={() => {
                                      setOpenMessageEmojiId(null);
                                      toggleReaction(msg.id, emoji);
                                    }}
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div
                              className={cx(
                                'message-actions',
                                openMessageMenuId === msg.id && 'open'
                              )}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                className={cx('message-actions-trigger')}
                                aria-label="Message options"
                                aria-expanded={openMessageMenuId === msg.id}
                                onClick={() => {
                                  setOpenMessageEmojiId(null);
                                  setOpenMessageMenuId((prev) =>
                                    prev === msg.id ? null : msg.id
                                  );
                                }}
                              >
                                ⋮
                              </button>
                              <div
                                className={cx('message-actions-menu')}
                                hidden={openMessageMenuId !== msg.id}
                              >
                                <button
                                  type="button"
                                  className={cx('message-action-option')}
                                  onClick={() => {
                                    setOpenMessageMenuId(null);
                                    setEditingMsg(null);
                                    setReplyingTo(msg);
                                    inputRef.current?.focus();
                                  }}
                                >
                                  Reply
                                </button>
                                {isOwn && (
                                  <button
                                    type="button"
                                    className={cx('message-action-option')}
                                    onClick={() => {
                                      setOpenMessageMenuId(null);
                                      setReplyingTo(null);
                                      setEditingMsg(msg);
                                      setComposerText(msg.body || '');
                                      inputRef.current?.focus();
                                    }}
                                  >
                                    Edit message
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className={cx('message-action-option')}
                                  onClick={() => {
                                    setOpenMessageMenuId(null);
                                    if (msg.linkedTaskId) {
                                      handleOpenLinkedTask(msg);
                                    } else {
                                      handleConvertMessageToTask(msg);
                                    }
                                  }}
                                >
                                  {msg.linkedTaskId ? 'Open linked task' : 'Convert to task'}
                                </button>
                                <button
                                  type="button"
                                  className={cx('message-action-option')}
                                  onClick={() => {
                                    setOpenMessageMenuId(null);
                                    toggleDecisionMessage(msg.id, !msg.isDecision);
                                  }}
                                >
                                  {msg.isDecision ? 'Unmark decision' : 'Mark as decision'}
                                </button>
                                <button
                                  type="button"
                                  className={cx('message-action-option')}
                                  onClick={() => {
                                    setOpenMessageMenuId(null);
                                    togglePinMessage(msg.id, !msg.isPinned);
                                  }}
                                >
                                  {msg.isPinned ? 'Unpin message' : 'Pin message'}
                                </button>
                                <button
                                  type="button"
                                  className={cx('message-action-option')}
                                  onClick={() => {
                                    setOpenMessageMenuId(null);
                                    setForwardMsg(msg);
                                    setForwardSelectedConvIds([]);
                                    setForwardSearch('');
                                  }}
                                >
                                  Forward
                                </button>
                                <button
                                  type="button"
                                  className={cx('message-action-option', 'destructive')}
                                  onClick={() => {
                                    setOpenMessageMenuId(null);
                                    deleteMessage(msg.id, 'me');
                                  }}
                                >
                                  Delete for me
                                </button>
                                {isOwn && (
                                  <button
                                    type="button"
                                    className={cx('message-action-option', 'destructive')}
                                    onClick={() => {
                                      setOpenMessageMenuId(null);
                                      deleteMessage(msg.id, 'everyone');
                                    }}
                                  >
                                    Delete for everyone
                                  </button>
                                )}
                              </div>
                            </div>
                          </>
                        )}
                      </div>

                      {reactionEntries.length > 0 && (
                        <div className={cx('message-reactions')}>
                          {reactionEntries.map(([emoji, uids]) => {
                            const reacted = Boolean(currentUid) && uids.includes(currentUid);
                            return (
                              <button
                                key={emoji}
                                type="button"
                                className={cx('message-reaction', reacted && 'active')}
                                onClick={() => toggleReaction(msg.id, emoji)}
                              >
                                <span>{emoji}</span>
                                <span>{uids.length}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Composer */}
        <form
          id="messages-composer"
          className={cx('messages-composer', isRecording && 'is-recording')}
          onSubmit={handleComposerSubmit}
        >
          {/* Voice Recording Active Panel */}
          <div
            id="messages-recording-panel"
            className={cx('messages-recording-panel', isPausedRecording && 'is-paused')}
            hidden={!isRecording}
          >
            <div className={cx('messages-recording-heading')}>
              <span className={cx('messages-recording-indicator')} />
              <span>{isPausedRecording ? 'Recording paused' : 'Recording voice note'}</span>
              <span
                id="messages-voice-recording-status"
                className={cx('messages-voice-recording-status')}
              >
                {formatClockSeconds(recordingSeconds)}
              </span>
            </div>

            <div id="messages-recording-waveform" className={cx('messages-recording-waveform')}>
              {recordingWaveBars.map((barPct, idx) => (
                <span
                  key={idx}
                  className={cx('messages-waveform-bar')}
                  style={{ '--bar-height': `${barPct}%` } as React.CSSProperties}
                />
              ))}
            </div>

            <div className={cx('messages-recording-actions')}>
              <button
                id="messages-voice-cancel"
                type="button"
                className={cx('messages-recording-discard')}
                aria-label="Discard voice note"
                title="Discard voice note"
                onClick={() => finishVoiceRecording('cancel')}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                </svg>
              </button>

              <button
                id="messages-voice-pause"
                type="button"
                className={cx('messages-recording-pause')}
                onClick={togglePauseRecording}
              >
                {isPausedRecording ? (
                  <>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <polygon points="7 5 19 12 7 19 7 5" />
                    </svg>
                    <span>Resume</span>
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <rect x="6" y="5" width="4" height="14" rx="1" />
                      <rect x="14" y="5" width="4" height="14" rx="1" />
                    </svg>
                    <span>Pause</span>
                  </>
                )}
              </button>

              <button
                id="messages-voice-send"
                type="button"
                className={cx('messages-recording-send')}
                aria-label="Send voice note"
                title="Send voice note"
                onClick={() => finishVoiceRecording('send')}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M22 2L11 13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          </div>

          <input
            ref={fileInputRef}
            id="messages-file-input"
            type="file"
            multiple
            hidden
            onChange={(e) => handleFilesSelected(e.target.files)}
          />

          <button
            type="button"
            className={cx('messages-attachment-button')}
            title="Attach file"
            aria-label="Attach file"
            disabled={!activeConversationId}
            onClick={() => fileInputRef.current?.click()}
          >
            +
          </button>

          <button
            id="messages-voice-record"
            type="button"
            className={cx('messages-voice-record', isRecording && 'is-recording')}
            title="Record voice note"
            aria-label="Record voice note"
            disabled={!activeConversationId}
            onClick={startVoiceRecording}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
            </svg>
          </button>

          <div className={cx('messages-compose-field')}>
            {(replyingTo || editingMsg) && (
              <div className={cx('messages-composer-context')}>
                <div className={cx('messages-composer-context-details')}>
                  <strong>
                    {editingMsg
                      ? 'Editing message'
                      : `Replying to ${replyingTo?.senderName || 'Teammate'}`}
                  </strong>
                  <span>
                    {(editingMsg?.body || replyingTo?.body || 'Attachment').slice(0, 110)}
                  </span>
                </div>
                <button
                  type="button"
                  className={cx('messages-composer-context-close')}
                  aria-label="Cancel context"
                  onClick={() => {
                    setReplyingTo(null);
                    setEditingMsg(null);
                    if (editingMsg) setComposerText('');
                  }}
                >
                  ×
                </button>
              </div>
            )}

            <div id="messages-attachment-list" className={cx('messages-attachment-list')}>
              {pendingAttachments.map((att, idx) => (
                <span key={`${att.name}_${idx}`} className={cx('messages-attachment-tag')}>
                  <span>{att.fileName || att.name}</span>
                  <button
                    type="button"
                    aria-label="Remove attachment"
                    onClick={() =>
                      setPendingAttachments((prev) => prev.filter((_, i) => i !== idx))
                    }
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>

            <div className={cx('messages-input-row')}>
              <textarea
                ref={inputRef}
                id="messages-input"
                rows={1}
                placeholder={
                  activeConversationId
                    ? 'Write a message...'
                    : 'Select a conversation to start chatting'
                }
                disabled={!activeConversationId}
                value={composerText}
                onChange={(e) => setComposerText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleComposerSubmit();
                  }
                }}
              />
            </div>
          </div>

          <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
            <button
              id="messages-emoji-toggle"
              type="button"
              className={cx('messages-emoji-toggle')}
              title="Insert emoji"
              aria-label="Insert emoji"
              disabled={!activeConversationId}
              onClick={() => setComposerEmojiOpen((prev) => !prev)}
            >
              ☺
            </button>
            <div
              id="messages-emoji-picker"
              className={cx('messages-emoji-picker')}
              hidden={!composerEmojiOpen}
            >
              {QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className={cx('messages-emoji-choice')}
                  onClick={() => {
                    setComposerText((prev) => `${prev}${emoji}`);
                    setComposerEmojiOpen(false);
                    inputRef.current?.focus();
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            className={cx('messages-send-button', isSending && 'is-saving')}
            disabled={
              !activeConversationId ||
              isSending ||
              (!composerText.trim() && !pendingAttachments.length && !editingMsg)
            }
            aria-label={editingMsg ? 'Save message edit' : 'Send message'}
            title={editingMsg ? 'Save message' : 'Send message'}
          >
            {isSending ? (
              'Sending...'
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            )}
          </button>
        </form>
      </div>

      {/* Create Channel / Group / DM Modal */}
      {createModalType && (
        <div
          className="modal-backdrop"
          onClick={() => {
            if (!creatingConv) setCreateModalType(null);
          }}
        >
          <form
            className="modal messages-create-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleCreateConversationSubmit}
          >
            <div className="messages-create-header">
              <div>
                <span className="messages-create-eyebrow">Team Messaging</span>
                <h2>
                  {createModalType === 'channel'
                    ? 'New Project Channel'
                    : createModalType === 'group'
                      ? 'New Group Chat'
                      : 'New Direct Message'}
                </h2>
                <p className="modal-copy">
                  {createModalType === 'channel'
                    ? 'Create a shared channel tied to a project or topic.'
                    : createModalType === 'group'
                      ? 'Bring teammates together into a persistent group thread.'
                      : 'Start a private 1-on-1 conversation with a teammate.'}
                </p>
              </div>
              <button
                type="button"
                className="close-modal"
                aria-label="Close modal"
                onClick={() => setCreateModalType(null)}
              >
                ×
              </button>
            </div>

            {createModalType !== 'direct' && (
              <label className="messages-create-label">
                <span>{createModalType === 'channel' ? 'Channel name' : 'Group name'}</span>
                <input
                  type="text"
                  required
                  placeholder={
                    createModalType === 'channel' ? 'e.g. design-reviews' : 'e.g. Sprint 4 Leads'
                  }
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                />
              </label>
            )}

            {createModalType === 'channel' && projects.length > 0 && (
              <label className="messages-create-label">
                <span>Linked project (optional)</span>
                <select
                  value={createProjectId}
                  onChange={(e) => setCreateProjectId(e.target.value)}
                >
                  <option value="">Workspace-wide channel</option>
                  {projects.map((p) => (
                    <option key={p.projectId} value={p.projectId}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="messages-create-label">
              <span>
                {createModalType === 'direct' ? 'Choose a teammate' : 'Select members'}
              </span>
              <input
                type="search"
                placeholder="Search teammates..."
                value={createMemberSearch}
                onChange={(e) => setCreateMemberSearch(e.target.value)}
              />
            </div>

            <div className={cx('messages-member-list')}>
              {!filteredCreateTeammates.length ? (
                <p className={cx('messages-list-empty')}>No matching teammates found.</p>
              ) : (
                filteredCreateTeammates.map((mate) => {
                  const checked = createSelectedUids.includes(mate.firebaseUid);
                  return (
                    <label key={mate.firebaseUid} className="messages-member-option">
                      <span className="messages-create-avatar">{mate.initials}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>{mate.name}</span>
                      <input
                        type={createModalType === 'direct' ? 'radio' : 'checkbox'}
                        name="createConvMember"
                        checked={checked}
                        onChange={() => {
                          if (createModalType === 'direct') {
                            setCreateSelectedUids([mate.firebaseUid]);
                          } else {
                            setCreateSelectedUids((prev) =>
                              prev.includes(mate.firebaseUid)
                                ? prev.filter((id) => id !== mate.firebaseUid)
                                : [...prev, mate.firebaseUid]
                            );
                          }
                        }}
                      />
                    </label>
                  );
                })
              )}
            </div>

            <button
              type="submit"
              className="primary-button full messages-create-submit"
              disabled={creatingConv}
            >
              {creatingConv
                ? 'Creating...'
                : createModalType === 'direct'
                  ? 'Open Direct Message'
                  : createModalType === 'group'
                    ? 'Create Group'
                    : 'Create Channel'}
            </button>
          </form>
        </div>
      )}

      {/* Forward Message Modal */}
      {forwardMsg && (
        <div
          className="modal-backdrop"
          onClick={() => {
            if (!forwarding) setForwardMsg(null);
          }}
        >
          <form
            className={`modal ${cx('messages-forward-modal')}`}
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleForwardSubmit}
          >
            <div className={cx('messages-forward-header')}>
              <button
                type="button"
                className={cx('messages-forward-cancel')}
                onClick={() => setForwardMsg(null)}
              >
                Cancel
              </button>
              <h2>Forward Message</h2>
              <span className={cx('messages-forward-selection-count')}>
                {forwardSelectedConvIds.length} selected
              </span>
            </div>

            <label className={cx('messages-forward-search')}>
              <span>🔍</span>
              <input
                type="search"
                placeholder="Search chats..."
                value={forwardSearch}
                onChange={(e) => setForwardSearch(e.target.value)}
              />
            </label>

            <div className={cx('messages-forward-preview')}>
              <div className={cx('messages-forward-sender')}>
                <span className={cx('messages-forward-avatar')}>
                  {getUserInitials(forwardMsg.senderName || 'T')}
                </span>
                <div className={cx('messages-forward-sender-details')}>
                  <strong>{forwardMsg.senderName || 'Teammate'}</strong>
                  <small>{formatMessageTime(forwardMsg.createdAt)}</small>
                </div>
              </div>
              <div className={cx('messages-forward-preview-content')}>
                <strong>Message</strong>
                <span>{forwardMsg.body || 'Attachment'}</span>
              </div>
            </div>

            <div className={cx('messages-forward-list')}>
              <div className={cx('messages-forward-section-title')}>Recent chats</div>
              {!forwardCandidates.length ? (
                <p className={cx('messages-forward-empty')}>No matching chats available.</p>
              ) : (
                forwardCandidates.map((conv, idx) => {
                  const selected = forwardSelectedConvIds.includes(conv.id);
                  const { displayName, subtitle } = getConversationDisplay(conv);
                  const toneClass = avatarTones[idx % avatarTones.length];
                  return (
                    <label
                      key={conv.id}
                      className={cx(
                        'messages-forward-recipient',
                        selected && 'selected'
                      )}
                    >
                      <span
                        className={cx(
                          'messages-forward-avatar',
                          toneClass === 'pink' ? 'pink' : toneClass
                        )}
                      >
                        {getUserInitials(displayName)}
                      </span>
                      <div className={cx('messages-forward-recipient-details')}>
                        <strong>{displayName}</strong>
                        <small>{subtitle}</small>
                      </div>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() =>
                          setForwardSelectedConvIds((prev) =>
                            prev.includes(conv.id)
                              ? prev.filter((id) => id !== conv.id)
                              : [...prev, conv.id]
                          )
                        }
                      />
                    </label>
                  );
                })
              )}
            </div>

            <div className={cx('messages-forward-footer')}>
              <span className={cx('messages-forward-selected')}>
                {forwardSelectedConvIds.length
                  ? `${forwardSelectedConvIds.length} conversation${forwardSelectedConvIds.length > 1 ? 's' : ''} selected`
                  : 'Select at least one chat'}
              </span>
              <button
                type="submit"
                className={`primary-button ${cx('messages-forward-submit')}`}
                disabled={!forwardSelectedConvIds.length || forwarding}
              >
                {forwarding ? 'Sending...' : 'Forward'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Clear / Delete Conversation Confirmation Modal */}
      {clearOrDeleteModal && activeConversation && (
        <div className="modal-backdrop" onClick={() => setClearOrDeleteModal(null)}>
          <div
            className={`modal messages-create-modal messages-clear-modal ${cx('messages-clear-modal')}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`messages-create-header ${cx('messages-clear-modal-header')}`}>
              <div>
                <span className="messages-create-eyebrow">Conversation Action</span>
                <h2>
                  {clearOrDeleteModal === 'clear'
                    ? 'Clear all messages?'
                    : 'Delete chat for you?'}
                </h2>
                <p className="modal-copy">
                  {clearOrDeleteModal === 'clear'
                    ? 'This removes your message history in this chat.'
                    : 'This removes the conversation from your sidebar.'}
                </p>
              </div>
              <button
                type="button"
                className="close-modal"
                aria-label="Close modal"
                onClick={() => setClearOrDeleteModal(null)}
              >
                ×
              </button>
            </div>

            <div className={cx('messages-clear-actions')}>
              <button
                type="button"
                className="outline-button messages-clear-cancel"
                style={{ width: 'auto', color: 'inherit' }}
                onClick={() => setClearOrDeleteModal(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button messages-clear-confirm"
                onClick={async () => {
                  const id = activeConversation.id;
                  const mode = clearOrDeleteModal;
                  setClearOrDeleteModal(null);
                  if (mode === 'clear') {
                    await clearConversation(id);
                  } else {
                    await deleteConversation(id);
                  }
                }}
              >
                {clearOrDeleteModal === 'clear' ? 'Clear Messages' : 'Delete Chat'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Briefing Modal */}
      {briefingModal && (
        <div className="modal-backdrop" onClick={() => setBriefingModal(null)}>
          <div
            className={`modal ${cx('ai-briefing-modal')}`}
            onClick={(e) => e.stopPropagation()}
          >
            <h2>{briefingModal.title}</h2>
            <button
              type="button"
              className="close-modal"
              aria-label="Close AI briefing"
              onClick={() => setBriefingModal(null)}
            >
              ×
            </button>
            {briefingModal.loading ? (
              <p className={cx('ai-briefing-copy')}>Summarizing recent channel messages...</p>
            ) : briefingModal.error ? (
              <p className={cx('messages-error')} style={{ margin: 0 }}>
                {briefingModal.error}
              </p>
            ) : (
              <p className={cx('ai-briefing-copy')}>{briefingModal.summary}</p>
            )}
          </div>
        </div>
      )}

      {/* In-App Attachment Viewer Modal (replaces window.open) */}
      {viewerAttachment && (
        <div
          className={cx('message-attachment-viewer-backdrop')}
          onClick={() => setViewerAttachment(null)}
        >
          <div
            className={cx('message-attachment-viewer')}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={cx('message-attachment-viewer-header')}>
              <h2>{viewerAttachment.fileName || viewerAttachment.name || 'Attachment'}</h2>
              <div className={cx('message-attachment-viewer-actions')}>
                {(viewerAttachment.dataUrl || viewerAttachment.url) && (
                  <a
                    className={cx('message-attachment-save')}
                    href={viewerAttachment.dataUrl || viewerAttachment.url}
                    download={viewerAttachment.fileName || viewerAttachment.name || 'attachment'}
                  >
                    Download
                  </a>
                )}
                <button
                  type="button"
                  className={cx('message-attachment-close')}
                  onClick={() => setViewerAttachment(null)}
                >
                  Close
                </button>
              </div>
            </div>
            <div className={cx('message-attachment-viewer-content')}>
              {(() => {
                const src = viewerAttachment.dataUrl || viewerAttachment.url || '';
                const mime = (viewerAttachment.mimeType || viewerAttachment.type || '').toLowerCase();
                const name = viewerAttachment.fileName || viewerAttachment.name || 'Attachment';
                if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(name)) {
                  return <img src={src} alt={name} />;
                }
                if (mime.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(name)) {
                  return <video src={src} controls />;
                }
                if (mime.startsWith('audio/')) {
                  return <audio src={src} controls />;
                }
                return (
                  <div style={{ color: '#F4F4F5', textAlign: 'center', padding: '24px' }}>
                    <FileTypeIcon fileName={name} mimeType={mime} size={48} />
                    <p style={{ marginTop: '12px' }}>{name}</p>
                    <small style={{ color: '#A1A1AA' }}>
                      {formatFileSize(viewerAttachment.size)} · Click Download to save locally
                    </small>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default Messages;
