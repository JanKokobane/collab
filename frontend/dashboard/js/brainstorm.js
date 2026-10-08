import { currentUser, addAuditLog, pushNotification, make, root, closeModal } from './state.js'

export const defaultStickyNotes = [
  { id: 'sn-1', category: 'Ideas', content: 'Add live cursor presence and avatars to task detail dialog for real-time co-editing.', author: 'Sam Kim', color: 'yellow', upvotes: 6, userUpvoted: false },
  { id: 'sn-2', category: 'Blockers', content: 'Staging environment WebSocket connections dropping intermittently under load test.', author: 'Elena Rostova', color: 'rose', upvotes: 4, userUpvoted: true },
  { id: 'sn-3', category: 'Wins', content: 'Dark mode contrast ratios audited and 100% compliant with WCAG AAA accessibility standards!', author: 'Alex Morgan', color: 'green', upvotes: 9, userUpvoted: false },
  { id: 'sn-4', category: 'Goals', content: 'Ship v2.4 Release Candidate to production before Friday afternoon code freeze.', author: 'Jordan Lee', color: 'blue', upvotes: 5, userUpvoted: false }
]

export let stickyNotes = JSON.parse(localStorage.getItem('collab_sticky_notes') || 'null') || defaultStickyNotes

export function saveStickyNotes() {
  localStorage.setItem('collab_sticky_notes', JSON.stringify(stickyNotes))
}

export let stickyLinks = JSON.parse(localStorage.getItem('collab_sticky_links') || 'null') || []
let stickyLinkMode = false
let pendingStickyLinkId = null
let selectedStickyLinkId = null
let brainstormDirty = false
const stickyLinkTypes = {
  related: { label: 'Related', color: '#526675', width: 2, markerStart: true, markerEnd: true },
  'leads-to': { label: 'Leads to', color: '#16806F', width: 2.5, markerEnd: true },
  supports: { label: 'Supports', color: '#47835F', width: 2, dash: '5 4', markerEnd: true },
  sequence: { label: 'Sequence', color: '#4E78A5', width: 2, markerStart: true, markerEnd: true }
}

export function saveStickyLinks() {
  localStorage.setItem('collab_sticky_links', JSON.stringify(stickyLinks))
}

function markBrainstormDirty() {
  brainstormDirty = true
  const saveButton = document.querySelector('#save-brainstorm-btn')
  const saveStatus = document.querySelector('#brainstorm-save-status')
  if (saveButton) saveButton.disabled = false
  if (saveStatus) saveStatus.textContent = 'Unsaved changes'
}

function saveBrainstormBoard() {
  saveStickyNotes()
  saveStickyLinks()
  brainstormDirty = false
  const saveButton = document.querySelector('#save-brainstorm-btn')
  const saveStatus = document.querySelector('#brainstorm-save-status')
  if (saveButton) saveButton.disabled = true
  if (saveStatus) saveStatus.textContent = 'Saved'
}

const initialMindmapPositions = [
  { x: 120, y: 110 },
  { x: 460, y: 90 },
  { x: 120, y: 330 },
  { x: 460, y: 330 }
]

const previousMindmapPositions = [
  { x: 120, y: 110 },
  { x: 460, y: 90 },
  { x: 120, y: 400 },
  { x: 460, y: 400 }
]

function defaultMindmapPosition(index) {
  if (initialMindmapPositions[index]) return { ...initialMindmapPositions[index] }
  const additionalIndex = index - initialMindmapPositions.length
  return { x: 145 + (additionalIndex % 4) * 300, y: 560 + Math.floor(additionalIndex / 4) * 175 }
}

