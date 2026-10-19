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

function addVideoTile(stage, label, stream, isLocal = false) {
  const tile = element('div', `collab-call-tile${isLocal ? ' is-local' : ''}`)
  const video = element('video', isLocal ? 'collab-call-local' : 'collab-call-remote')
  video.autoplay = true
  video.playsInline = true
  video.muted = isLocal
  video.srcObject = stream || null
  video.setAttribute('aria-label', label)
  const caption = element('span', 'collab-call-tile-label', label)
  tile.append(video, caption)
  stage.append(tile)
  if (stream) video.play().catch(() => {})
  return video
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
    const participantNames = activeCall.participantNames?.map(item => item.name).filter(Boolean) || []
    const title = participantNames.length > 2
      ? `${participantNames[0]} and ${participantNames.length - 1} others`
      : activeCall.peerName || 'Project call'
    const { backdrop, panel } = createDialog(`${activeCall.callType} call`, 'collab-call-dialog collab-call-active')
    const header = element('header', 'collab-call-header')
    const details = element('div', 'collab-call-details')
    details.append(
      element('strong', 'collab-call-name', title),
      element('span', 'collab-call-status', `${activeCall.callType === 'video' ? 'Video' : 'Voice'} · ${
        activeCall.status === 'accepted' ? 'Connecting' : 'Calling'
      }`)
    )
    const controls = element('div', 'collab-call-controls')
    const mute = actionButton('collab-call-control', activeCall.isMuted ? 'Unmute' : 'Mute', () => {
      activeCall.isMuted = !activeCall.isMuted
      activeCall.localStream?.getAudioTracks().forEach(track => { track.enabled = !activeCall.isMuted })
      mute.textContent = activeCall.isMuted ? 'Unmute' : 'Mute'
    })
    controls.append(mute)
    if (activeCall.callType === 'video') {
      const camera = actionButton('collab-call-control', 'Camera off', () => {
        activeCall.isCameraOff = !activeCall.isCameraOff
        activeCall.localStream?.getVideoTracks().forEach(track => { track.enabled = !activeCall.isCameraOff })
        camera.textContent = activeCall.isCameraOff ? 'Camera on' : 'Camera off'
      })
      controls.append(camera)
    }
    controls.append(actionButton('collab-call-hangup', 'Leave call', onHangUp))
    header.append(details, controls)

    const stage = element('div', `collab-call-stage${activeCall.callType === 'video' ? ' is-video' : ' is-audio'}`)
    const remoteStreams = activeCall.remoteStreams instanceof Map
      ? [...activeCall.remoteStreams.entries()]
      : activeCall.remoteStream ? [[activeCall.peerUid, activeCall.remoteStream]] : []
    if (!remoteStreams.length) {
      stage.append(element('div', 'collab-call-empty-stage', activeCall.status === 'accepted' ? 'Waiting for teammates to join' : 'Calling your teammate'))
    } else {
      remoteStreams.forEach(([uid, stream], index) => {
        const participant = activeCall.participantNames?.find(item => item.uid === uid)
        addVideoTile(stage, participant?.name || (index === 0 ? activeCall.peerName : 'Project member'), stream)
      })
    }
    if (activeCall.callType === 'video') addVideoTile(stage, 'You', activeCall.localStream, true)
    panel.append(header, stage)
    root.append(backdrop)
    root.hidden = false
    const firstTile = stage.querySelector('.collab-call-remote')
    const localVideo = stage.querySelector('.collab-call-local')
    return { overlay: backdrop, remoteVideo: firstTile, localVideo }
  }

  if (incomingCall) {
    const { backdrop, panel } = createDialog('Incoming call', 'collab-call-dialog collab-call-incoming')
    const participantCount = Array.isArray(incomingCall.participant_uids) ? incomingCall.participant_uids.length : 2
    panel.append(
      element('div', 'collab-call-incoming-icon', incomingCall.call_type === 'video' ? 'Video' : 'Voice'),
      element('h2', 'collab-call-title', `Incoming ${incomingCall.call_type === 'video' ? 'video' : 'voice'} call`),
      element('p', 'collab-call-description', `${incomingCall.caller_name || 'Project member'}${participantCount > 2 ? ` and ${participantCount - 2} others` : ''}`)
    )
    const actions = element('div', 'collab-call-actions')
    actions.append(actionButton('collab-call-decline', 'Decline', onDecline), actionButton('collab-call-accept', 'Join call', onAccept))
    panel.append(actions)
    root.append(backdrop)
    root.hidden = false
    return { overlay: backdrop }
  }

  if (startingCall) {
    const { backdrop, panel } = createDialog('Starting call', 'collab-call-dialog collab-call-state')
    panel.append(element('span', 'collab-call-spinner'), element('h2', 'collab-call-title', `Starting ${startingCall.callType} call`), element('p', 'collab-call-description', startingCall.status), actionButton('collab-call-secondary', 'Cancel', onCancelSetup))
    root.append(backdrop)
    root.hidden = false
    return { overlay: backdrop }
  }

  if (callError) {
    const { backdrop, panel } = createDialog('Call error', 'collab-call-dialog collab-call-state')
    panel.append(element('h2', 'collab-call-title', callError.title || 'Call could not start'), element('p', 'collab-call-description', callError.message), actionButton('collab-call-secondary', 'Close', onDismissError))
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
