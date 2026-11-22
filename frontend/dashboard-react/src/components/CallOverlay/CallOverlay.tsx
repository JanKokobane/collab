import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getAvatarSource, getUserInitials, useDashboard } from '../../context/DashboardContext';
import { type RemotePeerMedia, useMessagesCall } from '../../context/MessagesCallContext';
import { createClassNames } from '../../utils/cx';
import messagesStyles from '../Messages/Messages.module.css';
import styles from './CallOverlay.module.css';

const cx = createClassNames(styles);
const mx = createClassNames(messagesStyles);

const MAX_CALL_PARTICIPANTS = 4;

function formatCallDuration(totalSeconds = 0): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hours > 0) {
    return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

const StreamVideo: React.FC<{
  stream: MediaStream | null;
  muted?: boolean;
  className?: string;
}> = ({ stream, muted = false, className }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }
    if (stream) {
      el.play().catch(() => {});
    }
  }, [stream]);

  return <video ref={videoRef} autoPlay playsInline muted={muted} className={className} />;
};

const StreamAudio: React.FC<{ stream: MediaStream | null }> = ({ stream }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }
    if (stream) {
      el.play().catch(() => {});
    }
  }, [stream]);

  return <audio ref={audioRef} autoPlay playsInline className={cx('collab-call-audio')} />;
};