export function renderStickyNotes() {
  const container = document.querySelector('#sticky-notes-grid')
  if (!container) return
  const linkLayer = container.querySelector('#sticky-link-layer')
  container.replaceChildren()
  if (linkLayer) container.append(linkLayer)
  const needsPositionReset = localStorage.getItem('collab_sticky_mindmap_layout') !== '2'
  let positionedNotes = false
  stickyNotes.forEach((note, index) => {
    const previousPosition = previousMindmapPositions[index]
    const isPreviousDefault = previousPosition && note.position?.x === previousPosition.x && note.position?.y === previousPosition.y
    if (needsPositionReset || !note.position || isPreviousDefault) {
      note.position = defaultMindmapPosition(index)
      positionedNotes = true
    }
  })
  if (needsPositionReset) localStorage.setItem('collab_sticky_mindmap_layout', '2')

  stickyNotes.forEach(note => {
    const card = make('article', `sticky-note-card ${note.color || 'yellow'}`)
    card.dataset.noteId = note.id
    card.tabIndex = 0
    card.setAttribute('aria-label', `${note.category} idea by ${note.author}`)
    card.style.left = `${note.position.x}px`
    card.style.top = `${note.position.y}px`
    card.classList.toggle('link-source', pendingStickyLinkId === note.id)
    card.addEventListener('click', event => {
      if (stickyLinkMode && !event.target.closest('button')) selectStickyLinkNote(note.id)
    })
    card.addEventListener('pointerdown', event => {
      if (stickyLinkMode || event.target.closest('button') || (event.pointerType === 'mouse' && event.button !== 0)) return
      card.setPointerCapture(event.pointerId)
      card.dataset.dragPointer = event.pointerId
      card.dataset.dragStartX = event.clientX
      card.dataset.dragStartY = event.clientY
      card.dataset.noteStartX = note.position.x
      card.dataset.noteStartY = note.position.y
      card.classList.add('moving')
    })
    card.addEventListener('pointermove', event => {
      if (card.dataset.dragPointer !== String(event.pointerId)) return
      const maxX = Math.max(0, container.clientWidth - card.offsetWidth)
      const maxY = Math.max(0, container.clientHeight - card.offsetHeight)
      note.position.x = Math.max(0, Math.min(maxX, Number(card.dataset.noteStartX) + event.clientX - Number(card.dataset.dragStartX)))
      note.position.y = Math.max(0, Math.min(maxY, Number(card.dataset.noteStartY) + event.clientY - Number(card.dataset.dragStartY)))
      card.style.left = `${note.position.x}px`
      card.style.top = `${note.position.y}px`
      renderStickyConnections()
    })
    const finishMove = event => {
      if (card.dataset.dragPointer !== String(event.pointerId)) return
      delete card.dataset.dragPointer
      card.classList.remove('moving')
      markBrainstormDirty()
      renderStickyConnections()
    }
    card.addEventListener('pointerup', finishMove)
    card.addEventListener('pointercancel', finishMove)
    card.addEventListener('keydown', event => {
      const step = event.shiftKey ? 24 : 8
      const offsets = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
      const offset = offsets[event.key]
      if (!offset) return
      event.preventDefault()
      note.position.x = Math.max(0, Math.min(container.clientWidth - card.offsetWidth, note.position.x + offset[0]))
      note.position.y = Math.max(0, Math.min(container.clientHeight - card.offsetHeight, note.position.y + offset[1]))
      card.style.left = `${note.position.x}px`
      card.style.top = `${note.position.y}px`
      markBrainstormDirty()
      renderStickyConnections()
    })

    const top = make('div', 'sticky-note-header')
    top.append(make('span', 'sticky-cat-badge', note.category))
    const deleteButton = make('button', 'sticky-delete-btn', '×')
    deleteButton.type = 'button'
    deleteButton.setAttribute('aria-label', `Delete note by ${note.author}`)
    deleteButton.title = 'Delete idea'
    top.append(deleteButton)

    const body = make('p', 'sticky-note-text', note.content)
    const footer = make('div', 'sticky-note-footer')
    const author = make('span', 'sticky-author')
    const avatar = make('span', 'sticky-author-avatar', note.author.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase())
    author.append(avatar, make('span', '', note.author))
    const vote = make('button', `sticky-upvote-btn ${note.userUpvoted ? 'active' : ''}`)
    vote.type = 'button'
    vote.title = note.userUpvoted ? 'Remove your support' : 'Support this idea'
    vote.setAttribute('aria-pressed', String(Boolean(note.userUpvoted)))
    vote.append(make('span', '', note.userUpvoted ? '❤️' : '🤍'), make('span', '', note.upvotes || 0))
    footer.append(author, vote)
    card.append(top, body, footer)

    vote.addEventListener('click', () => {
      note.userUpvoted = !note.userUpvoted
      note.upvotes = Math.max(0, (note.upvotes || 0) + (note.userUpvoted ? 1 : -1))
      markBrainstormDirty()
      renderStickyNotes()
    })
    deleteButton.addEventListener('click', () => {
      stickyNotes = stickyNotes.filter(item => item.id !== note.id)
      stickyLinks = stickyLinks.filter(link => link.from !== note.id && link.to !== note.id)
      if (!stickyLinks.some(link => link.id === selectedStickyLinkId)) selectedStickyLinkId = null
      const deleteLinkButton = document.querySelector('#sticky-delete-link-btn')
      if (deleteLinkButton) deleteLinkButton.disabled = !selectedStickyLinkId
      markBrainstormDirty()
      renderStickyNotes()
      pushNotification('Idea Removed', 'Brainstorm idea deleted.', '🗑️', 'coral-bg')
    })
    container.append(card)
  })
  renderStickyConnections()
}

