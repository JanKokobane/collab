import { projects, currentUser, addAuditLog, make, root, closeModal, loadNotificationsFromAPI } from './state.js'
import { api } from './api.js'
import { firebaseAuth } from '../../firebase.js'
import { showDashboardToast } from './modalChrome.js'

export let stickyNotes = []
export let stickyLinks = []
let brainstormBoards = []
let activeBoard = null
let activeBoardMembers = []
let boardsLoaded = false
let boardsLoading = false
let brainstormSaving = false
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

async function refreshBrainstormNotifications() {
  try {
    await loadNotificationsFromAPI()
    return true
  } catch (error) {
    console.error('Brainstorm invitations were sent, but notifications could not be refreshed:', error)
    return false
  }
}

function markBrainstormDirty() {
  brainstormDirty = true
  const saveButton = document.querySelector('#save-brainstorm-btn')
  const saveStatus = document.querySelector('#brainstorm-save-status')
  if (saveButton) saveButton.disabled = !activeBoard
  if (saveStatus) saveStatus.textContent = activeBoard ? 'Unsaved changes' : 'Choose a board'
}

function getAccessibleProjects() {
  return projects.filter(project => project.projectId && project.name)
}

function renderBrainstormControls() {
  const projectSelect = document.querySelector('#brainstorm-project-select')
  const boardSelect = document.querySelector('#brainstorm-board-select')
  const createButton = document.querySelector('#brainstorm-create-board-btn')
  const inviteButton = document.querySelector('#brainstorm-invite-btn')
  if (!projectSelect || !boardSelect) return

  const selectedProjectId = projectSelect.value || activeBoard?.project_id || getAccessibleProjects()[0]?.projectId || ''
  projectSelect.replaceChildren()
  getAccessibleProjects().forEach(project => {
    const option = make('option', '', project.name)
    option.value = project.projectId
    projectSelect.append(option)
  })
  projectSelect.value = selectedProjectId

  const projectBoards = brainstormBoards.filter(board => board.project_id === selectedProjectId)
  boardSelect.replaceChildren()
  const placeholder = make('option', '', boardsLoading ? 'Loading boards…' : 'Choose a board')
  placeholder.value = ''
  boardSelect.append(placeholder)
  projectBoards.forEach(board => {
    const option = make('option', '', board.title)
    option.value = board.board_id
    boardSelect.append(option)
  })
  boardSelect.value = projectBoards.some(board => board.board_id === activeBoard?.board_id)
    ? activeBoard.board_id
    : ''
  if (createButton) createButton.disabled = !selectedProjectId || boardsLoading
  if (inviteButton) {
    inviteButton.hidden = !activeBoard || activeBoard.created_by_firebase_uid !== firebaseAuth.currentUser?.uid
  }
  projectSelect.disabled = boardsLoading || brainstormSaving
  boardSelect.disabled = boardsLoading || brainstormSaving
}

export async function loadBrainstormBoards() {
  if (boardsLoading) return
  const availableProjects = getAccessibleProjects()
  if (!availableProjects.length) {
    brainstormBoards = []
    activeBoard = null
    activeBoardMembers = []
    stickyNotes = []
    stickyLinks = []
    boardsLoaded = true
    renderBrainstormControls()
    renderStickyNotes()
    return
  }

  boardsLoading = true
  renderBrainstormControls()
  try {
    const lists = await Promise.all(availableProjects.map(async project => {
      const response = await api.get(`/projects/${encodeURIComponent(project.projectId)}/brainstorm-boards`)
      return (response?.data?.boards || []).map(board => ({
        ...board,
        project_name: project.name
      }))
    }))
    brainstormBoards = lists.flat()
    boardsLoaded = true
    const savedBoardId = localStorage.getItem('collab_active_brainstorm_board')
    const boardId = brainstormBoards.some(board => board.board_id === savedBoardId)
      ? savedBoardId
      : brainstormBoards[0]?.board_id
    if (boardId) {
      await loadBrainstormBoard(boardId)
    } else {
      activeBoard = null
      activeBoardMembers = []
      stickyNotes = []
      stickyLinks = []
      brainstormDirty = false
    }
  } catch (error) {
    console.error('Unable to load brainstorm boards:', error)
    showDashboardToast(error.message || 'Brainstorm boards could not be loaded.', 'error')
    throw error
  } finally {
    boardsLoading = false
    renderBrainstormControls()
    renderStickyNotes()
  }
}

