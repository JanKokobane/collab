function element(tagName, className = '', text = '') {
  const node = document.createElement(tagName)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

function actionButton(className, label, onClick) {
  const button = element('button', className, label)
  button.type = 'button'
  button.addEventListener('click', onClick)
  return button
}

function callIcon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  const paths = {
    microphone: ['M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z', 'M19 10v1a7 7 0 0 1-14 0v-1', 'M12 18v4', 'M8 22h8'],
    microphoneOff: ['M9 9v2a3 3 0 0 0 5.12 2.12', 'M15 9V5a3 3 0 0 0-5.76-1.16', 'M19 10v1a7 7 0 0 1-1.6 4.47', 'M5 10v1a7 7 0 0 0 11.95 5.05', 'M12 18v4', 'M8 22h8', 'm2 2 20 20'],
    camera: ['M14 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2l6 4V5l-6 4V7a2 2 0 0 0-2-2Z'],
    cameraOff: ['m2 2 20 20', 'M10.6 5H14a2 2 0 0 1 2 2v2l6-4v14l-6-4v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2.6'],
    hangup: ['M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.14 4.2 2 2 0 0 1 4.13 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.63a2 2 0 0 1-.45 2.11L8.03 9.73a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.85.29 1.73.5 2.63.62A2 2 0 0 1 22 16.92z']
  }
  paths[name].forEach(pathData => {
    const path = document.createElementNS(svg.namespaceURI, 'path')
    path.setAttribute('d', pathData)
    svg.append(path)
  })
  return svg
}

function iconActionButton(className, label, iconName, onClick) {
  const button = actionButton(className, '', onClick)
  button.setAttribute('aria-label', label)
  button.title = label
  button.append(callIcon(iconName))
  return button
}