function selectStickyLinkNote(noteId) {
  const status = document.querySelector('#sticky-connection-status')
  const sourceCard = document.querySelector(`[data-note-id="${CSS.escape(noteId)}"]`)
  if (!pendingStickyLinkId) {
    pendingStickyLinkId = noteId
    sourceCard?.classList.add('link-source')
    if (status) status.textContent = 'Now choose the idea to connect.'
    return
  }
  if (pendingStickyLinkId === noteId) {
    pendingStickyLinkId = null
    sourceCard?.classList.remove('link-source')
    if (status) status.textContent = 'Choose an idea to start.'
    return
  }

  const selectedType = document.querySelector('#sticky-link-type')?.value || 'related'
  let existingLink = stickyLinks.find(link =>
    (link.from === pendingStickyLinkId && link.to === noteId) ||
    (link.from === noteId && link.to === pendingStickyLinkId)
  )
  if (existingLink) {
    existingLink.type = selectedType
  } else {
    existingLink = { id: `link-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, from: pendingStickyLinkId, to: noteId, type: selectedType }
    stickyLinks.push(existingLink)
  }
  selectedStickyLinkId = existingLink.id
  markBrainstormDirty()
  pendingStickyLinkId = null
  stickyLinkMode = false
  const connectButton = document.querySelector('#sticky-connect-btn')
  connectButton?.setAttribute('aria-pressed', 'false')
  connectButton?.classList.remove('active')
  const deleteButton = document.querySelector('#sticky-delete-link-btn')
  if (deleteButton) deleteButton.disabled = false
  renderStickyNotes()
  if (status) {
    const typeLabel = stickyLinkTypes[selectedType]?.label || stickyLinkTypes.related.label
    status.textContent = `${typeLabel} link ready. Save board to keep it.`
  }
}

function renderStickyConnections() {
  const board = document.querySelector('#sticky-notes-grid')
  const layer = document.querySelector('#sticky-link-layer')
  if (!board || !layer) return
  layer.replaceChildren()
  const width = board.scrollWidth
  const height = board.scrollHeight
  layer.setAttribute('width', width)
  layer.setAttribute('height', height)
  layer.setAttribute('viewBox', `0 0 ${width} ${height}`)

  const namespace = 'http://www.w3.org/2000/svg'
  const defs = document.createElementNS(namespace, 'defs')
  const markerIds = new Map()
  Object.entries(stickyLinkTypes).forEach(([type, style]) => {
    if (!style.markerStart && !style.markerEnd) return
    const markerId = `sticky-link-arrow-${type}`
    markerIds.set(type, markerId)
    const marker = document.createElementNS(namespace, 'marker')
    marker.setAttribute('id', markerId)
    marker.setAttribute('viewBox', '0 0 10 10')
    marker.setAttribute('refX', style.markerStart ? '2' : '8')
    marker.setAttribute('refY', '5')
    marker.setAttribute('markerWidth', '7')
    marker.setAttribute('markerHeight', '7')
    marker.setAttribute('orient', 'auto-start-reverse')
    const arrow = document.createElementNS(namespace, 'path')
    arrow.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z')
    arrow.setAttribute('fill', style.color)
    marker.append(arrow)
    defs.append(marker)
  })
  layer.append(defs)

  const cards = new Map([...board.querySelectorAll('[data-note-id]')].map(card => [card.dataset.noteId, card]))
  const boardBounds = board.getBoundingClientRect()
  stickyLinks.forEach(link => {
    const from = cards.get(link.from)
    const to = cards.get(link.to)
    if (!from || !to) return
    const style = stickyLinkTypes[link.type] || stickyLinkTypes.related
    const fromBounds = from.getBoundingClientRect()
    const toBounds = to.getBoundingClientRect()
    const fromCenter = { x: fromBounds.left - boardBounds.left + fromBounds.width / 2, y: fromBounds.top - boardBounds.top + fromBounds.height / 2 }
    const toCenter = { x: toBounds.left - boardBounds.left + toBounds.width / 2, y: toBounds.top - boardBounds.top + toBounds.height / 2 }
    const delta = { x: toCenter.x - fromCenter.x, y: toCenter.y - fromCenter.y }
    const fromScale = Math.min((fromBounds.width / 2) / Math.max(Math.abs(delta.x), .01), (fromBounds.height / 2) / Math.max(Math.abs(delta.y), .01))
    const toScale = Math.min((toBounds.width / 2) / Math.max(Math.abs(delta.x), .01), (toBounds.height / 2) / Math.max(Math.abs(delta.y), .01))
    const start = { x: fromCenter.x + delta.x * fromScale, y: fromCenter.y + delta.y * fromScale }
    const end = { x: toCenter.x - delta.x * toScale, y: toCenter.y - delta.y * toScale }
    const curveOffset = Math.min(28, Math.max(18, Math.max(Math.abs(delta.x), Math.abs(delta.y)) * .08))
    const controlOne = Math.abs(delta.x) >= Math.abs(delta.y)
      ? { x: start.x + delta.x * .35, y: start.y - curveOffset }
      : { x: start.x + curveOffset, y: start.y + delta.y * .35 }
    const controlTwo = Math.abs(delta.x) >= Math.abs(delta.y)
      ? { x: end.x - delta.x * .35, y: end.y - curveOffset }
      : { x: end.x + curveOffset, y: end.y - delta.y * .35 }
    const pathData = `M ${start.x} ${start.y} C ${controlOne.x} ${controlOne.y}, ${controlTwo.x} ${controlTwo.y}, ${end.x} ${end.y}`
    const path = document.createElementNS(namespace, 'path')
    path.setAttribute('d', pathData)
    path.setAttribute('fill', 'none')
    path.setAttribute('stroke', style.color)
    path.setAttribute('stroke-width', style.width)
    if (style.dash) path.setAttribute('stroke-dasharray', style.dash)
    if (style.markerEnd) path.setAttribute('marker-end', `url(#${markerIds.get(link.type || 'related') || markerIds.get('related')})`)
    if (style.markerStart) path.setAttribute('marker-start', `url(#${markerIds.get(link.type)})`)
    path.setAttribute('class', `sticky-link-line ${link.type || 'related'} ${link.id === selectedStickyLinkId ? 'selected' : ''}`)
    const hitTarget = document.createElementNS(namespace, 'path')
    hitTarget.setAttribute('d', pathData)
    hitTarget.setAttribute('class', 'sticky-link-hit-target')
    hitTarget.setAttribute('role', 'button')
    hitTarget.setAttribute('tabindex', '0')
    hitTarget.setAttribute('aria-label', `Select ${style.label.toLowerCase()} connection`)
    hitTarget.setAttribute('aria-pressed', String(link.id === selectedStickyLinkId))
    const selectLink = () => {
      selectedStickyLinkId = link.id
      const typeSelect = document.querySelector('#sticky-link-type')
      if (typeSelect) typeSelect.value = stickyLinkTypes[link.type] ? link.type : 'related'
      const deleteButton = document.querySelector('#sticky-delete-link-btn')
      if (deleteButton) deleteButton.disabled = false
      const status = document.querySelector('#sticky-connection-status')
      if (status) status.textContent = `${style.label} link selected.`
      renderStickyConnections()
    }
    hitTarget.addEventListener('click', selectLink)
    hitTarget.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') selectLink()
    })
    layer.append(hitTarget, path)
  })
}

