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
    const { backdrop, panel } = createDialog(`${activeCall.callType} call`, 'collab-call-dialog collab-call-active')
    const header = element('header', 'collab-call-header')
    const details = element('div', 'collab-call-details')
    details.append(
      element('strong', 'collab-call-name', activeCall.peerName || 'Teammate'),
      element('span', 'collab-call-status', `${activeCall.callType === 'video' ? 'Video' : 'Voice'} · ${
        activeCall.status === 'accepted' ? 'Connecting…' : 'Calling…'
      }`)
    )

    const controls = element('div', 'collab-call-controls')
    const mute = actionButton(
      'collab-call-control',
      activeCall.isMuted ? 'Unmute' : 'Mute',
      () => {
        activeCall.isMuted = !activeCall.isMuted
        activeCall.localStream?.getAudioTracks().forEach(track => {
          track.enabled = !activeCall.isMuted
        })
        mute.textContent = activeCall.isMuted ? 'Unmute' : 'Mute'
        mute.setAttribute('aria-label', activeCall.isMuted ? 'Unmute microphone' : 'Mute microphone')
      }
    )
    mute.setAttribute('aria-label', activeCall.isMuted ? 'Unmute microphone' : 'Mute microphone')
    controls.append(mute)

    if (activeCall.callType === 'video') {
      const camera = actionButton('collab-call-control', 'Camera off', () => {
        activeCall.isCameraOff = !activeCall.isCameraOff
        activeCall.localStream?.getVideoTracks().forEach(track => {
          track.enabled = !activeCall.isCameraOff
        })
        camera.textContent = activeCall.isCameraOff ? 'Camera on' : 'Camera off'
        camera.setAttribute('aria-label', activeCall.isCameraOff ? 'Turn camera on' : 'Turn camera off')
      })
      camera.setAttribute('aria-label', 'Turn camera off')
      controls.append(camera)
    }
    controls.append(actionButton('collab-call-hangup', 'End call', onHangUp))
    header.append(details, controls)

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

    if (activeCall.callType === 'video') {
      stage.append(localVideo)
    } else {
      stage.append(element(
        'div',
        'collab-call-avatar',
        (activeCall.peerName || 'T').trim().charAt(0).toUpperCase()
      ))
    }

    panel.append(header, stage)
    root.append(backdrop)
    root.hidden = false
    remoteVideo.srcObject = activeCall.remoteStream || null
    localVideo.srcObject = activeCall.localStream || null
    return { overlay: backdrop, remoteVideo, localVideo }
  }

  if (incomingCall) {
    const { backdrop, panel } = createDialog('Incoming call', 'collab-call-dialog collab-call-incoming')
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
