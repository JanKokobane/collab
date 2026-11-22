import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSprintMemberUids, getUserInitials, useDashboard } from '../../context/DashboardContext';
import { api } from '../../services/api';
import type { ProjectMember } from '../../types/dashboard';
import { createClassNames } from '../../utils/cx';
import styles from './MeetingModal.module.css';

const cx = createClassNames(styles);

const METERED_SDK_URL = 'https://cdn.metered.ca/sdk/video/1.4.6/sdk.min.js';
const REACTION_MARKER_PREFIX = '[[collab-reaction:';
const REACTION_MARKER_SUFFIX = ']]';
const REACTION_EMOJIS = ['👍', '👏', '🎉', '❤️', '😂', '😮', '💡', '🔥'];
const REACTION_LANES = ['10%', '24%', '40%', '58%', '74%', '88%'];

type MeetingPanelTab = 'people' | 'chat' | 'notes' | 'actions';

interface MeteredParticipantState {
  sessionId: string;
  name: string;
  isLocal: boolean;
  isMuted: boolean;
  isVideoOff: boolean;
  isSharingScreen: boolean;
}

interface MeetingChatItem {
  id: string;
  senderName: string;
  message: string;
  createdAt?: string;
}

interface FloatingReaction {
  id: string;
  emoji: string;
  laneLeft: string;
}

interface MeetingActionItemRecord {
  actionItemId: string;
  description: string;
  assigneeUid?: string;
  sprintName?: string;
  dueDate?: string;
  dispatchedTaskId?: string | null;
}

interface AiExtractedSummary {
  summaryBullets: string[];
  actionItems: Array<{ description: string; assignee?: string; dueDate?: string }>;
}

declare global {
  interface Window {
    Metered?: {
      Meeting: new () => any;
    };
  }
}

let meteredScriptPromise: Promise<void> | null = null;

function loadMeteredSdk(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('No browser window'));
  if (window.Metered?.Meeting) return Promise.resolve();
  if (meteredScriptPromise) return meteredScriptPromise;

  meteredScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${METERED_SDK_URL}"]`);
    if (existing && window.Metered?.Meeting) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = METERED_SDK_URL;
    script.async = true;
    script.onload = () => {
      if (window.Metered?.Meeting) {
        resolve();
      } else {
        meteredScriptPromise = null;
        reject(new Error('Metered Video SDK did not initialize'));
      }
    };
    script.onerror = () => {
      meteredScriptPromise = null;
      reject(new Error('Unable to load Metered Video SDK'));
    };
    document.head.appendChild(script);
  });

  return meteredScriptPromise;
}

function parseReactionMarker(text: string): string | null {
  const trimmed = text.trim();
  if (
    trimmed.startsWith(REACTION_MARKER_PREFIX) &&
    trimmed.endsWith(REACTION_MARKER_SUFFIX)
  ) {
    const emoji = trimmed
      .slice(REACTION_MARKER_PREFIX.length, -REACTION_MARKER_SUFFIX.length)
      .trim();
    return emoji || null;
  }
  return null;
}

function formatDurationClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Renders a Metered video MediaStreamTrack smoothly onto a responsive canvas.
 */
const TrackCanvas: React.FC<{
  track: MediaStreamTrack | null;
  className?: string;
  contain?: boolean;
}> = ({ track, className, contain = false }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !track) return;

    let cancelled = false;
    let rafId = 0;
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.srcObject = new MediaStream([track]);
    video.play().catch(() => {});

    const drawFrame = () => {
      if (cancelled) return;
      if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
        const rect = canvas.getBoundingClientRect();
        const targetW = Math.max(320, Math.round(rect.width || video.videoWidth));
        const targetH = Math.max(180, Math.round(rect.height || video.videoHeight));
        if (canvas.width !== targetW || canvas.height !== targetH) {
          canvas.width = targetW;
          canvas.height = targetH;
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, targetW, targetH);
          const vRatio = video.videoWidth / video.videoHeight;
          const cRatio = targetW / targetH;
          let drawW = targetW;
          let drawH = targetH;
          let offsetX = 0;
          let offsetY = 0;

          if (contain) {
            if (vRatio > cRatio) {
              drawH = targetW / vRatio;
              offsetY = (targetH - drawH) / 2;
            } else {
              drawW = targetH * vRatio;
              offsetX = (targetW - drawW) / 2;
            }
          } else if (vRatio > cRatio) {
            drawW = targetH * vRatio;
            offsetX = (targetW - drawW) / 2;
          } else {
            drawH = targetW / vRatio;
            offsetY = (targetH - drawH) / 2;
          }
          ctx.drawImage(video, offsetX, offsetY, drawW, drawH);
        }
      }
      rafId = requestAnimationFrame(drawFrame);
    };

    rafId = requestAnimationFrame(drawFrame);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      video.pause();
      video.srcObject = null;
    };
  }, [track, contain]);

  return <canvas ref={canvasRef} className={className} />;
};

const RemoteAudioTrack: React.FC<{ track: MediaStreamTrack }> = ({ track }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.srcObject = new MediaStream([track]);
    el.play().catch(() => {});
    return () => {
      el.srcObject = null;
    };
  }, [track]);
  return <audio ref={audioRef} autoPlay playsInline style={{ display: 'none' }} />;
};