export function openAddStickyNoteModal(initialCategory = 'Ideas') {
  const backdrop = make('div', 'modal-backdrop')
  const form = make('form', 'modal')
  const close = make('button', 'close-modal', '×')
  close.type = 'button'
  close.addEventListener('click', closeModal)
  const title = make('h2', '', 'Add an idea')
  const copy = make('p', 'modal-copy', 'Capture a thought and place it on the board. You can move and connect it any time.')
  const catLabel = make('label', '', 'Idea type')
  const catSelect = document.createElement('select')
  ;['Ideas', 'Blockers', 'Goals', 'Wins'].forEach(category => {
    const option = make('option', '', category)
    option.value = category
    catSelect.append(option)
  })
  catSelect.value = initialCategory
  catLabel.append(catSelect)
  const colorLabel = make('label', '', 'Card color')
  const colorSelect = document.createElement('select')
  ;[{ name: 'Warm Yellow', value: 'yellow' }, { name: 'Mint Green', value: 'green' }, { name: 'Rose Coral', value: 'rose' }, { name: 'Sky Blue', value: 'blue' }].forEach(color => {
    const option = make('option', '', color.name)
    option.value = color.value
    colorSelect.append(option)
  })
  colorLabel.append(colorSelect)
  const textLabel = make('label', '', 'Note Content')
  const textarea = make('textarea')
  textarea.placeholder = 'Write your thoughts, proposal, or blocker here...'
  textarea.rows = 3
  textarea.required = true
  textarea.placeholder = 'What is on your mind?'
  textLabel.append(textarea)
  const submit = make('button', 'primary-button full gold', 'Add to board')
  submit.type = 'submit'
  form.append(close, title, copy, catLabel, colorLabel, textLabel, submit)
  backdrop.append(form)
  root.replaceChildren(backdrop)
  form.addEventListener('submit', e => {
    e.preventDefault()
    const content = textarea.value.trim()
    if (!content) return
    const note = { id: `sn_${Date.now()}`, category: catSelect.value, content, author: currentUser.name, color: colorSelect.value, upvotes: 1, userUpvoted: true, position: defaultMindmapPosition(stickyNotes.length) }
    stickyNotes.unshift(note)
    markBrainstormDirty()
    closeModal()
    renderStickyNotes()
    addAuditLog('Sticky Note posted', `${currentUser.name} posted sticky note in ${note.category}.`, 'sticky')
    pushNotification('Sticky Note Added', `"${content.slice(0, 30)}..." added to ideation wall.`, '📌', 'teal-bg')
  })
}