async function loadBrainstormBoard(boardId) {
  if (!boardId) {
    activeBoard = null
    activeBoardMembers = []
    stickyNotes = []
    stickyLinks = []
    brainstormDirty = false
    renderBrainstormControls()
    renderStickyNotes()
    return
  }
  const response = await api.get(`/projects/brainstorm-boards/${encodeURIComponent(boardId)}`)
  const board = response?.data?.board
  if (!board) throw new Error('The server returned an invalid brainstorm board.')
  activeBoard = board
  const projectSelect = document.querySelector('#brainstorm-project-select')
  if (projectSelect) projectSelect.value = board.project_id
  activeBoardMembers = Array.isArray(board.members) ? board.members : []
  stickyNotes = Array.isArray(board.board_data?.notes) ? board.board_data.notes : []
  stickyLinks = Array.isArray(board.board_data?.links) ? board.board_data.links : []
  stickyNotes.forEach(note => {
    const member = activeBoardMembers.find(item => item.firebaseUid === note.authorUid)
    if (member) {
      note.author = member.name || note.author
      note.authorProfileImage = member.profileImage || ''
    }
    note.userUpvoted = Array.isArray(note.upvotedBy)
      ? note.upvotedBy.includes(firebaseAuth.currentUser?.uid)
      : Boolean(note.userUpvoted)
    note.upvotes = Array.isArray(note.upvotedBy) ? note.upvotedBy.length : Number(note.upvotes) || 0
  })
  brainstormDirty = false
  localStorage.setItem('collab_active_brainstorm_board', board.board_id)
  renderBrainstormControls()
  renderStickyNotes()
  const saveButton = document.querySelector('#save-brainstorm-btn')
  const saveStatus = document.querySelector('#brainstorm-save-status')
  if (saveButton) saveButton.disabled = true
  if (saveStatus) saveStatus.textContent = 'Saved'
}

async function saveBrainstormBoard() {
  if (!activeBoard || !brainstormDirty) return
  const saveButton = document.querySelector('#save-brainstorm-btn')
  const saveStatus = document.querySelector('#brainstorm-save-status')
  if (saveButton) {
    saveButton.disabled = true
    saveButton.textContent = 'Saving…'
  }
  brainstormSaving = true
  renderBrainstormControls()
  try {
    const userUid = firebaseAuth.currentUser?.uid
    const boardData = {
      notes: stickyNotes.map(note => {
        const persistedNote = { ...note }
        delete persistedNote.authorProfileImage
        return {
          ...persistedNote,
          authorUid: note.authorUid || userUid,
          upvotedBy: Array.isArray(note.upvotedBy)
            ? note.upvotedBy
            : (note.userUpvoted && userUid ? [userUid] : [])
        }
      }),
      links: stickyLinks
    }
    const response = await api.put(`/projects/brainstorm-boards/${encodeURIComponent(activeBoard.board_id)}`, { boardData })
    if (!response?.data?.board) throw new Error('The server did not confirm saving this board.')
    stickyNotes = boardData.notes
    stickyLinks = boardData.links
    activeBoard = { ...activeBoard, ...response.data.board }
    brainstormDirty = false
    if (saveStatus) saveStatus.textContent = 'Saved'
  } catch (error) {
    console.error('Unable to save brainstorm board:', error)
    if (saveStatus) saveStatus.textContent = 'Save failed'
    showDashboardToast(error.message || 'The brainstorm board could not be saved.', 'error')
  } finally {
    brainstormSaving = false
    renderBrainstormControls()
    if (saveButton) {
      saveButton.disabled = !brainstormDirty
      saveButton.textContent = 'Save board'
    }
  }
}

export function renderPersistentBrainstorm() {
  renderBrainstormControls()
  if (!boardsLoaded && !boardsLoading) {
    loadBrainstormBoards().catch(() => {})
    return
  }
  renderStickyNotes()
}

function defaultMindmapPosition(index) {
  const standardPositions = [
    { x: 120, y: 110 },
    { x: 460, y: 90 },
    { x: 120, y: 330 },
    { x: 460, y: 330 }
  ]
  if (standardPositions[index]) return { ...standardPositions[index] }
  const additionalIndex = index - standardPositions.length
  return { x: 145 + (additionalIndex % 4) * 300, y: 560 + Math.floor(additionalIndex / 4) * 175 }
}