function appendParticipantAvatar(container, className, profileImage = '') {
  const avatar = element('div', className)
  avatar.setAttribute('aria-hidden', 'true')
  if (profileImage) {
    const image = element('img', 'collab-call-profile-image')
    image.src = profileImage
    image.alt = ''
    image.decoding = 'async'
    avatar.append(image)
    container.append(avatar)
    return avatar
  }
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 64 64')
  const head = document.createElementNS(svg.namespaceURI, 'circle')
  head.setAttribute('cx', '32')
  head.setAttribute('cy', '22')
  head.setAttribute('r', '12')
  const shoulders = document.createElementNS(svg.namespaceURI, 'path')
  shoulders.setAttribute('d', 'M10 58c1-14 10-22 22-22s21 8 22 22')
  svg.append(head, shoulders)
  avatar.append(svg)
  container.append(avatar)
  return avatar
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

  if (activeCall) {
    const { backdrop, panel } = createDialog(
      `${activeCall.callType} call`,
      `collab-call-dialog collab-call-active is-${activeCall.callType}`
    )
    const header = element('header', 'collab-call-header')
    const details = element('div', 'collab-call-details')
    details.append(
      element('strong', 'collab-call-name', activeCall.peerName || 'Teammate'),
      element('span', 'collab-call-status', `${activeCall.callType === 'video' ? 'Video' : 'Voice'} · ${
        activeCall.status === 'accepted' ? 'Connecting…' : 'Calling…'
      }`),
      element('time', 'collab-call-duration', '00:00')
    )

    header.append(details)

    const stage = element(
      'div',
      `collab-call-stage${activeCall.callType === 'video' ? ' is-video' : ' is-audio'}`
    )
    const remoteVideo = element('video', activeCall.callType === 'video' ? 'collab-call-remote' : 'collab-call-audio')
    remoteVideo.autoplay = true
    remoteVideo.playsInline = true
    remoteVideo.setAttribute('aria-label', 'Remote participant')
    const localVideo = element('video', 'collab-call-local')
    localVideo.autoplay = true
    localVideo.muted = true
    localVideo.playsInline = true
    localVideo.setAttribute('aria-label', 'Your camera preview')
    localVideo.hidden = activeCall.callType !== 'video'
    stage.append(remoteVideo)
    let videoPlaceholder = null

    if (activeCall.callType === 'video') {
      videoPlaceholder = element('div', 'collab-call-video-placeholder')
      appendParticipantAvatar(videoPlaceholder, 'collab-call-video-avatar', activeCall.peerProfileImage)
      videoPlaceholder.append(element('span', '', activeCall.status === 'ringing' ? 'Ringing…' : 'Connecting video…'))
      stage.append(localVideo)
      stage.append(videoPlaceholder)
    } else {
      appendParticipantAvatar(stage, 'collab-call-avatar', activeCall.peerProfileImage)
    }

    const controls = element('div', 'collab-call-controls')
    const mute = iconActionButton(
      `collab-call-control${activeCall.isMuted ? ' is-active' : ''}`,
      activeCall.isMuted ? 'Unmute microphone' : 'Mute microphone',
      activeCall.isMuted ? 'microphoneOff' : 'microphone',
      () => {
        activeCall.isMuted = !activeCall.isMuted
        activeCall.localStream?.getAudioTracks().forEach(track => {
          track.enabled = !activeCall.isMuted
        })
        mute.classList.toggle('is-active', activeCall.isMuted)
        mute.setAttribute('aria-label', activeCall.isMuted ? 'Unmute microphone' : 'Mute microphone')
        mute.title = activeCall.isMuted ? 'Unmute microphone' : 'Mute microphone'
        mute.replaceChildren(callIcon(activeCall.isMuted ? 'microphoneOff' : 'microphone'))
      }
    )
    controls.append(mute)

    if (activeCall.callType === 'video') {
      const camera = iconActionButton(
        `collab-call-control${activeCall.isCameraOff ? ' is-active' : ''}`,
        activeCall.isCameraOff ? 'Turn camera on' : 'Turn camera off',
        activeCall.isCameraOff ? 'cameraOff' : 'camera',
        () => {
          activeCall.isCameraOff = !activeCall.isCameraOff
          activeCall.localStream?.getVideoTracks().forEach(track => {
            track.enabled = !activeCall.isCameraOff
          })
          camera.classList.toggle('is-active', activeCall.isCameraOff)
          camera.setAttribute('aria-label', activeCall.isCameraOff ? 'Turn camera on' : 'Turn camera off')
          camera.title = activeCall.isCameraOff ? 'Turn camera on' : 'Turn camera off'
          camera.replaceChildren(callIcon(activeCall.isCameraOff ? 'cameraOff' : 'camera'))
        }
      )
      controls.append(camera)
    }
    controls.append(iconActionButton('collab-call-hangup', 'End call', 'hangup', onHangUp))
    stage.append(controls)
    panel.append(header, stage)
    root.append(backdrop)
    root.hidden = false
    remoteVideo.srcObject = activeCall.remoteStream || null
    localVideo.srcObject = activeCall.localStream || null
    if (videoPlaceholder) {
      videoPlaceholder.hidden = Boolean(
        activeCall.remoteStream?.getVideoTracks().some(track => track.readyState === 'live')
      )
    }
    return { overlay: backdrop, remoteVideo, localVideo, videoPlaceholder }
  }

  if (incomingCall) {
    const { backdrop, panel } = createDialog('Incoming call', 'collab-call-dialog collab-call-incoming')
    appendParticipantAvatar(panel, 'collab-call-incoming-avatar', incomingCall.caller_profile_image)
    panel.append(
      element('h2', 'collab-call-title', `Incoming ${incomingCall.call_type === 'video' ? 'video' : 'voice'} call`),
      element('p', 'collab-call-description', incomingCall.caller_name || 'Teammate')
    )
    const actions = element('div', 'collab-call-actions')
    actions.append(
      actionButton('collab-call-decline', 'Decline', onDecline),
      actionButton('collab-call-accept', 'Accept', onAccept)
    )
    panel.append(actions)
    root.append(backdrop)
    root.hidden = false
    return { overlay: backdrop }
  }

  if (startingCall) {
    const { backdrop, panel } = createDialog('Starting call', 'collab-call-dialog collab-call-state')
    const spinner = element('span', 'collab-call-spinner')
    spinner.setAttribute('aria-hidden', 'true')
    panel.append(
      spinner,
      element('h2', 'collab-call-title', `Starting ${startingCall.callType} call`),
      element('p', 'collab-call-description', startingCall.status),
      actionButton('collab-call-secondary', 'Cancel', onCancelSetup)
    )
    root.append(backdrop)
    root.hidden = false
    return { overlay: backdrop }
  }

  if (callError) {
    const { backdrop, panel } = createDialog('Call error', 'collab-call-dialog collab-call-state')
    panel.append(
      element('h2', 'collab-call-title', callError.title || 'Call could not start'),
      element('p', 'collab-call-description', callError.message),
      ...(callError.diagnosticId
        ? [element('small', 'collab-call-reference', `Reference: ${callError.diagnosticId}`)]
        : []),
      actionButton('collab-call-secondary', 'Close', onDismissError)
    )
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