export function initBrainstormEvents() {
  document.querySelector('#sticky-connect-btn')?.addEventListener('click', event => {
    stickyLinkMode = !stickyLinkMode
    pendingStickyLinkId = null
    selectedStickyLinkId = null
    const removeButton = document.querySelector('#sticky-delete-link-btn')
    if (removeButton) removeButton.disabled = true
    const button = event.currentTarget
    button.setAttribute('aria-pressed', String(stickyLinkMode))
    button.classList.toggle('active', stickyLinkMode)
    const status = document.querySelector('#sticky-connection-status')
    if (status) status.textContent = stickyLinkMode ? 'Choose a first note.' : ''
    renderStickyNotes()
  })
  const linkTypeSelect = document.querySelector('#sticky-link-type')
  const savedLinkType = localStorage.getItem('collab_sticky_link_type')
  if (linkTypeSelect && stickyLinkTypes[savedLinkType]) linkTypeSelect.value = savedLinkType
  linkTypeSelect?.addEventListener('change', () => {
    localStorage.setItem('collab_sticky_link_type', linkTypeSelect.value)
    const selectedLink = stickyLinks.find(link => link.id === selectedStickyLinkId)
    if (!selectedLink || selectedLink.type === linkTypeSelect.value) return
    selectedLink.type = linkTypeSelect.value
    markBrainstormDirty()
    renderStickyConnections()
    const status = document.querySelector('#sticky-connection-status')
    if (status) status.textContent = `${stickyLinkTypes[selectedLink.type].label} link updated. Save board to keep it.`
  })
  document.querySelector('#sticky-delete-link-btn')?.addEventListener('click', () => {
    if (!selectedStickyLinkId) return
    stickyLinks = stickyLinks.filter(link => link.id !== selectedStickyLinkId)
    selectedStickyLinkId = null
    document.querySelector('#sticky-delete-link-btn').disabled = true
    markBrainstormDirty()
    renderStickyConnections()
    const status = document.querySelector('#sticky-connection-status')
    if (status) status.textContent = 'Link removed. Save board to keep the change.'
  })
  document.querySelector('#save-brainstorm-btn')?.addEventListener('click', saveBrainstormBoard)
  window.addEventListener('beforeunload', event => {
    if (!brainstormDirty) return
    event.preventDefault()
    event.returnValue = ''
  })
  window.addEventListener('resize', renderStickyConnections)
  document.querySelector('#hub-add-sticky-btn')?.addEventListener('click', openAddStickyNoteModal)
}