export function renderStickyNotes() {
  const container = document.querySelector('#sticky-notes-grid')
  if (!container) return
  const linkLayer = container.querySelector('#sticky-link-layer')
  container.replaceChildren()
  if (linkLayer) container.append(linkLayer)
  const addButton = document.querySelector('#hub-add-sticky-btn')
  const saveButton = document.querySelector('#save-brainstorm-btn')
  const connectionButton = document.querySelector('#sticky-connect-btn')
  const linkTypeSelect = document.querySelector('#sticky-link-type')
  const deleteLinkButton = document.querySelector('#sticky-delete-link-btn')
  if (addButton) addButton.disabled = !activeBoard
  if (saveButton) saveButton.disabled = !activeBoard || !brainstormDirty
  if (connectionButton) connectionButton.disabled = !activeBoard
  if (linkTypeSelect) linkTypeSelect.disabled = !activeBoard
  if (deleteLinkButton) deleteLinkButton.disabled = !activeBoard || !selectedStickyLinkId
  const status = document.querySelector('#brainstorm-save-status')
  if (!activeBoard && status) status.textContent = getAccessibleProjects().length
    ? ''
    : 'Create or join a project to get started'
  if (!activeBoard) {
    container.append(make('p', 'brainstorm-empty-state', getAccessibleProjects().length
      ? 'Select a project and board, or create a board to start collaborating.'
      : 'You are not in a project yet. Create or join a project before starting a brainstorm board.'))
    return
  }
  stickyNotes.forEach((note, index) => {
    if (!note.position) {
      note.position = defaultMindmapPosition(index)
      markBrainstormDirty()
    }
  })

  stickyNotes.forEach(note => {
    note.author = note.author || currentUser.name || 'Project member'
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
    const initials = note.author.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase()
    const avatar = make('span', 'sticky-author-avatar', initials)
    if (/^data:image\/(?:jpeg|png|webp);base64,/.test(note.authorProfileImage || '')) {
      const image = document.createElement('img')
      image.src = note.authorProfileImage
      image.alt = `${note.author}'s profile photo`
      image.referrerPolicy = 'no-referrer'
      image.addEventListener('error', () => {
        image.remove()
        avatar.textContent = initials
      }, { once: true })
      avatar.textContent = ''
      avatar.append(image)
    }
    author.append(avatar, make('span', '', note.author))
    const vote = make('button', `sticky-upvote-btn ${note.userUpvoted ? 'active' : ''}`)
    vote.type = 'button'
    vote.title = note.userUpvoted ? 'Remove your support' : 'Support this idea'
    vote.setAttribute('aria-pressed', String(Boolean(note.userUpvoted)))
    vote.append(make('span', '', note.userUpvoted ? '❤️' : '🤍'), make('span', '', note.upvotes || 0))
    footer.append(author, vote)
    card.append(top, body, footer)

    vote.addEventListener('click', () => {
      const uid = firebaseAuth.currentUser?.uid
      if (!uid) {
        showDashboardToast('Sign in to support an idea.', 'error')
        return
      }
      const upvotedBy = Array.isArray(note.upvotedBy) ? note.upvotedBy : []
      if (upvotedBy.includes(uid)) {
        note.upvotedBy = upvotedBy.filter(memberUid => memberUid !== uid)
      } else {
        note.upvotedBy = [...upvotedBy, uid]
      }
      note.userUpvoted = note.upvotedBy.includes(uid)
      note.upvotes = note.upvotedBy.length
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
  if (!activeBoard) {
    showDashboardToast('Choose or create a brainstorm board before adding an idea.', 'error')
    return
  }
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
    const userUid = firebaseAuth.currentUser?.uid
    const note = {
      id: `sn_${crypto.randomUUID()}`,
      category: catSelect.value,
      content,
      author: currentUser.name,
      authorUid: userUid,
      authorProfileImage: currentUser.profileImage || currentUser.photoURL || '',
      color: colorSelect.value,
      upvotes: userUid ? 1 : 0,
      userUpvoted: Boolean(userUid),
      upvotedBy: userUid ? [userUid] : [],
      position: defaultMindmapPosition(stickyNotes.length)
    }
    stickyNotes.unshift(note)
    markBrainstormDirty()
    closeModal()
    renderStickyNotes()
    addAuditLog('Sticky Note posted', `${currentUser.name} posted sticky note in ${note.category}.`, 'sticky')
  })
}

function getMemberUid(member) {
  return member.firebaseUid || member.firebase_uid || member.uid || ''
}

function appendProjectMemberOptions(container, project, excludedUids = []) {
  const members = Array.isArray(project?.acceptedMembers) ? project.acceptedMembers : []
  const available = members.filter(member => {
    const uid = getMemberUid(member)
    return uid && uid !== firebaseAuth.currentUser?.uid && !excludedUids.includes(uid)
  })
  const creatorUid = project?.creatorFirebaseUid
  const options = creatorUid &&
    creatorUid !== firebaseAuth.currentUser?.uid &&
    !excludedUids.includes(creatorUid) &&
    !available.some(member => getMemberUid(member) === creatorUid)
    ? [{
      firebaseUid: creatorUid,
      name: project.creatorName || 'Project creator',
      email: project.creatorEmail || ''
    }, ...available]
    : available
  if (!options.length) {
    container.append(make('p', 'brainstorm-members-empty', 'No additional accepted project members are available to invite.'))
    return 0
  }
  options.forEach(member => {
    const label = make('label', 'brainstorm-member-option')
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.value = getMemberUid(member)
    label.append(checkbox, make('span', '', member.name || member.email || 'Project member'))
    container.append(label)
  })
  return options.length
}

function openCreateBrainstormBoardModal() {
  if (brainstormDirty) {
    showDashboardToast('Save your board changes before creating another board.', 'error')
    return
  }
  const availableProjects = getAccessibleProjects()
  if (!availableProjects.length) {
    showDashboardToast('Create or join a project before creating a brainstorm board.', 'error')
    return
  }

  const backdrop = make('div', 'modal-backdrop')
  const form = make('form', 'modal')
  const close = make('button', 'close-modal', '×')
  close.type = 'button'
  close.addEventListener('click', closeModal)
  const title = make('h2', '', 'Create brainstorm board')
  const projectLabel = make('label', '', 'Project')
  const projectSelect = document.createElement('select')
  availableProjects.forEach(project => {
    const option = make('option', '', project.name)
    option.value = project.projectId
    projectSelect.append(option)
  })
  projectSelect.value = document.querySelector('#brainstorm-project-select')?.value || availableProjects[0].projectId
  projectLabel.append(projectSelect)
  const nameLabel = make('label', '', 'Board name')
  const nameInput = make('input')
  nameInput.maxLength = 160
  nameInput.required = true
  nameInput.placeholder = 'e.g. Sprint retrospective'
  nameLabel.append(nameInput)
  const inviteField = document.createElement('fieldset')
  inviteField.className = 'brainstorm-member-picker'
  inviteField.append(make('legend', '', 'Invite accepted project members'))
  const memberList = make('div', 'brainstorm-member-list')
  const renderMembers = () => {
    memberList.replaceChildren()
    const project = availableProjects.find(item => item.projectId === projectSelect.value)
    appendProjectMemberOptions(memberList, project)
  }
  projectSelect.addEventListener('change', renderMembers)
  renderMembers()
  inviteField.append(memberList)
  const submit = make('button', 'primary-button full gold', 'Create Board')
  submit.type = 'submit'
  form.append(
    close,
    title,
    make('p', 'modal-copy', 'Only selected project members will be able to see and use this board.'),
    projectLabel,
    nameLabel,
    inviteField,
    submit
  )
  backdrop.append(form)
  root.replaceChildren(backdrop)
  nameInput.focus()
  form.addEventListener('submit', async event => {
    event.preventDefault()
    submit.disabled = true
    submit.textContent = 'Creating…'
    try {
      const memberFirebaseUids = [...memberList.querySelectorAll('input:checked')].map(input => input.value)
      const response = await api.post(
        `/projects/${encodeURIComponent(projectSelect.value)}/brainstorm-boards`,
        { title: nameInput.value.trim(), memberFirebaseUids }
      )
      const board = response?.data?.board
      if (!board?.board_id) throw new Error('The server did not return the created brainstorm board.')
      closeModal()
      boardsLoaded = false
      await loadBrainstormBoards()
      await loadBrainstormBoard(board.board_id)
      const notificationsRefreshed = await refreshBrainstormNotifications()
      showDashboardToast(
        notificationsRefreshed
          ? 'Board created. Invited members have been notified.'
          : 'Board created and invitations sent. Reload the dashboard to refresh notifications.',
        'success'
      )
    } catch (error) {
      console.error('Unable to create brainstorm board:', error)
      submit.disabled = false
      submit.textContent = 'Create Board'
      showDashboardToast(error.message || 'The brainstorm board could not be created.', 'error')
    }
  })
}

function openInviteBrainstormMembersModal() {
  const project = projects.find(item => item.projectId === activeBoard?.project_id)
  if (!activeBoard || !project || activeBoard.created_by_firebase_uid !== firebaseAuth.currentUser?.uid) {
    showDashboardToast('Only the board creator can invite members.', 'error')
    return
  }

  const backdrop = make('div', 'modal-backdrop')
  const form = make('form', 'modal')
  const close = make('button', 'close-modal', '×')
  close.type = 'button'
  close.addEventListener('click', closeModal)
  const memberList = make('div', 'brainstorm-member-list')
  appendProjectMemberOptions(
    memberList,
    project,
    activeBoardMembers.map(member => member.firebaseUid)
  )
  const submit = make('button', 'primary-button full gold', 'Invite Members')
  submit.type = 'submit'
  submit.disabled = !memberList.querySelector('input')
  form.append(
    close,
    make('h2', '', 'Invite to brainstorm board'),
    make('p', 'modal-copy', `Select accepted members of ${project.name}. They will receive an in-dashboard notification.`),
    memberList,
    submit
  )
  backdrop.append(form)
  root.replaceChildren(backdrop)
  form.addEventListener('submit', async event => {
    event.preventDefault()
    const memberFirebaseUids = [...memberList.querySelectorAll('input:checked')].map(input => input.value)
    if (!memberFirebaseUids.length) return
    submit.disabled = true
    submit.textContent = 'Inviting…'
    try {
      const response = await api.post(
        `/projects/brainstorm-boards/${encodeURIComponent(activeBoard.board_id)}/members`,
        { memberFirebaseUids }
      )
      const invitedUids = response?.data?.invitedFirebaseUids
      if (!Array.isArray(invitedUids)) throw new Error('The server did not confirm the board invitations.')
      await loadBrainstormBoard(activeBoard.board_id)
      closeModal()
      const notificationsRefreshed = await refreshBrainstormNotifications()
      showDashboardToast(
        `Invited ${invitedUids.length} member${invitedUids.length === 1 ? '' : 's'}.${notificationsRefreshed ? '' : ' Reload the dashboard to refresh notifications.'}`,
        'success'
      )
    } catch (error) {
      console.error('Unable to invite brainstorm board members:', error)
      submit.disabled = false
      submit.textContent = 'Invite Members'
      showDashboardToast(error.message || 'The board invitations could not be sent.', 'error')
    }
  })
}

export function initBrainstormEvents() {
  document.querySelector('#brainstorm-project-select')?.addEventListener('change', event => {
    const projectId = event.currentTarget.value
    if (brainstormDirty || brainstormSaving) {
      event.currentTarget.value = activeBoard?.project_id || ''
      showDashboardToast('Finish saving board changes before switching projects.', 'error')
      return
    }
    const projectBoard = brainstormBoards.find(board => board.project_id === projectId)
    activeBoard = null
    activeBoardMembers = []
    stickyNotes = []
    stickyLinks = []
    brainstormDirty = false
    renderBrainstormControls()
    renderStickyNotes()
    loadBrainstormBoard(projectBoard?.board_id || '').catch(error => {
      console.error('Unable to open brainstorm board:', error)
      showDashboardToast(error.message || 'The selected board could not be opened.', 'error')
    })
    renderBrainstormControls()
  })
  document.querySelector('#brainstorm-board-select')?.addEventListener('change', event => {
    if (brainstormDirty || brainstormSaving) {
      event.currentTarget.value = activeBoard?.board_id || ''
      showDashboardToast('Finish saving board changes before switching boards.', 'error')
      return
    }
    loadBrainstormBoard(event.currentTarget.value).catch(error => {
      console.error('Unable to open brainstorm board:', error)
      showDashboardToast(error.message || 'The selected board could not be opened.', 'error')
    })
  })
  document.querySelector('#brainstorm-create-board-btn')?.addEventListener('click', openCreateBrainstormBoardModal)
  document.querySelector('#brainstorm-invite-btn')?.addEventListener('click', openInviteBrainstormMembersModal)
  document.querySelector('#sticky-connect-btn')?.addEventListener('click', event => {
    if (!activeBoard) return
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