export const MeetingModal: React.FC = () => {
  const {
    activeMeteredMeeting,
    closeMeteredMeetingModal,
    currentUser,
    firebaseUser,
    projects,
    showDashboardConfirmation,
    showDashboardToast,
    refreshAllDashboardData
  } = useDashboard();

  const { isOpen, meeting, minimized } = activeMeteredMeeting;
  const currentUid = firebaseUser?.uid || currentUser?.uid || '';
  const visible = Boolean(isOpen && meeting && !minimized);

  // Body scroll lock
  useEffect(() => {
    document.body.classList.toggle('zoom-meeting-open', visible);
    return () => {
      document.body.classList.remove('zoom-meeting-open');
    };
  }, [visible]);

  // Metered SDK & session state
  const [statusText, setStatusText] = useState('Connecting...');
  const [statusError, setStatusError] = useState(false);
  const [roomUrl, setRoomUrl] = useState('');
  const [copiedId, setCopiedId] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Local media controls
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [remoteSharingLabel, setRemoteSharingLabel] = useState<string | null>(null);

  // Tracks & Participants
  const [participants, setParticipants] = useState<Record<string, MeteredParticipantState>>({});
  const [videoTracks, setVideoTracks] = useState<Record<string, MediaStreamTrack>>({});
  const [audioTracks, setAudioTracks] = useState<Record<string, MediaStreamTrack>>({});
  const [screenShareTrack, setScreenShareTrack] = useState<MediaStreamTrack | null>(null);

  // Side Panel & Tabs
  const [sidePanelOpen, setSidePanelOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<MeetingPanelTab>('people');

  // Chat & Reactions
  const [chatMessages, setChatMessages] = useState<MeetingChatItem[]>([]);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [chatDraft, setChatDraft] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [sendingReaction, setSendingReaction] = useState(false);
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);

  // Notes & AI
  const [notesText, setNotesText] = useState('');
  const [notesStatus, setNotesStatus] = useState('');
  const [notesError, setNotesError] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [aiExtracting, setAiExtracting] = useState(false);
  const [aiSummary, setAiSummary] = useState<AiExtractedSummary | null>(null);

  // Action Items
  const [actionItems, setActionItems] = useState<MeetingActionItemRecord[]>([]);
  const [dispatchDrafts, setDispatchDrafts] = useState<
    Record<string, { assigneeUid: string; sprintName: string; dueDate: string }>
  >({});
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);

  // Refs for cleanup
  const meteredRef = useRef<any>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const leaseHeartbeatRef = useRef<number | null>(null);
  const liveStatusPollRef = useRef<number | null>(null);
  const chatPollRef = useRef<number | null>(null);
  const actionsPollRef = useRef<number | null>(null);
  const seenChatIdsRef = useRef<Set<string>>(new Set());
  const laneIdxRef = useRef(0);
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const sidePanelOpenRef = useRef(sidePanelOpen);
  sidePanelOpenRef.current = sidePanelOpen;
  const isSharingScreenRef = useRef(isSharingScreen);
  isSharingScreenRef.current = isSharingScreen;

  const projectId = meeting?.projectId || '';
  const meetingId = meeting?.id || meeting?.meetingId || '';
  const currentProject = useMemo(
    () => projects.find((p) => p.projectId === projectId),
    [projects, projectId]
  );

  const isHost = Boolean(
    meeting &&
      currentUid &&
      (meeting.hostFirebaseUid === currentUid ||
        currentProject?.creatorFirebaseUid === currentUid)
  );

  const spawnFloatingReaction = useCallback((emoji: string) => {
    const laneLeft = REACTION_LANES[laneIdxRef.current % REACTION_LANES.length];
    laneIdxRef.current += 1;
    const id = `rx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setFloatingReactions((prev) => [...prev.slice(-18), { id, emoji, laneLeft }]);
    window.setTimeout(() => {
      setFloatingReactions((prev) => prev.filter((item) => item.id !== id));
    }, 2650);
  }, []);

  const stopScreenShareResources = useCallback(async () => {
    if (leaseHeartbeatRef.current) {
      window.clearInterval(leaseHeartbeatRef.current);
      leaseHeartbeatRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          // ignore
        }
      });
      screenStreamRef.current = null;
    }
    if (meteredRef.current) {
      try {
        await meteredRef.current.stopScreenShare?.();
      } catch {
        // ignore
      }
    }
    if (isSharingScreenRef.current && projectId && meetingId) {
      api
        .post(
          `/projects/${encodeURIComponent(projectId)}/meetings/${encodeURIComponent(meetingId)}/screen-share`,
          { action: 'release' }
        )
        .catch(() => {});
    }
    setIsSharingScreen(false);
    setScreenShareTrack(null);
  }, [projectId, meetingId]);

  const leaveAndCleanup = useCallback(async () => {
    if (liveStatusPollRef.current) {
      window.clearInterval(liveStatusPollRef.current);
      liveStatusPollRef.current = null;
    }
    if (chatPollRef.current) {
      window.clearInterval(chatPollRef.current);
      chatPollRef.current = null;
    }
    if (actionsPollRef.current) {
      window.clearInterval(actionsPollRef.current);
      actionsPollRef.current = null;
    }
    await stopScreenShareResources();
    if (meteredRef.current) {
      try {
        await meteredRef.current.leaveMeeting?.();
      } catch {
        // ignore
      }
      meteredRef.current = null;
    }
    setParticipants({});
    setVideoTracks({});
    setAudioTracks({});
    setScreenShareTrack(null);
    setRemoteSharingLabel(null);
  }, [stopScreenShareResources]);

  // Fetch meeting chat messages
  const fetchChat = useCallback(async () => {
    if (!projectId || !meetingId) return;
    try {
      const res = await api.get(
        `/projects/${encodeURIComponent(projectId)}/meetings/${encodeURIComponent(meetingId)}/messages`
      );
      const raw = res?.data?.messages || [];
      if (!Array.isArray(raw)) return;

      const visibleMsgs: MeetingChatItem[] = [];
      let newlyUnread = 0;

      raw.forEach((m: any) => {
        const id = String(m.message_id || m.id || `${m.created_at}_${m.sender_name}`);
        const text = String(m.body || m.message || '');
        const isFirstTime = !seenChatIdsRef.current.has(id);
        seenChatIdsRef.current.add(id);

        const reactionEmoji = parseReactionMarker(text);
        if (reactionEmoji) {
          if (isFirstTime && m.sender_firebase_uid !== currentUid) {
            spawnFloatingReaction(reactionEmoji);
          }
          return;
        }

        visibleMsgs.push({
          id,
          senderName: String(m.sender_name || m.senderName || 'Participant'),
          message: text,
          createdAt: m.created_at || m.createdAt
        });

        if (
          isFirstTime &&
          m.sender_firebase_uid !== currentUid &&
          (!sidePanelOpenRef.current || activeTabRef.current !== 'chat')
        ) {
          newlyUnread += 1;
        }
      });

      setChatMessages(visibleMsgs);
      if (newlyUnread > 0) {
        setUnreadChatCount((prev) => prev + newlyUnread);
      }
    } catch {
      // ignore polling hiccup
    }
  }, [projectId, meetingId, currentUid, spawnFloatingReaction]);

  // Fetch action items
  const fetchActionItems = useCallback(async () => {
    if (!projectId || !meetingId) return;
    try {
      const res = await api.get(
        `/projects/${encodeURIComponent(projectId)}/meetings/${encodeURIComponent(meetingId)}/action-items`
      );
      const raw = res?.data?.actionItems || res?.data?.action_items || [];
      if (!Array.isArray(raw)) return;
      const mapped: MeetingActionItemRecord[] = raw.map((item: any) => ({
        actionItemId: String(item.action_item_id || item.actionItemId || item.id),
        description: String(item.description || item.title || ''),
        assigneeUid: item.assignee_firebase_uid || item.assigneeUid || '',
        sprintName: item.sprint_name || item.sprintName || '',
        dueDate: item.due_date ? String(item.due_date).slice(0, 10) : '',
        dispatchedTaskId: item.dispatched_task_id || item.task_id || null
      }));
      setActionItems(mapped);
    } catch {
      // ignore polling hiccup
    }
  }, [projectId, meetingId]);

  // Main Metered connection lifecycle when modal opens
  useEffect(() => {
    if (!visible || !meeting || !projectId || !meetingId) return;

    let cancelled = false;
    seenChatIdsRef.current.clear();
    setChatMessages([]);
    setUnreadChatCount(0);
    setAiSummary(null);
    setStatusError(false);
    setStatusText('Joining room...');
    setElapsedSeconds(0);

    const timer = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    (async () => {
      try {
        const [tokenRes, notesRes] = await Promise.all([
          api.post(
            `/projects/${encodeURIComponent(projectId)}/meetings/${encodeURIComponent(meetingId)}/token`,
            {}
          ),
          api
            .get(
              `/projects/${encodeURIComponent(projectId)}/meetings/${encodeURIComponent(meetingId)}/notes`
            )
            .catch(() => null),
          loadMeteredSdk()
        ]);

        if (cancelled) return;

        const accessToken = tokenRes?.data?.accessToken || tokenRes?.data?.token;
        const resolvedRoomUrl =
          tokenRes?.data?.roomURL ||
          tokenRes?.data?.roomUrl ||
          meeting.meetingUrl ||
          meeting.roomUrl ||
          '';
        setRoomUrl(resolvedRoomUrl);
        if (notesRes?.data?.notes !== undefined) {
          setNotesText(String(notesRes.data.notes || ''));
        } else if (meeting.notes) {
          setNotesText(String(meeting.notes));
        }

        if (!window.Metered?.Meeting) {
          throw new Error('Metered Video SDK is unavailable.');
        }

        const metered = new window.Metered.Meeting();
        meteredRef.current = metered;

        metered.on('localTrackStarted', (trackItem: any) => {
          if (cancelled) return;
          const sid = 'local';
          if (trackItem.type === 'video') {
            setVideoTracks((prev) => ({ ...prev, [sid]: trackItem.track }));
            setIsCamOn(true);
          } else if (trackItem.type === 'screen') {
            setScreenShareTrack(trackItem.track);
            setIsSharingScreen(true);
          }
        });

        metered.on('localTrackStopped', (trackItem: any) => {
          if (cancelled) return;
          if (trackItem.type === 'video') {
            setVideoTracks((prev) => {
              const next = { ...prev };
              delete next.local;
              return next;
            });
            setIsCamOn(false);
          } else if (trackItem.type === 'screen') {
            setScreenShareTrack(null);
            setIsSharingScreen(false);
          }
        });

        metered.on('remoteTrackStarted', (trackItem: any) => {
          if (cancelled) return;
          const sid = String(trackItem.participantSessionId || trackItem.streamId || 'remote');
          if (trackItem.type === 'video') {
            setVideoTracks((prev) => ({ ...prev, [sid]: trackItem.track }));
          } else if (trackItem.type === 'audio') {
            setAudioTracks((prev) => ({ ...prev, [sid]: trackItem.track }));
          } else if (trackItem.type === 'screen') {
            setScreenShareTrack(trackItem.track);
          }
        });

        metered.on('remoteTrackStopped', (trackItem: any) => {
          if (cancelled) return;
          const sid = String(trackItem.participantSessionId || trackItem.streamId || 'remote');
          if (trackItem.type === 'video') {
            setVideoTracks((prev) => {
              const next = { ...prev };
              delete next[sid];
              return next;
            });
          } else if (trackItem.type === 'audio') {
            setAudioTracks((prev) => {
              const next = { ...prev };
              delete next[sid];
              return next;
            });
          } else if (trackItem.type === 'screen') {
            setScreenShareTrack(null);
          }
        });

        const upsertParticipant = (p: any, isLocal = false) => {
          const sid = isLocal ? 'local' : String(p.sessionId || p._id || '');
          if (!sid) return;
          setParticipants((prev) => ({
            ...prev,
            [sid]: {
              sessionId: sid,
              name: String(p.name || p.participantName || (isLocal ? currentUser.name : 'Participant')),
              isLocal,
              isMuted: Boolean(p.audioMuted ?? !p.isAudioOn),
              isVideoOff: Boolean(p.videoMuted ?? !p.isVideoOn),
              isSharingScreen: Boolean(p.isSharingScreen)
            }
          }));
        };

        metered.on('participantJoined', (p: any) => {
          if (!cancelled) upsertParticipant(p, false);
        });

        metered.on('participantLeft', (p: any) => {
          if (cancelled) return;
          const sid = String(p.sessionId || p._id || '');
          setParticipants((prev) => {
            const next = { ...prev };
            delete next[sid];
            return next;
          });
        });

        metered.on('onlineParticipants', (list: any[]) => {
          if (cancelled || !Array.isArray(list)) return;
          list.forEach((p) => upsertParticipant(p, false));
        });

        metered.on('participantSharingStateUpdated', (info: any) => {
          if (cancelled) return;
          if (info?.isSharing) {
            setRemoteSharingLabel(`${info.name || 'Participant'} is sharing screen`);
          } else {
            setRemoteSharingLabel(null);
          }
        });

        metered.on('stateChanged', (state: string) => {
          if (!cancelled && state) {
            setStatusText(state === 'connected' ? 'Connected' : String(state));
          }
        });

        metered.on('meetingEnded', async () => {
          if (cancelled) return;
          showDashboardToast('Meeting has ended.', 'info');
          await leaveAndCleanup();
          closeMeteredMeetingModal();
        });

        metered.on('meetingLeft', async () => {
          if (!cancelled) {
            await leaveAndCleanup();
          }
        });

        await metered.join({
          roomURL: resolvedRoomUrl,
          accessToken,
          name: currentUser.name || 'Collab Member'
        });

        if (cancelled) return;
        setStatusText('Connected');
        setParticipants((prev) => ({
          ...prev,
          local: {
            sessionId: 'local',
            name: `${currentUser.name || 'You'} (You)`,
            isLocal: true,
            isMuted: false,
            isVideoOff: false,
            isSharingScreen: false
          }
        }));

        try {
          await metered.startAudio();
          setIsMicOn(true);
        } catch {
          setIsMicOn(false);
        }
        try {
          await metered.startVideo();
          setIsCamOn(true);
        } catch {
          setIsCamOn(false);
        }

        // Initial fetches + background pollers
        fetchChat();
        fetchActionItems();
        chatPollRef.current = window.setInterval(fetchChat, 8000);
        actionsPollRef.current = window.setInterval(fetchActionItems, 30000);

        liveStatusPollRef.current = window.setInterval(async () => {
          try {
            const st = await api.get(
              `/projects/${encodeURIComponent(projectId)}/meetings/${encodeURIComponent(meetingId)}/live-status`
            );
            const data = st?.data;
            if (data?.endedAt || data?.ended_at) {
              showDashboardToast('Host ended the meeting.', 'info');
              await leaveAndCleanup();
              closeMeteredMeetingModal();
            }
          } catch {
            // ignore transient check
          }
        }, 5000);
      } catch (err: any) {
        if (!cancelled) {
          setStatusError(true);
          setStatusText(err?.message || 'Unable to connect to meeting room.');
        }
      }
    })();

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      leaveAndCleanup();
    };
  }, [
    visible,
    meeting,
    projectId,
    meetingId,
    currentUser.name,
    fetchChat,
    fetchActionItems,
    leaveAndCleanup,
    closeMeteredMeetingModal,
    showDashboardToast
  ]);

  // Toggle mic
  const handleToggleMic = async () => {
    const metered = meteredRef.current;
    if (!metered) return;
    try {
      if (isMicOn) {
        await metered.stopAudio();
        setIsMicOn(false);
      } else {
        await metered.startAudio();
        setIsMicOn(true);
      }
    } catch (err: any) {
      showDashboardToast(err?.message || 'Unable to toggle microphone.', 'error');
    }
  };

  // Toggle camera
  const handleToggleCam = async () => {
    const metered = meteredRef.current;
    if (!metered) return;
    try {
      if (isCamOn) {
        await metered.stopVideo();
        setIsCamOn(false);
      } else {
        await metered.startVideo();
        setIsCamOn(true);
      }
    } catch (err: any) {
      showDashboardToast(err?.message || 'Unable to toggle camera.', 'error');
    }
  };

  // Toggle 1080p60 screen share with server lease + heartbeat
  const handleToggleScreenShare = async () => {
    if (isSharingScreen) {
      await stopScreenShareResources();
      return;
    }
    const metered = meteredRef.current;
    if (!metered || !projectId || !meetingId) return;

    try {
      await api.post(
        `/projects/${encodeURIComponent(projectId)}/meetings/${encodeURIComponent(meetingId)}/screen-share`,
        { action: 'claim' }
      );

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 60 }
        },
        audio: true
      });
      screenStreamRef.current = stream;

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          stopScreenShareResources();
        };
        setScreenShareTrack(videoTrack);
      }

      if (typeof metered.shareScreen === 'function') {
        await metered.shareScreen(stream);
      } else if (typeof metered.startScreenShare === 'function') {
        await metered.startScreenShare();
      }

      setIsSharingScreen(true);
      leaseHeartbeatRef.current = window.setInterval(() => {
        api
          .post(
            `/projects/${encodeURIComponent(projectId)}/meetings/${encodeURIComponent(meetingId)}/screen-share`,
            { action: 'heartbeat' }
          )
          .catch(() => {});
      }, 5000);
    } catch (err: any) {
      await stopScreenShareResources();
      if (err?.name !== 'AbortError') {
        showDashboardToast(err?.message || 'Unable to share screen.', 'error');
      }
    }
  };

  // Copy meeting room link
  const handleCopyRoomId = async () => {
    const val = roomUrl || meetingId;
    if (!val) return;
    try {
      await navigator.clipboard.writeText(val);
      setCopiedId(true);
      window.setTimeout(() => setCopiedId(false), 1800);
    } catch {
      showDashboardToast('Room link ready to copy from meeting details.', 'info');
    }
  };

  // Send chat or reaction
  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = chatDraft.trim();
    if (!text || !projectId || !meetingId || sendingChat) return;
    setSendingChat(true);
    setChatDraft('');
    try {
      await api.post(
        `/projects/${encodeURIComponent(projectId)}/meetings/${encodeURIComponent(meetingId)}/messages`,
        { body: text }
      );
      await fetchChat();
    } catch (err: any) {
      setChatDraft(text);
      showDashboardToast(err?.message || 'Unable to send chat message.', 'error');
    } finally {
      setSendingChat(false);
    }
  };

  const handleSendReaction = async (emoji: string) => {
    if (!projectId || !meetingId || sendingReaction) return;
    setReactionPickerOpen(false);
    setSendingReaction(true);
    spawnFloatingReaction(emoji);
    try {
      await api.post(
        `/projects/${encodeURIComponent(projectId)}/meetings/${encodeURIComponent(meetingId)}/messages`,
        { body: `${REACTION_MARKER_PREFIX}${emoji}${REACTION_MARKER_SUFFIX}` }
      );
    } catch {
      // Local reaction already shown
    } finally {
      setSendingReaction(false);
    }
  };

  // Save notes
  const handleSaveNotes = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !meetingId || savingNotes) return;
    setSavingNotes(true);
    setNotesError(false);
    setNotesStatus('Saving notes...');
    try {
      await api.put(
        `/projects/${encodeURIComponent(projectId)}/meetings/${encodeURIComponent(meetingId)}/notes`,
        { notes: notesText }
      );
      setNotesStatus('Notes saved to meeting record');
    } catch (err: any) {
      setNotesError(true);
      setNotesStatus(err?.message || 'Unable to save notes.');
    } finally {
      setSavingNotes(false);
    }
  };

  // Extract AI Summary & Action Items
  const handleExtractAi = async () => {
    if (!notesText.trim() && !chatMessages.length) {
      showDashboardToast('Add meeting notes or chat messages before summarizing.', 'warning');
      return;
    }
    setAiExtracting(true);
    try {
      const chatTranscript = chatMessages.map((m) => `${m.senderName}: ${m.message}`).join('\n');
      const res = await api.post('/ai/summarize-meeting', {
        title: meeting?.title || 'Team Meeting',
        notes: notesText,
        transcript: chatTranscript
      });
      const data = res?.data || res;
      setAiSummary({
        summaryBullets: Array.isArray(data?.summaryBullets || data?.summary_bullets)
          ? data.summaryBullets || data.summary_bullets
          : [],
        actionItems: Array.isArray(data?.actionItems || data?.action_items)
          ? data.actionItems || data.action_items
          : []
      });
    } catch (err: any) {
      showDashboardToast(err?.message || 'Unable to extract AI action items.', 'error');
    } finally {
      setAiExtracting(false);
    }
  };

  const handleAddAiActionItem = async (desc: string) => {
    if (!projectId || !meetingId || !desc.trim()) return;
    try {
      await api.post(
        `/projects/${encodeURIComponent(projectId)}/meetings/${encodeURIComponent(meetingId)}/action-items`,
        { description: desc.trim() }
      );
      await fetchActionItems();
      setActiveTab('actions');
      showDashboardToast('Added to Actions tab.', 'success');
    } catch (err: any) {
      showDashboardToast(err?.message || 'Unable to add action item.', 'error');
    }
  };

  const handleDispatchActionItem = async (e: React.FormEvent, item: MeetingActionItemRecord) => {
    e.preventDefault();
    if (!projectId || !meetingId || dispatchingId) return;
    const draft = dispatchDrafts[item.actionItemId] || {
      assigneeUid: item.assigneeUid || '',
      sprintName: item.sprintName || '',
      dueDate: item.dueDate || ''
    };
    setDispatchingId(item.actionItemId);
    try {
      await api.post(
        `/projects/${encodeURIComponent(projectId)}/meetings/${encodeURIComponent(meetingId)}/action-items/${encodeURIComponent(item.actionItemId)}/dispatch`,
        {
          assigneeFirebaseUid: draft.assigneeUid || undefined,
          sprint: draft.sprintName || undefined,
          dueDate: draft.dueDate || undefined
        }
      );
      await fetchActionItems();
      await refreshAllDashboardData();
      showDashboardToast('Action item dispatched to project board.', 'success');
    } catch (err: any) {
      showDashboardToast(err?.message || 'Unable to dispatch action item.', 'error');
    } finally {
      setDispatchingId(null);
    }
  };

  // Leave / End Meeting
  const handleLeaveOrEnd = async () => {
    if (isHost && projectId && meetingId) {
      const confirmed = await showDashboardConfirmation({
        eyebrow: 'End Meeting',
        title: 'End meeting for everyone?',
        message:
          'Ending this meeting closes the room for all connected participants. Are you sure?',
        confirmLabel: 'End Meeting',
        cancelLabel: 'Keep Running',
        destructive: true
      });
      if (!confirmed) return;
      try {
        await api.post(
          `/projects/${encodeURIComponent(projectId)}/meetings/${encodeURIComponent(meetingId)}/end`,
          {}
        );
      } catch {
        // Proceed with local close
      }
    }
    await leaveAndCleanup();
    closeMeteredMeetingModal();
  };

  if (!visible || !meeting) return null;

  const participantList = Object.values(participants);
  const attendeesForSelect: ProjectMember[] = meeting.attendees || [];
  const sprints = currentProject?.sprints || [];
  const hasScreenShare = Boolean(screenShareTrack);

  return (
    <div
      id="zoom-meeting-modal"
      className={cx('zoom-meeting-overlay')}
      role="dialog"
      aria-modal="true"
      aria-label={meeting.title || 'Live Meeting'}
    >
      <div className={cx('zoom-meeting-card')}>
        {/* Header */}
        <header className={cx('zoom-meeting-header')}>
          <div className={cx('zoom-meeting-brand')}>
            <img
              src="/images/logo.png"
              alt="Collab"
              className={cx('zoom-meeting-brand-logo')}
            />
          </div>

          <div className={cx('zoom-meeting-info')}>
            <h2>{meeting.title || 'Collab Meeting'}</h2>
            <p className={cx('zoom-meeting-status', statusError && 'is-error')}>{statusText}</p>
          </div>

          <button
            type="button"
            className={cx('zoom-meeting-id')}
            onClick={handleCopyRoomId}
            title="Copy room link"
          >
            {copiedId ? 'Copied link!' : `Room · ${meetingId.slice(0, 12)}`}
          </button>
        </header>

        {/* Main Content */}
        <div
          className={cx(
            'zoom-meeting-content',
            hasScreenShare && 'has-screen-share',
            hasScreenShare && sidePanelOpen && 'has-screen-share-panel'
          )}
        >
          {/* Floating Reactions Layer */}
          <div className={cx('zoom-meeting-reaction-layer')} aria-hidden="true">
            {floatingReactions.map((rx) => (
              <span
                key={rx.id}
                className={cx('zoom-meeting-reaction-float')}
                style={{ '--reaction-x': rx.laneLeft } as React.CSSProperties}
              >
                {rx.emoji}
              </span>
            ))}
          </div>

          {/* Hidden remote audio elements */}
          {Object.entries(audioTracks).map(([sid, track]) => (
            <RemoteAudioTrack key={sid} track={track} />
          ))}

          {/* Video & Screen Share Stage */}
          <div className={cx('zoom-meeting-stage')}>
            {hasScreenShare && (
              <div className={cx('zoom-meeting-share-stage')}>
                <span className={cx('zoom-meeting-share-label')}>
                  {isSharingScreen
                    ? 'You are sharing your screen'
                    : remoteSharingLabel || 'Shared screen'}
                </span>
                <TrackCanvas
                  track={screenShareTrack}
                  contain
                  className={cx('zoom-meeting-share-canvas')}
                />
              </div>
            )}

            <div className={cx('zoom-meeting-video-grid')}>
              {participantList.map((p) => {
                const track = videoTracks[p.sessionId] || null;
                const showVideo = Boolean(track) && (!p.isLocal || isCamOn) && !p.isVideoOff;
                const muted = p.isLocal ? !isMicOn : p.isMuted;
                const camOff = p.isLocal ? !isCamOn : p.isVideoOff;
                return (
                  <div
                    key={p.sessionId}
                    className={cx('zoom-meeting-tile', p.isLocal && 'is-local')}
                  >
                    {showVideo ? (
                      <TrackCanvas track={track} />
                    ) : (
                      <div className={cx('zoom-meeting-avatar')}>
                        {getUserInitials(p.name)}
                      </div>
                    )}

                    {(muted || camOff) && (
                      <div className={cx('zoom-meeting-media-indicators')}>
                        {muted && (
                          <span className={cx('zoom-meeting-media-indicator')} title="Muted">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <line x1="1" y1="1" x2="23" y2="23" />
                              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                            </svg>
                          </span>
                        )}
                        {camOff && (
                          <span className={cx('zoom-meeting-media-indicator')} title="Camera off">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polygon points="23 7 16 12 23 17 23 7" />
                              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                              <line x1="1" y1="1" x2="23" y2="23" />
                            </svg>
                          </span>
                        )}
                      </div>
                    )}

                    <div className={cx('zoom-meeting-participant-name')}>{p.name}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Side Panel (People / Chat / Notes / Actions) */}
          {sidePanelOpen && (
            <aside
              className={cx('zoom-meeting-side-panel', hasScreenShare && 'is-screen-sharing')}
            >
              <div className={cx('zoom-meeting-panel-tabs')}>
                <button
                  type="button"
                  className={activeTab === 'people' ? 'is-active' : undefined}
                  onClick={() => setActiveTab('people')}
                >
                  People ({participantList.length})
                </button>
                <button
                  type="button"
                  className={activeTab === 'chat' ? 'is-active' : undefined}
                  onClick={() => {
                    setActiveTab('chat');
                    setUnreadChatCount(0);
                  }}
                >
                  Chat
                </button>
                <button
                  type="button"
                  className={activeTab === 'notes' ? 'is-active' : undefined}
                  onClick={() => setActiveTab('notes')}
                >
                  Notes
                </button>
                <button
                  type="button"
                  className={activeTab === 'actions' ? 'is-active' : undefined}
                  onClick={() => setActiveTab('actions')}
                >
                  Actions ({actionItems.length})
                </button>
              </div>

              {activeTab === 'people' && (
                <div className={cx('zoom-meeting-panel-pane')}>
                  <h3>In this meeting</h3>
                  <div className={cx('zoom-meeting-participant-list')}>
                    {participantList.map((p) => (
                      <div key={p.sessionId} className={cx('zoom-meeting-person')}>
                        <span className={cx('zoom-meeting-person-avatar')}>
                          {getUserInitials(p.name)}
                        </span>
                        <span className={cx('zoom-meeting-person-name')}>{p.name}</span>
                        <small>{p.isLocal ? 'You' : p.isMuted ? 'Muted' : 'Active'}</small>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'chat' && (
                <div className={cx('zoom-meeting-panel-pane')}>
                  <h3>Meeting chat</h3>
                  <div className={cx('zoom-meeting-chat-messages')}>
                    {!chatMessages.length ? (
                      <p className={cx('zoom-meeting-chat-empty')}>
                        No messages yet. Share a link or note with attendees.
                      </p>
                    ) : (
                      chatMessages.map((m) => (
                        <div key={m.id} className={cx('zoom-meeting-chat-message')}>
                          <strong>{m.senderName}</strong>
                          <p>{m.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                  <form className={cx('zoom-meeting-chat-form')} onSubmit={handleSendChat}>
                    <input
                      type="text"
                      placeholder="Send message to meeting..."
                      value={chatDraft}
                      onChange={(e) => setChatDraft(e.target.value)}
                    />
                    <button type="submit" disabled={sendingChat || !chatDraft.trim()}>
                      Send
                    </button>
                  </form>
                </div>
              )}

              {activeTab === 'notes' && (
                <div className={cx('zoom-meeting-panel-pane')}>
                  <h3>Shared meeting notes</h3>
                  <form className={cx('zoom-meeting-notes-form')} onSubmit={handleSaveNotes}>
                    <textarea
                      placeholder="Capture key decisions, blockers, and follow-ups..."
                      value={notesText}
                      onChange={(e) => setNotesText(e.target.value)}
                    />
                    <div className={cx('zoom-meeting-notes-status', notesError && 'is-error')}>
                      {notesStatus}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button type="submit" disabled={savingNotes}>
                        {savingNotes ? 'Saving...' : 'Save Notes'}
                      </button>
                      <button
                        type="button"
                        className={cx('zoom-meeting-ai-button')}
                        disabled={aiExtracting}
                        onClick={handleExtractAi}
                      >
                        {aiExtracting ? 'Extracting...' : '✨ Extract action items with AI'}
                      </button>
                    </div>
                  </form>

                  {aiSummary && (
                    <div className={cx('zoom-meeting-ai-results')} style={{ marginTop: '12px' }}>
                      {aiSummary.summaryBullets.length > 0 && (
                        <div className={cx('zoom-meeting-ai-section')}>
                          <h4>Summary</h4>
                          <ul>
                            {aiSummary.summaryBullets.map((b, i) => (
                              <li key={i}>{b}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {aiSummary.actionItems.length > 0 && (
                        <div className={cx('zoom-meeting-ai-section')}>
                          <h4>Suggested Action Items</h4>
                          {aiSummary.actionItems.map((ai, i) => (
                            <div key={i} className={cx('zoom-meeting-ai-action')}>
                              <span>{ai.description}</span>
                              {ai.assignee && <small>Suggested: {ai.assignee}</small>}
                              <button
                                type="button"
                                className={cx('zoom-meeting-ai-add-button')}
                                onClick={() => handleAddAiActionItem(ai.description)}
                              >
                                + Add to Actions
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'actions' && (
                <div className={cx('zoom-meeting-panel-pane')}>
                  <h3>Action Items</h3>
                  <div className={cx('zoom-meeting-action-list')}>
                    {!actionItems.length ? (
                      <p className={cx('zoom-meeting-chat-empty')}>
                        No action items yet. Extract them with AI from your meeting notes.
                      </p>
                    ) : (
                      actionItems.map((item) => {
                        const draft = dispatchDrafts[item.actionItemId] || {
                          assigneeUid: item.assigneeUid || '',
                          sprintName: item.sprintName || '',
                          dueDate: item.dueDate || ''
                        };
                        const filteredSprints = draft.assigneeUid
                          ? sprints.filter((s) =>
                              getSprintMemberUids(s).includes(draft.assigneeUid)
                            )
                          : sprints;
                        return (
                          <div key={item.actionItemId} className={cx('zoom-meeting-action-item')}>
                            <p className={cx('zoom-meeting-action-copy')}>{item.description}</p>
                            {item.dispatchedTaskId ? (
                              <span className={cx('zoom-meeting-action-dispatched')}>
                                ✓ Dispatched to Board
                              </span>
                            ) : (
                              <form
                                className={cx('zoom-meeting-action-form')}
                                onSubmit={(e) => handleDispatchActionItem(e, item)}
                              >
                                <select
                                  value={draft.assigneeUid}
                                  onChange={(e) =>
                                    setDispatchDrafts((prev) => ({
                                      ...prev,
                                      [item.actionItemId]: {
                                        ...draft,
                                        assigneeUid: e.target.value
                                      }
                                    }))
                                  }
                                >
                                  <option value="">Assign attendee...</option>
                                  {attendeesForSelect.map((a) => (
                                    <option key={a.firebaseUid || a.email} value={a.firebaseUid || ''}>
                                      {a.name || a.email}
                                    </option>
                                  ))}
                                </select>

                                <input
                                  type="date"
                                  value={draft.dueDate}
                                  onChange={(e) =>
                                    setDispatchDrafts((prev) => ({
                                      ...prev,
                                      [item.actionItemId]: {
                                        ...draft,
                                        dueDate: e.target.value
                                      }
                                    }))
                                  }
                                />

                                {filteredSprints.length > 0 && (
                                  <select
                                    style={{ gridColumn: '1 / -1' }}
                                    value={draft.sprintName}
                                    onChange={(e) =>
                                      setDispatchDrafts((prev) => ({
                                        ...prev,
                                        [item.actionItemId]: {
                                          ...draft,
                                          sprintName: e.target.value
                                        }
                                      }))
                                    }
                                  >
                                    <option value="">No sprint</option>
                                    {filteredSprints.map((s) => (
                                      <option key={s.name} value={s.name}>
                                        {s.name}
                                      </option>
                                    ))}
                                  </select>
                                )}

                                <button
                                  type="submit"
                                  className={cx('zoom-meeting-action-dispatch-button')}
                                  disabled={dispatchingId === item.actionItemId}
                                >
                                  {dispatchingId === item.actionItemId
                                    ? 'Dispatching...'
                                    : 'Dispatch to Board'}
                                </button>
                              </form>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </aside>
          )}
        </div>

        {/* Footer Controls */}
        <footer className={cx('zoom-meeting-footer')}>
          <div className={cx('zoom-meeting-footer-meta')}>
            <time>{formatDurationClock(elapsedSeconds)}</time>
            <span>{meeting.projectName || 'Collab Room'}</span>
          </div>

          <div className={cx('zoom-meeting-controls')}>
            <button
              type="button"
              className={cx('zoom-meeting-control', !isMicOn && 'is-active')}
              onClick={handleToggleMic}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                {!isMicOn && <line x1="1" y1="1" x2="23" y2="23" />}
              </svg>
              <span>{isMicOn ? 'Mute' : 'Unmute'}</span>
            </button>

            <button
              type="button"
              className={cx('zoom-meeting-control', !isCamOn && 'is-active')}
              onClick={handleToggleCam}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="23 7 16 12 23 17 23 7" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                {!isCamOn && <line x1="1" y1="1" x2="23" y2="23" />}
              </svg>
              <span>{isCamOn ? 'Stop Video' : 'Start Video'}</span>
            </button>

            <button
              type="button"
              className={cx('zoom-meeting-control', isSharingScreen && 'is-active')}
              onClick={handleToggleScreenShare}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
              <span>{isSharingScreen ? 'Stop Share' : 'Share'}</span>
            </button>

            <div style={{ position: 'relative' }}>
              <button
                type="button"
                className={cx('zoom-meeting-reaction-button')}
                disabled={sendingReaction}
                title="Send reaction"
                aria-label="Send reaction"
                onClick={() => setReactionPickerOpen((prev) => !prev)}
              >
                😊
              </button>
              {reactionPickerOpen && (
                <div className={cx('zoom-meeting-reaction-picker')}>
                  {REACTION_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      disabled={sendingReaction}
                      onClick={() => handleSendReaction(emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              className={cx('zoom-meeting-control', sidePanelOpen && activeTab === 'chat' && 'is-active')}
              onClick={() => {
                if (sidePanelOpen && activeTab === 'chat') {
                  setSidePanelOpen(false);
                } else {
                  setSidePanelOpen(true);
                  setActiveTab('chat');
                  setUnreadChatCount(0);
                }
              }}
            >
              {unreadChatCount > 0 && (
                <span className={cx('zoom-meeting-chat-count')}>{unreadChatCount}</span>
              )}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span>Chat</span>
            </button>

            <button
              type="button"
              className={cx('zoom-meeting-control', 'is-danger')}
              onClick={handleLeaveOrEnd}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span>{isHost ? 'End' : 'Leave'}</span>
            </button>
          </div>

          <div />
        </footer>
      </div>
    </div>
  );
};

export default MeetingModal;
