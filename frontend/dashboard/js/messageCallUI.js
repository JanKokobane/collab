// ============================================================
// COLLAB WORKSPACE — WEBRTC CALL MODAL & CONTROLS UI
// Styled consistently with the Collab dashboard & messages section
// ============================================================

function createSvgIcon(svgString) {
  const template = document.createElement('template')
  template.innerHTML = svgString.trim()
  return template.content.firstElementChild
}

const ICONS = {
  phone: () => createSvgIcon('<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.2 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.36 1.9.7 2.8a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.84.58 2.8.7a2 2 0 0 1 1.73 2.03Z"/></svg>'),
  phoneOff: () => createSvgIcon('<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.84.58 2.8.7a2 2 0 0 1 1.73 2.03v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91"/><line x1="2" y1="2" x2="22" y2="22"/></svg>'),
  video: () => createSvgIcon('<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>'),
  videoOff: () => createSvgIcon('<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="2" x2="22" y2="22"/><path d="m16 16-6-4"/><path d="m22 8-6 4 6 4V8Z"/><path d="M2 8v8a2 2 0 0 0 2 2h12a2 2 0 0 0 1.41-.59"/><path d="M7 4h9a2 2 0 0 1 2 2v3"/></svg>'),
  mic: () => createSvgIcon('<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>'),
  micOff: () => createSvgIcon('<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="2" x2="22" y2="22"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/><path d="M5 10v2a7 7 0 0 0 12 5"/><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12"/><line x1="12" y1="19" x2="12" y2="22"/></svg>'),
  close: () => createSvgIcon('<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>')
}

