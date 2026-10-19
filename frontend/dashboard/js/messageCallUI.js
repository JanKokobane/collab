// ============================================================
// COLLAB PREMIUM WEBRTC CALLING INTERFACE (VOICE & VIDEO)
// ============================================================

const ICONS = {
  mic: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>`,
  micOff: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" x2="22" y1="2" y2="22"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/><path d="M5 10v2a7 7 0 0 0 12 5"/><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12"/><line x1="12" x2="12" y1="19" y2="22"/></svg>`,
  video: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>`,
  videoOff: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" x2="22" y1="2" y2="22"/><path d="M10.66 6H14a2 2 0 0 1 2 2v2.34l1 0.67 5-3.33v8.66l-3.33-2.22"/><path d="M16 16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2l10 10Z"/></svg>`,
  screen: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/><path d="m9 10 3-3 3 3"/><line x1="12" x2="12" y1="7" y2="13"/></svg>`,
  userPlus: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/></svg>`,
  phoneHangup: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/><line x1="2" x2="22" y1="2" y2="22"/></svg>`,
  phoneIncoming: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/><polyline points="18 2 14 6 18 10"/><line x1="14" x2="22" y1="6" y2="6"/></svg>`,
  project: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
  close: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>`,
  fullscreen: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>`,
  search: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/></svg>`
}

function element(tagName, className = '', text = '') {
  const node = document.createElement(tagName)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

function iconButton(className, svgHtml, title, onClick) {
  const button = element('button', className)
  button.type = 'button'
  button.innerHTML = svgHtml
  button.title = title
  button.setAttribute('aria-label', title)
  button.addEventListener('click', onClick)
  return button
}

function createDialog(label, className = 'collab-call-dialog') {
  const backdrop = element('div', 'collab-call-backdrop')
  const panel = element('section', className)
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-modal', 'true')
  panel.setAttribute('aria-label', label)
  backdrop.append(panel)
  return { backdrop, panel }
}

function getInitials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() || '').join('') || 'U'
}

let callTimerInterval = null

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export function renderCallInterface(root, {
  activeCall,
  incomingCall
}, {
  onHangUp,
  onAccept,
  onDecline,
  onAddParticipant,
  getAvailableProjectMembers,
  projectName = 'Project Workspace'
}) {
  root.replaceChildren()
  if (callTimerInterval) {
    clearInterval(callTimerInterval)
    callTimerInterval = null
  }

  // ============================================================
  // 1. ACTIVE CALL (VOICE OR VIDEO)
  // ============================================================
  if (activeCall) {
    const isVideo = activeCall.callType === 'video'
    const participantNames = activeCall.participantNames?.map(item => item.name).filter(Boolean) || []
    const title = participantNames.length > 2
      ? `${participantNames[0]} and ${participantNames.length - 1} others`
      : activeCall.peerName || 'Team Call'

    const { backdrop, panel } = createDialog(
      `${activeCall.callType} call`,
      `collab-call-dialog collab-call-active ${isVideo ? 'is-video-call' : 'is-audio-call'}`
    )

    // --- HEADER BAR ---
    const header = element('header', 'collab-call-header')

    const headerLeft = element('div', 'collab-call-header-left')
    const projectBadge = element('span', 'collab-call-project-badge')
    projectBadge.innerHTML = `${ICONS.project}<span>${projectName}</span>`

    const titleWrap = element('div', 'collab-call-title-wrap')
    const mainTitle = element('strong', 'collab-call-name', title)

    const timerBadge = element('span', 'collab-call-timer-badge')
    const pulseDot = element('span', 'collab-call-pulse-dot')
    const timerText = element('span', 'collab-call-timer-text', activeCall.status === 'accepted' ? '00:00' : 'Calling…')
    timerBadge.append(pulseDot, timerText)

    titleWrap.append(mainTitle, timerBadge)
    headerLeft.append(projectBadge, titleWrap)

    // Header Right Actions
    const headerRight = element('div', 'collab-call-header-right')

    // Add teammates button
    const addMemberBtn = element('button', 'collab-call-add-btn')
    addMemberBtn.type = 'button'
    addMemberBtn.innerHTML = `${ICONS.userPlus}<span>Add to call</span>`
    addMemberBtn.title = 'Add teammates on this project'

    let isDrawerOpen = false
    addMemberBtn.addEventListener('click', () => {
      isDrawerOpen = !isDrawerOpen
      toggleAddMembersModal(panel, isDrawerOpen)
      addMemberBtn.classList.toggle('active', isDrawerOpen)
    })

    // Fullscreen toggle button
    const fullscreenBtn = iconButton('collab-call-icon-btn', ICONS.fullscreen, 'Toggle Fullscreen', () => {
      if (!document.fullscreenElement) {
        panel.requestFullscreen?.().catch(() => {})
      } else {
        document.exitFullscreen?.().catch(() => {})
      }
    })

    headerRight.append(addMemberBtn, fullscreenBtn)
    header.append(headerLeft, headerRight)

    // Live Call Timer Tracker
    if (!activeCall.connectedStartTime && activeCall.status === 'accepted') {
      activeCall.connectedStartTime = Date.now()
    }
    if (activeCall.status === 'accepted') {
      const startTime = activeCall.connectedStartTime || Date.now()
      callTimerInterval = setInterval(() => {
        const elapsedSecs = Math.max(0, Math.floor((Date.now() - startTime) / 1000))
        timerText.textContent = formatDuration(elapsedSecs)
      }, 1000)
    }

    // --- CALL STAGE ---
    const stage = element('div', `collab-call-stage ${isVideo ? 'is-video' : 'is-audio'}`)
    let remoteVideoTile = null
    let localVideoTile = null

    if (isVideo) {
      // --------------------------------------------------------
      // VIDEO CALL STAGE
      // --------------------------------------------------------
      const videoGrid = element('div', 'collab-call-video-grid')

      const remoteStreams = activeCall.remoteStreams instanceof Map
        ? [...activeCall.remoteStreams.entries()]
        : activeCall.remoteStream ? [[activeCall.peerUid, activeCall.remoteStream]] : []

      if (!remoteStreams.length) {
        // Peer not yet connected or ringing
        const placeholderTile = element('div', 'collab-call-tile collab-call-video-placeholder')
        const avatarRipple = element('div', 'collab-call-ripple-ring')
        const avatar = element('div', 'collab-call-large-avatar', getInitials(activeCall.peerName))
        const statusLabel = element('div', 'collab-call-connecting-label', activeCall.status === 'accepted' ? 'Connecting video stream…' : `Calling ${activeCall.peerName}…`)
        placeholderTile.append(avatarRipple, avatar, statusLabel)
        videoGrid.append(placeholderTile)
      } else {
        // Remote participant video tiles
        remoteStreams.forEach(([uid, stream], index) => {
          const participant = activeCall.participantNames?.find(item => item.uid === uid)
          const pName = participant?.name || (index === 0 ? activeCall.peerName : 'Project Teammate')
          const tile = element('div', 'collab-call-tile collab-call-remote-tile')

          const video = element('video', 'collab-call-remote-video')
          video.autoplay = true
          video.playsInline = true
          video.srcObject = stream || null
          video.setAttribute('aria-label', pName)
          video.play().catch(() => {})

          if (index === 0) remoteVideoTile = video

          const labelBadge = element('div', 'collab-call-tile-badge')
          labelBadge.innerHTML = `<span class="collab-call-badge-dot"></span><span>${pName}</span>`

          tile.append(video, labelBadge)
          videoGrid.append(tile)
        })
      }

      // Local camera tile (Picture-in-picture)
      const localTile = element('div', 'collab-call-local-pip')
      const localVideo = element('video', 'collab-call-local-video')
      localVideo.autoplay = true
      localVideo.playsInline = true
      localVideo.muted = true
      localVideo.srcObject = activeCall.localStream || null
      localVideo.play().catch(() => {})
      localVideoTile = localVideo

      const localBadge = element('div', 'collab-call-local-badge', 'You')
      const cameraOffAvatar = element('div', 'collab-call-pip-avatar', getInitials(activeCall.participantNames?.find(p => p.uid === activeCall.peerUid)?.name || 'You'))
      cameraOffAvatar.style.display = activeCall.isCameraOff ? 'grid' : 'none'

      localTile.append(localVideo, cameraOffAvatar, localBadge)
      stage.append(videoGrid, localTile)
    } else {
      // --------------------------------------------------------
      // AUDIO CALL STAGE
      // --------------------------------------------------------
      const audioStage = element('div', 'collab-call-audio-stage')

      // Get all participants
      const participants = activeCall.participantNames?.length
        ? activeCall.participantNames
        : [{ uid: activeCall.peerUid, name: activeCall.peerName }]

      const participantsContainer = element('div', 'collab-call-audio-participants')

      participants.forEach((p, idx) => {
        const isSelf = p.uid === activeCall.currentUid
        const card = element('div', `collab-call-audio-card ${activeCall.status === 'accepted' ? 'is-active-speaker' : ''}`)

        const avatarWrapper = element('div', 'collab-call-avatar-wrapper')
        const ripple1 = element('div', 'collab-call-ripple-ring ring-1')
        const ripple2 = element('div', 'collab-call-ripple-ring ring-2')
        const avatar = element('div', 'collab-call-audio-avatar', getInitials(p.name))

        avatarWrapper.append(ripple1, ripple2, avatar)

        const name = element('strong', 'collab-call-audio-name', p.name || 'Project Teammate')
        const status = element('span', 'collab-call-audio-status', activeCall.status === 'accepted' ? 'Connected' : 'Calling…')

        // Acoustic waveform animation for active call
        const wave = element('div', 'collab-call-wave-anim')
        for (let i = 0; i < 4; i++) {
          wave.append(element('span', 'collab-call-wave-bar'))
        }

        card.append(avatarWrapper, name, status, wave)
        participantsContainer.append(card)
      })

      audioStage.append(participantsContainer)
      stage.append(audioStage)
    }

    // --- FLOATING CONTROLS DOCK ---
    const controlsDock = element('div', 'collab-call-controls-dock')

    // 1. Microphone Toggle
    const muteBtn = iconButton(
      `collab-call-control-btn ${activeCall.isMuted ? 'is-muted' : ''}`,
      activeCall.isMuted ? ICONS.micOff : ICONS.mic,
      activeCall.isMuted ? 'Unmute microphone' : 'Mute microphone',
      () => {
        activeCall.isMuted = !activeCall.isMuted
        activeCall.localStream?.getAudioTracks().forEach(track => { track.enabled = !activeCall.isMuted })
        muteBtn.innerHTML = activeCall.isMuted ? ICONS.micOff : ICONS.mic
        muteBtn.classList.toggle('is-muted', activeCall.isMuted)
        muteBtn.title = activeCall.isMuted ? 'Unmute microphone' : 'Mute microphone'
      }
    )

    // 2. Camera Toggle
    const cameraBtn = iconButton(
      `collab-call-control-btn ${activeCall.isCameraOff ? 'is-off' : ''}`,
      activeCall.isCameraOff ? ICONS.videoOff : ICONS.video,
      activeCall.isCameraOff ? 'Turn camera on' : 'Turn camera off',
      () => {
        activeCall.isCameraOff = !activeCall.isCameraOff
        activeCall.localStream?.getVideoTracks().forEach(track => { track.enabled = !activeCall.isCameraOff })
        cameraBtn.innerHTML = activeCall.isCameraOff ? ICONS.videoOff : ICONS.video
        cameraBtn.classList.toggle('is-off', activeCall.isCameraOff)
        cameraBtn.title = activeCall.isCameraOff ? 'Turn camera on' : 'Turn camera off'

        const localPipAvatar = stage.querySelector('.collab-call-pip-avatar')
        if (localPipAvatar) {
          localPipAvatar.style.display = activeCall.isCameraOff ? 'grid' : 'none'
        }
      }
    )

    // 3. Screen Share Toggle
    const screenBtn = iconButton(
      `collab-call-control-btn ${activeCall.isScreenSharing ? 'is-active-share' : ''}`,
      ICONS.screen,
      activeCall.isScreenSharing ? 'Stop sharing screen' : 'Share screen',
      async () => {
        if (!navigator.mediaDevices?.getDisplayMedia) return
        if (activeCall.isScreenSharing) {
          activeCall.screenTrack?.stop()
          activeCall.screenTrack = null
          activeCall.isScreenSharing = false
          screenBtn.classList.remove('is-active-share')
          const camTrack = activeCall.localStream?.getVideoTracks()[0]
          if (camTrack && localVideoTile) localVideoTile.srcObject = activeCall.localStream
        } else {
          try {
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: true })
            const track = stream.getVideoTracks()[0]
            activeCall.screenTrack = track
            activeCall.isScreenSharing = true
            screenBtn.classList.add('is-active-share')
            if (localVideoTile) localVideoTile.srcObject = stream
            track.onended = () => {
              activeCall.isScreenSharing = false
              screenBtn.classList.remove('is-active-share')
              if (localVideoTile && activeCall.localStream) localVideoTile.srcObject = activeCall.localStream
            }
          } catch (e) {
            console.log('[messages] Screen share cancelled', e)
          }
        }
      }
    )

    // 4. Add Teammate button
    const addTeammateBtn = iconButton(
      'collab-call-control-btn collab-call-btn-add',
      ICONS.userPlus,
      'Add teammate to call',
      () => {
        isDrawerOpen = !isDrawerOpen
        toggleAddMembersModal(panel, isDrawerOpen)
        addMemberBtn.classList.toggle('active', isDrawerOpen)
      }
    )

    // 5. Leave Call button
    const leaveBtn = element('button', 'collab-call-leave-btn')
    leaveBtn.type = 'button'
    leaveBtn.innerHTML = `${ICONS.phoneHangup}<span>Leave</span>`
    leaveBtn.title = 'Leave call'
    leaveBtn.addEventListener('click', onHangUp)

    controlsDock.append(muteBtn)
    if (isVideo) controlsDock.append(cameraBtn, screenBtn)
    controlsDock.append(addTeammateBtn, leaveBtn)

    // --- ASSEMBLE PANEL ---
    panel.append(header, stage, controlsDock)
    root.append(backdrop)
    root.hidden = false

    // Function to show/hide the in-call member selector modal
    function toggleAddMembersModal(parentPanel, show) {
      let modal = parentPanel.querySelector('.collab-call-add-modal')
      if (!show) {
        modal?.remove()
        return
      }
      if (modal) return

      modal = element('div', 'collab-call-add-modal')

      const modalHeader = element('div', 'collab-call-add-header')
      const modalTitle = element('h3', 'collab-call-add-title', 'Add Project Teammates')
      const closeBtn = iconButton('collab-call-add-close', ICONS.close, 'Close', () => {
        isDrawerOpen = false
        toggleAddMembersModal(parentPanel, false)
        addMemberBtn.classList.remove('active')
      })
      modalHeader.append(modalTitle, closeBtn)

      const modalSub = element('p', 'collab-call-add-sub', `Only members on ${projectName} can join this call.`)

      const searchWrap = element('div', 'collab-call-add-search-wrap')
      searchWrap.innerHTML = ICONS.search
      const searchInput = element('input', 'collab-call-add-input')
      searchInput.type = 'text'
      searchInput.placeholder = 'Search project members…'
      searchWrap.append(searchInput)

      const listContainer = element('div', 'collab-call-add-list')

      function renderMembersList(filter = '') {
        listContainer.replaceChildren()
        const members = typeof getAvailableProjectMembers === 'function'
          ? getAvailableProjectMembers()
          : []

        const searchFilter = filter.trim().toLowerCase()
        const filtered = members.filter(m =>
          !searchFilter ||
          (m.name && m.name.toLowerCase().includes(searchFilter)) ||
          (m.email && m.email.toLowerCase().includes(searchFilter))
        )

        if (!filtered.length) {
          const empty = element('div', 'collab-call-add-empty', members.length === 0 ? 'All project members are already in this call.' : 'No matching project teammates found.')
          listContainer.append(empty)
          return
        }

        filtered.forEach(m => {
          const row = element('div', 'collab-call-add-row')

          const avatar = element('div', 'collab-call-row-avatar', getInitials(m.name || m.email))
          if (m.tone) avatar.classList.add(`avatar-${m.tone}`)

          const info = element('div', 'collab-call-row-info')
          const name = element('strong', 'collab-call-row-name', m.name || m.email)
          const role = element('span', 'collab-call-row-role', m.role || m.email || 'Project member')
          info.append(name, role)

          const inviteBtn = element('button', 'collab-call-row-invite-btn', '+ Add')
          inviteBtn.type = 'button'
          inviteBtn.addEventListener('click', () => {
            inviteBtn.textContent = 'Calling…'
            inviteBtn.disabled = true
            inviteBtn.classList.add('is-inviting')
            if (typeof onAddParticipant === 'function') {
              onAddParticipant(m)
            }
            setTimeout(() => {
              inviteBtn.textContent = 'Invited'
            }, 1200)
          })

          row.append(avatar, info, inviteBtn)
          listContainer.append(row)
        })
      }

      searchInput.addEventListener('input', e => renderMembersList(e.target.value))
      renderMembersList()

      modal.append(modalHeader, modalSub, searchWrap, listContainer)
      parentPanel.append(modal)
    }

    return {
      overlay: backdrop,
      remoteVideo: remoteVideoTile,
      localVideo: localVideoTile
    }
  }

  // ============================================================
  // 2. INCOMING CALL POPUP
  // ============================================================
  if (incomingCall) {
    const isVideo = incomingCall.call_type === 'video'
    const { backdrop, panel } = createDialog(
      'Incoming Call',
      'collab-call-dialog collab-call-incoming-card'
    )

    const rippleWrapper = element('div', 'collab-call-incoming-ripple-wrap')
    const ring1 = element('div', 'collab-call-ripple-ring ring-1')
    const ring2 = element('div', 'collab-call-ripple-ring ring-2')
    const icon = element('div', `collab-call-incoming-avatar ${isVideo ? 'is-video' : 'is-voice'}`)
    icon.innerHTML = isVideo ? ICONS.video : ICONS.phoneIncoming
    rippleWrapper.append(ring1, ring2, icon)

    const title = element('h2', 'collab-call-incoming-title', `Incoming ${isVideo ? 'Video' : 'Voice'} Call`)
    const desc = element(
      'p',
      'collab-call-incoming-desc',
      `${incomingCall.caller_name || 'Project Teammate'} is inviting you to a ${isVideo ? 'video' : 'voice'} call`
    )

    const actions = element('div', 'collab-call-incoming-actions')
    const declineBtn = element('button', 'collab-call-btn-decline')
    declineBtn.type = 'button'
    declineBtn.innerHTML = `${ICONS.phoneHangup}<span>Decline</span>`
    declineBtn.addEventListener('click', onDecline)

    const acceptBtn = element('button', 'collab-call-btn-accept')
    acceptBtn.type = 'button'
    acceptBtn.innerHTML = `${isVideo ? ICONS.video : ICONS.mic}<span>Join Call</span>`
    acceptBtn.addEventListener('click', onAccept)

    actions.append(declineBtn, acceptBtn)
    panel.append(rippleWrapper, title, desc, actions)
    root.append(backdrop)
    root.hidden = false

    return { overlay: backdrop }
  }

  // When neither active nor incoming call is active:
  root.hidden = true
  return null
}

export function clearCallInterface(root) {
  if (callTimerInterval) {
    clearInterval(callTimerInterval)
    callTimerInterval = null
  }
  root.replaceChildren()
  root.hidden = true
}