export const CallOverlay: React.FC = () => {
  const { currentUser, firebaseUser, projects } = useDashboard();
  const {
    activeCall,
    incomingCall,
    startingCall,
    callError,
    dismissCallError,
    localStream,
    remotePeers,
    teammates,
    acceptIncomingCall,
    declineIncomingCall,
    hangUpCall,
    toggleMute,
    toggleCamera,
    inviteToCall
  } = useMessagesCall();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteProjectFilter, setInviteProjectFilter] = useState('all');
  const [inviteSearch, setInviteSearch] = useState('');
  const [inviteSelectedUids, setInviteSelectedUids] = useState<string[]>([]);
  const [inviteSending, setInviteSending] = useState(false);

  const currentUid = firebaseUser?.uid || currentUser?.uid || '';

  useEffect(() => {
    if (!activeCall) {
      setInviteOpen(false);
      setInviteSelectedUids([]);
    }
  }, [activeCall]);

  // Filter invite candidates not yet in the call
  const existingUids = useMemo(() => {
    const set = new Set<string>([currentUid]);
    (activeCall?.call.participants || []).forEach((p) => set.add(p.firebaseUid));
    remotePeers.forEach((p) => set.add(p.firebaseUid));
    return set;
  }, [activeCall, currentUid, remotePeers]);

  const inviteProjectMemberUids = useMemo(() => {
    if (inviteProjectFilter === 'all') return null;
    const project = projects.find((p) => p.projectId === inviteProjectFilter);
    if (!project) return null;
    const uids = new Set<string>();
    if (project.creatorFirebaseUid) uids.add(project.creatorFirebaseUid);
    (project.acceptedMembers || []).forEach((m) => {
      const uid = m.firebaseUid || m.firebase_uid || m.uid;
      if (uid) uids.add(uid);
    });
    return uids;
  }, [inviteProjectFilter, projects]);

  const filteredInviteTeammates = useMemo(() => {
    const q = inviteSearch.trim().toLowerCase();
    return teammates.filter((t) => {
      if (existingUids.has(t.firebaseUid)) return false;
      if (inviteProjectMemberUids && !inviteProjectMemberUids.has(t.firebaseUid)) return false;
      return !q || t.name.toLowerCase().includes(q) || t.email.toLowerCase().includes(q);
    });
  }, [teammates, existingUids, inviteProjectMemberUids, inviteSearch]);

  const remainingSlots = Math.max(0, MAX_CALL_PARTICIPANTS - existingUids.size);

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteSelectedUids.length || inviteSending) return;
    setInviteSending(true);
    try {
      await inviteToCall(inviteSelectedUids);
      setInviteOpen(false);
      setInviteSelectedUids([]);
    } finally {
      setInviteSending(false);
    }
  };

  const hasVisibleOverlay = Boolean(activeCall || incomingCall || startingCall || callError);
  const callType = activeCall?.call.callType || 'audio';
  const isVideoCall = callType === 'video';
  const isMultiPeer = remotePeers.length > 1 || (activeCall?.call.participants?.length || 0) > 2;

  const renderAvatar = (profileImage?: string, initials = 'TM') =>
    profileImage ? (
      <img
        src={profileImage}
        alt=""
        className={cx('collab-call-profile-image')}
      />
    ) : (
      <span>{initials}</span>
    );

  return (
    <div id="messages-call-root" className={cx('collab-call-portal')} hidden={!hasVisibleOverlay}>
      {hasVisibleOverlay && (
        <div className={cx('collab-call-backdrop')}>
          {/* Error Overlay */}
          {callError && !activeCall && !incomingCall && !startingCall && (
            <div className={cx('collab-call-dialog', 'collab-call-state')} role="alertdialog" aria-modal="true">
              <h2 className={cx('collab-call-title')}>Call unavailable</h2>
              <p className={cx('collab-call-description')}>{callError}</p>
              <div className={cx('collab-call-actions')}>
                <button
                  type="button"
                  className={cx('collab-call-secondary')}
                  onClick={dismissCallError}
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {/* Outgoing Starting Spinner */}
          {startingCall && !activeCall && (
            <div className={cx('collab-call-dialog', 'collab-call-state')} role="dialog" aria-modal="true">
              <div className={cx('collab-call-spinner')} aria-hidden="true" />
              <h2 className={cx('collab-call-title')}>
                Starting {startingCall.callType === 'video' ? 'video' : 'audio'} call...
              </h2>
              <p className={cx('collab-call-description')}>{startingCall.conversationName}</p>
              <div className={cx('collab-call-actions')}>
                <button
                  type="button"
                  className={cx('collab-call-decline')}
                  onClick={hangUpCall}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Incoming Ringing Dialog */}
          {incomingCall && !activeCall && !startingCall && (
            <div className={cx('collab-call-dialog', 'collab-call-incoming')} role="dialog" aria-modal="true">
              <div className={cx('collab-call-incoming-avatar')}>
                {renderAvatar(
                  incomingCall.initiatorAvatar,
                  getUserInitials(incomingCall.initiatorName)
                )}
              </div>
              <h2 className={cx('collab-call-title')}>
                Incoming {incomingCall.callType === 'video' ? 'video' : 'voice'} call
              </h2>
              <p className={cx('collab-call-description')}>
                {incomingCall.initiatorName}
                {incomingCall.conversationName ? ` · ${incomingCall.conversationName}` : ''}
              </p>
              <div className={cx('collab-call-actions')}>
                <button
                  type="button"
                  className={cx('collab-call-decline')}
                  onClick={declineIncomingCall}
                >
                  Decline
                </button>
                <button
                  type="button"
                  className={cx('collab-call-accept')}
                  onClick={acceptIncomingCall}
                >
                  Accept
                </button>
              </div>
            </div>
          )}

          {/* Active Call Stage */}
          {activeCall && (
            <div
              className={cx('collab-call-dialog', 'collab-call-active')}
              role="dialog"
              aria-modal="true"
              aria-label="Active call"
            >
              <header className={cx('collab-call-header')}>
                <div className={cx('collab-call-details')}>
                  <strong className={cx('collab-call-name')}>
                    {activeCall.call.conversationName || activeCall.call.initiatorName || 'Collab Call'}
                  </strong>
                  <span className={cx('collab-call-status')}>
                    {isVideoCall ? 'Video call' : 'Voice call'} · {activeCall.statusText}
                  </span>
                  {activeCall.startedAtMs && (
                    <span className={cx('collab-call-duration')}>
                      {formatCallDuration(activeCall.elapsedSeconds)}
                    </span>
                  )}
                </div>
              </header>

              <div className={cx('collab-call-stage', isVideoCall ? 'is-video' : 'is-audio')}>
                {isVideoCall ? (
                  isMultiPeer ? (
                    <div className={cx('collab-call-participants', 'is-video')}>
                      <div className={cx('collab-call-participant-tile')}>
                        {!activeCall.isCameraOff && localStream ? (
                          <StreamVideo
                            stream={localStream}
                            muted
                            className={cx('collab-call-participant-video')}
                          />
                        ) : (
                          <div className={cx('collab-call-participant-avatar')}>
                            {renderAvatar(
                              getAvatarSource(currentUser),
                              getUserInitials(currentUser.name)
                            )}
                          </div>
                        )}
                        <span className={cx('collab-call-participant-name')}>
                          {currentUser.name} (You)
                        </span>
                      </div>

                      {remotePeers.map((peer: RemotePeerMedia) => {
                        const hasVideo =
                          Boolean(peer.stream?.getVideoTracks().some((t) => t.enabled)) &&
                          !peer.isCameraOff;
                        return (
                          <div key={peer.firebaseUid} className={cx('collab-call-participant-tile')}>
                            {hasVideo && peer.stream ? (
                              <StreamVideo
                                stream={peer.stream}
                                className={cx('collab-call-participant-video')}
                              />
                            ) : (
                              <>
                                <StreamAudio stream={peer.stream} />
                                <div className={cx('collab-call-participant-avatar')}>
                                  {renderAvatar(peer.profileImage, peer.initials)}
                                </div>
                              </>
                            )}
                            <span className={cx('collab-call-participant-name')}>{peer.name}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <>
                      <div className={cx('collab-call-remote')}>
                        {remotePeers[0]?.stream &&
                        remotePeers[0].stream.getVideoTracks().some((t) => t.enabled) &&
                        !remotePeers[0].isCameraOff ? (
                          <StreamVideo stream={remotePeers[0].stream} />
                        ) : (
                          <>
                            <StreamAudio stream={remotePeers[0]?.stream || null} />
                            <div className={cx('collab-call-video-placeholder')}>
                              <div className={cx('collab-call-video-avatar')}>
                                {renderAvatar(
                                  remotePeers[0]?.profileImage,
                                  remotePeers[0]?.initials ||
                                    getUserInitials(activeCall.call.conversationName || 'C')
                                )}
                              </div>
                              <span>
                                {remotePeers[0]?.name || activeCall.call.conversationName || 'Connecting...'}
                              </span>
                            </div>
                          </>
                        )}
                      </div>

                      <div className={cx('collab-call-local')} hidden={activeCall.isCameraOff}>
                        <StreamVideo stream={localStream} muted />
                      </div>
                    </>
                  )
                ) : (
                  <div className={cx('collab-call-participants', 'is-audio')}>
                    {remotePeers.length > 0 ? (
                      remotePeers.map((peer) => (
                        <div key={peer.firebaseUid} className={cx('collab-call-audio-participant')}>
                          <StreamAudio stream={peer.stream} />
                          <div className={cx('collab-call-audio-avatar')}>
                            {renderAvatar(peer.profileImage, peer.initials)}
                          </div>
                          <span className={cx('collab-call-participant-name')}>{peer.name}</span>
                        </div>
                      ))
                    ) : (
                      <div className={cx('collab-call-avatar')}>
                        {renderAvatar(
                          activeCall.call.initiatorAvatar,
                          getUserInitials(activeCall.call.conversationName || 'C')
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className={cx('collab-call-controls')}>
                  <button
                    type="button"
                    className={cx('collab-call-control', activeCall.isMuted && 'is-active')}
                    aria-label={activeCall.isMuted ? 'Unmute microphone' : 'Mute microphone'}
                    title={activeCall.isMuted ? 'Unmute' : 'Mute'}
                    onClick={toggleMute}
                  >
                    {activeCall.isMuted ? (
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <line x1="1" y1="1" x2="23" y2="23" />
                        <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                        <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                        <line x1="12" y1="19" x2="12" y2="23" />
                      </svg>
                    )}
                  </button>

                  {isVideoCall && (
                    <button
                      type="button"
                      className={cx('collab-call-control', activeCall.isCameraOff && 'is-active')}
                      aria-label={activeCall.isCameraOff ? 'Turn camera on' : 'Turn camera off'}
                      title={activeCall.isCameraOff ? 'Camera on' : 'Camera off'}
                      onClick={toggleCamera}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <polygon points="23 7 16 12 23 17 23 7" />
                        <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                        {activeCall.isCameraOff && <line x1="1" y1="1" x2="23" y2="23" />}
                      </svg>
                    </button>
                  )}

                  {activeCall.canInvite && remainingSlots > 0 && (
                    <button
                      type="button"
                      className={cx('collab-call-control')}
                      aria-label="Add people to call"
                      title="Add people to call"
                      onClick={() => {
                        setInviteSelectedUids([]);
                        setInviteSearch('');
                        setInviteProjectFilter(activeCall.call.projectId || 'all');
                        setInviteOpen(true);
                      }}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="8.5" cy="7" r="4" />
                        <line x1="20" y1="8" x2="20" y2="14" />
                        <line x1="23" y1="11" x2="17" y2="11" />
                      </svg>
                    </button>
                  )}

                  <button
                    type="button"
                    className={cx('collab-call-hangup')}
                    aria-label="End call"
                    title="End call"
                    onClick={hangUpCall}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Call Invite Modal (Add people to call, max 4 total) */}
          {inviteOpen && activeCall && (
            <div
              className={`modal-backdrop ${mx('messages-call-invite-backdrop')}`}
              onClick={() => {
                if (!inviteSending) setInviteOpen(false);
              }}
            >
              <form
                className={`modal ${mx('messages-forward-modal')} ${mx('messages-call-invite-modal')}`}
                onClick={(e) => e.stopPropagation()}
                onSubmit={handleInviteSubmit}
              >
                <div className={mx('messages-forward-header')}>
                  <button
                    type="button"
                    className={mx('messages-forward-cancel')}
                    onClick={() => setInviteOpen(false)}
                  >
                    Cancel
                  </button>
                  <h2>Add People to Call</h2>
                  <span className={mx('messages-forward-selection-count')}>
                    {inviteSelectedUids.length}/{remainingSlots}
                  </span>
                </div>

                {projects.length > 0 && (
                  <div className={mx('messages-call-project-control')}>
                    <label htmlFor="call-invite-project-select">Filter by project</label>
                    <select
                      id="call-invite-project-select"
                      className={mx('messages-call-project-select')}
                      value={inviteProjectFilter}
                      onChange={(e) => setInviteProjectFilter(e.target.value)}
                    >
                      <option value="all">All workspace teammates</option>
                      {projects.map((p) => (
                        <option key={p.projectId} value={p.projectId}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <label className={mx('messages-forward-search')}>
                  <span>🔍</span>
                  <input
                    type="search"
                    placeholder="Search teammates..."
                    value={inviteSearch}
                    onChange={(e) => setInviteSearch(e.target.value)}
                  />
                </label>

                <div className={mx('messages-forward-list')}>
                  {!filteredInviteTeammates.length ? (
                    <p className={mx('messages-forward-empty')}>
                      No eligible teammates available to invite.
                    </p>
                  ) : (
                    filteredInviteTeammates.map((mate) => {
                      const selected = inviteSelectedUids.includes(mate.firebaseUid);
                      const disabled = !selected && inviteSelectedUids.length >= remainingSlots;
                      return (
                        <label
                          key={mate.firebaseUid}
                          className={mx('messages-forward-recipient', selected && 'selected')}
                        >
                          <span className={mx('messages-forward-avatar')}>{mate.initials}</span>
                          <span className={mx('messages-forward-recipient-details')}>
                            <strong>{mate.name}</strong>
                            <small>{mate.isOnline ? 'Online' : mate.role}</small>
                          </span>
                          <input
                            type="checkbox"
                            checked={selected}
                            disabled={disabled}
                            onChange={() =>
                              setInviteSelectedUids((prev) =>
                                prev.includes(mate.firebaseUid)
                                  ? prev.filter((id) => id !== mate.firebaseUid)
                                  : prev.length < remainingSlots
                                    ? [...prev, mate.firebaseUid]
                                    : prev
                              )
                            }
                          />
                        </label>
                      );
                    })
                  )}
                </div>

                <div className={mx('messages-forward-footer')}>
                  <span className={mx('messages-forward-selected')}>
                    Up to {MAX_CALL_PARTICIPANTS} participants total
                  </span>
                  <button
                    type="submit"
                    className={`primary-button ${mx('messages-forward-submit')}`}
                    disabled={!inviteSelectedUids.length || inviteSending}
                  >
                    {inviteSending ? 'Inviting...' : 'Invite'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CallOverlay;