function element(tagName, className = '', text = '') {
  const node = document.createElement(tagName)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

function actionButton(className, label, iconSvg, onClick) {
  const button = element('button', className)
  button.type = 'button'
  if (iconSvg) button.append(iconSvg)
  if (label) {
    const textSpan = element('span', 'collab-call-btn-text', label)
    button.append(textSpan)
  }
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
  const clean = (name || '').trim()
  if (!clean) return 'T'
  const parts = clean.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function renderCallInterface(root, {
  activeCall,
  incomingCall,
  startingCall,
  callError
}, {
  onHangUp,
  onAccept,
  onDecline,
  onCancelSetup,
  onDismissError
}) {
  root.replaceChildren()

  // 1. ACTIVE CALL MODAL (VOICE / VIDEO)
  if (activeCall) {
    const isVideo = activeCall.callType === 'video'
    const { backdrop, panel } = createDialog(
      `${activeCall.callType} call with ${activeCall.peerName || 'Teammate'}`,
      `collab-call-dialog collab-call-active ${isVideo ? 'collab-call-video-mode' : 'collab-call-voice-mode'}`
    )

    // Top Header: matching Collab message thread header
    const header = element('header', 'collab-call-header')

    const userProfile = element('div', 'collab-call-user-profile')
    const avatar = element('div', 'collab-call-header-avatar', getInitials(activeCall.peerName))
    const details = element('div', 'collab-call-details')
    const nameEl = element('strong', 'collab-call-name', activeCall.peerName || 'Teammate')
    const statusEl = element('span', 'collab-call-status', `${isVideo ? 'Video' : 'Voice'} · ${
      activeCall.status === 'accepted' ? 'Connected' : 'Calling…'
    }`)

    details.append(nameEl, statusEl)
    userProfile.append(avatar, details)

    // Controls bar
    const controls = element('div', 'collab-call-controls')

    // Mute microphone button
    const muteBtn = actionButton(
      `collab-call-control ${activeCall.isMuted ? 'is-active-off' : ''}`,
      activeCall.isMuted ? 'Unmute' : 'Mute',
      activeCall.isMuted ? ICONS.micOff() : ICONS.mic(),
      () => {
        activeCall.isMuted = !activeCall.isMuted
        activeCall.localStream?.getAudioTracks().forEach(track => {
          track.enabled = !activeCall.isMuted
        })
        muteBtn.replaceChildren(
          activeCall.isMuted ? ICONS.micOff() : ICONS.mic(),
          element('span', 'collab-call-btn-text', activeCall.isMuted ? 'Unmute' : 'Mute')
        )
        muteBtn.classList.toggle('is-active-off', activeCall.isMuted)
        muteBtn.setAttribute('aria-label', activeCall.isMuted ? 'Unmute microphone' : 'Mute microphone')
      }
    )
    muteBtn.setAttribute('aria-label', activeCall.isMuted ? 'Unmute microphone' : 'Mute microphone')
    controls.append(muteBtn)

    // Camera toggle (for video call)
    if (isVideo) {
      const cameraBtn = actionButton(
        `collab-call-control ${activeCall.isCameraOff ? 'is-active-off' : ''}`,
        activeCall.isCameraOff ? 'Camera on' : 'Camera off',
        activeCall.isCameraOff ? ICONS.videoOff() : ICONS.video(),
        () => {
          activeCall.isCameraOff = !activeCall.isCameraOff
          activeCall.localStream?.getVideoTracks().forEach(track => {
            track.enabled = !activeCall.isCameraOff
          })
          cameraBtn.replaceChildren(
            activeCall.isCameraOff ? ICONS.videoOff() : ICONS.video(),
            element('span', 'collab-call-btn-text', activeCall.isCameraOff ? 'Camera on' : 'Camera off')
          )
          cameraBtn.classList.toggle('is-active-off', activeCall.isCameraOff)
          cameraBtn.setAttribute('aria-label', activeCall.isCameraOff ? 'Turn camera on' : 'Turn camera off')
        }
      )
      cameraBtn.setAttribute('aria-label', 'Turn camera off')
      controls.append(cameraBtn)
    }

    // End call button
    const hangupBtn = actionButton(
      'collab-call-hangup',
      'End call',
      ICONS.phoneOff(),
      onHangUp
    )
    hangupBtn.setAttribute('aria-label', 'End call')
    controls.append(hangupBtn)

    header.append(userProfile, controls)

    // Stage area
    const stage = element('div', `collab-call-stage ${isVideo ? 'is-video' : 'is-audio'}`)

    const remoteVideo = element('video', isVideo ? 'collab-call-remote' : 'collab-call-audio')
    remoteVideo.autoplay = true
    remoteVideo.playsInline = true
    remoteVideo.setAttribute('aria-label', 'Remote participant stream')
    stage.append(remoteVideo)

    const localVideo = element('video', 'collab-call-local')
    localVideo.autoplay = true
    localVideo.muted = true
    localVideo.playsInline = true
    localVideo.setAttribute('aria-label', 'Your camera preview')
    localVideo.hidden = !isVideo

    if (isVideo) {
      stage.append(localVideo)
    } else {
      // Voice call stage view: elegant pulsing central avatar
      const voiceCenter = element('div', 'collab-call-voice-center')
      const avatarRings = element('div', 'collab-call-avatar-wrap')
      avatarRings.append(
        element('span', 'collab-call-wave-ring ring-1'),
        element('span', 'collab-call-wave-ring ring-2'),
        element('div', 'collab-call-avatar', getInitials(activeCall.peerName))
      )

      const peerHeading = element('h3', 'collab-call-peer-title', activeCall.peerName || 'Teammate')
      const liveWave = element('div', 'collab-call-wave-bars')
      for (let i = 0; i < 5; i++) {
        liveWave.append(element('span', `wave-bar bar-${i + 1}`))
      }

      voiceCenter.append(avatarRings, peerHeading, liveWave)
      stage.append(voiceCenter)
    }

    panel.append(header, stage)
    root.append(backdrop)
    root.hidden = false

    remoteVideo.srcObject = activeCall.remoteStream || null
    localVideo.srcObject = activeCall.localStream || null

    return { overlay: backdrop, remoteVideo, localVideo }
  }

  // 2. INCOMING CALL MODAL
  if (incomingCall) {
    const isVideo = incomingCall.call_type === 'video'
    const { backdrop, panel } = createDialog('Incoming call', 'collab-call-dialog collab-call-incoming-modal')

    const eyebrow = element('span', 'collab-call-eyebrow', isVideo ? 'INCOMING VIDEO CALL' : 'INCOMING VOICE CALL')
    const avatarWrap = element('div', 'collab-call-incoming-avatar-wrap')
    avatarWrap.append(
      element('span', 'collab-call-wave-ring ring-1'),
      element('div', 'collab-call-incoming-avatar', getInitials(incomingCall.caller_name))
    )

    const title = element('h2', 'collab-call-title', incomingCall.caller_name || 'Teammate')
    const description = element('p', 'collab-call-description', `is calling you for a ${isVideo ? 'video' : 'voice'} conversation.`)

    const actions = element('div', 'collab-call-actions')
    const declineBtn = actionButton('collab-call-decline', 'Decline', ICONS.phoneOff(), onDecline)
    const acceptBtn = actionButton('collab-call-accept', 'Accept', isVideo ? ICONS.video() : ICONS.phone(), onAccept)

    actions.append(declineBtn, acceptBtn)

    panel.append(eyebrow, avatarWrap, title, description, actions)
    root.append(backdrop)
    root.hidden = false
    return { overlay: backdrop }
  }

  // 3. STARTING CALL MODAL
  if (startingCall) {
    const isVideo = startingCall.callType === 'video'
    const { backdrop, panel } = createDialog('Starting call', 'collab-call-dialog collab-call-status-modal')

    const eyebrow = element('span', 'collab-call-eyebrow', isVideo ? 'STARTING VIDEO CALL' : 'STARTING VOICE CALL')
    const spinner = element('div', 'collab-call-spinner-wrap')
    spinner.append(element('span', 'collab-call-spinner'))

    const title = element('h2', 'collab-call-title', startingCall.peerName ? `Calling ${startingCall.peerName}` : 'Starting Call')
    const description = element('p', 'collab-call-description', startingCall.status || 'Connecting to call service…')

    const cancelBtn = actionButton('collab-call-secondary full-width', 'Cancel', null, onCancelSetup)

    panel.append(eyebrow, spinner, title, description, cancelBtn)
    root.append(backdrop)
    root.hidden = false
    return { overlay: backdrop }
  }

  // 4. CALL ERROR MODAL
  if (callError) {
    const { backdrop, panel } = createDialog('Call notice', 'collab-call-dialog collab-call-status-modal collab-call-error-modal')

    const eyebrow = element('span', 'collab-call-eyebrow error-eyebrow', 'CALL NOTICE')
    const iconWrap = element('div', 'collab-call-error-icon-wrap')
    iconWrap.append(ICONS.phoneOff())

    const title = element('h2', 'collab-call-title', callError.title || 'Call ended')
    const description = element('p', 'collab-call-description', callError.message || 'The call could not be completed.')

    const closeBtn = actionButton('collab-call-secondary full-width', 'Close', null, onDismissError)

    panel.append(eyebrow, iconWrap, title, description, closeBtn)
    root.append(backdrop)
    root.hidden = false
    return { overlay: backdrop }
  }

  root.hidden = true
  return null
}

export function clearCallInterface(root) {
  root.replaceChildren()
  root.hidden = true
}
