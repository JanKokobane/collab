import { projects, currentUser, addAuditLog, make, root, closeModal, loadNotificationsFromAPI, renderAvatarElement } from './state.js'
import { api } from './api.js'
import { firebaseAuth } from '../../firebase.js'
import { showDashboardConfirmation, showDashboardToast } from './modalChrome.js'
import { getSvg } from './icons.js'

export let stickyNotes = []
export let stickyLinks = []
let brainstormBoards = []
let activeBoard = null
let activeBoardMembers = []
const loadedBoardProjectIds = new Set()
const boardLoadPromises = new Map()
let boardsLoading = false
let brainstormSaving = false
let stickyLinkMode = false
let pendingStickyLinkId = null
let selectedStickyLinkId = null
let brainstormDirty = false
const ideaReactionEmojis = ['👍', '❤️', '😂', '🎉', '👀', '🙌', '🔥', '✅', '🤔', '😄']
const stickyLinkTypes = {
  related: { label: 'Related', color: '#526675', width: 2, markerStart: true, markerEnd: true },
  'leads-to': { label: 'Leads to', color: '#16806F', width: 2.5, markerEnd: true },
  supports: { label: 'Supports', color: '#47835F', width: 2, dash: '5 4', markerEnd: true },
  sequence: { label: 'Sequence', color: '#4E78A5', width: 2, markerStart: true, markerEnd: true }
}

function showBrainstormNotice(message) {
  showDashboardToast(message, 'success', { dismissible: true, duration: 0 })
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

function closeBrainstormBoardMenu() {
  const trigger = document.querySelector('#brainstorm-board-select')
  const menu = document.querySelector('#brainstorm-board-menu')
  if (!trigger || !menu) return
  menu.hidden = true
  trigger.setAttribute('aria-expanded', 'false')
}

function positionBrainstormBoardMenu() {
  const trigger = document.querySelector('#brainstorm-board-select')
  const menu = document.querySelector('#brainstorm-board-menu')
  if (!trigger || !menu || menu.hidden) return
  const bounds = trigger.getBoundingClientRect()
  const width = Math.min(370, window.innerWidth - 24)
  menu.style.width = `${width}px`
  menu.style.left = `${Math.max(12, Math.min(bounds.left, window.innerWidth - width - 12))}px`
  menu.style.top = `${Math.max(12, Math.min(bounds.bottom + 6, window.innerHeight - menu.offsetHeight - 12))}px`
}

function renderBrainstormControls() {
  const projectSelect = document.querySelector('#brainstorm-project-select')
  const boardTrigger = document.querySelector('#brainstorm-board-select')
  const boardLabel = document.querySelector('#brainstorm-board-picker-label')
  const boardMenu = document.querySelector('#brainstorm-board-menu')
  const createButton = document.querySelector('#brainstorm-create-board-btn')
  if (!projectSelect || !boardTrigger || !boardMenu || !boardLabel) return

  const accessibleProjects = getAccessibleProjects()
  const preferredProjectId = activeBoard?.project_id ||
    localStorage.getItem('collab_active_brainstorm_project')
  const selectedProjectId = accessibleProjects.some(project => project.projectId === projectSelect.value)
    ? projectSelect.value
    : accessibleProjects.some(project => project.projectId === preferredProjectId)
      ? preferredProjectId
      : accessibleProjects[0]?.projectId || ''
  projectSelect.replaceChildren()
  accessibleProjects.forEach(project => {
    const option = make('option', '', project.name)
    option.value = project.projectId
    projectSelect.append(option)
  })
  projectSelect.value = selectedProjectId

  const projectBoards = brainstormBoards.filter(board => board.project_id === selectedProjectId)
  const selectedProject = projects.find(project => project.projectId === selectedProjectId)
  const projectIsLoading = boardLoadPromises.has(selectedProjectId)
  const selectedBoard = projectBoards.find(board => board.board_id === activeBoard?.board_id)
  boardLabel.textContent = selectedBoard?.title || (projectIsLoading ? 'Loading boards…' : 'Choose a board')
  boardTrigger.disabled = !selectedProjectId || brainstormSaving
  boardTrigger.setAttribute('aria-label', selectedBoard?.title || 'Choose a board')
  boardMenu.replaceChildren()
  const menuHeader = make('div', 'brainstorm-board-menu-header')
  menuHeader.append(
    make('strong', '', 'Brainstorm boards'),
    make('span', '', selectedProject?.name || '')
  )
  boardMenu.append(menuHeader)
  if (projectIsLoading) {
    boardMenu.append(make('p', 'brainstorm-board-menu-empty is-loading', 'Loading boards…'))
  } else if (!projectBoards.length) {
    const emptyState = make('div', 'brainstorm-board-menu-empty-state')
    emptyState.append(
      make('strong', '', 'No boards yet'),
      make('span', '', 'Create a board to start collecting ideas.')
    )
    boardMenu.append(emptyState)
  }
  projectBoards.forEach(board => {
    const isSelected = board.board_id === activeBoard?.board_id
    const row = make('div', `brainstorm-board-menu-row${isSelected ? ' is-selected' : ''}`)
    const selectBoardButton = make('button', 'brainstorm-board-menu-select')
    selectBoardButton.type = 'button'
    selectBoardButton.setAttribute('role', 'menuitemradio')
    selectBoardButton.setAttribute('aria-checked', String(isSelected))
    selectBoardButton.disabled = projectIsLoading || brainstormSaving
    const details = make('span', 'brainstorm-board-menu-details')
    details.append(
      make('strong', 'brainstorm-board-menu-title', board.title),
      make('span', 'brainstorm-board-menu-subtitle', isSelected ? 'Currently open' : 'Open board')
    )
    const indicator = make('span', 'brainstorm-board-menu-indicator', isSelected ? '✓' : '')
    indicator.setAttribute('aria-hidden', 'true')
    selectBoardButton.append(details, indicator)
    selectBoardButton.addEventListener('click', () => {
      closeBrainstormBoardMenu()
      selectBrainstormBoard(board.board_id)
    })
    row.append(selectBoardButton)
    if (board.created_by_firebase_uid === firebaseAuth.currentUser?.uid) {
      const actions = make('div', 'brainstorm-board-menu-actions')
      const editBoardButton = make('button', 'brainstorm-board-menu-action', 'Edit')
      editBoardButton.type = 'button'
      editBoardButton.setAttribute('role', 'menuitem')
      editBoardButton.disabled = projectIsLoading || brainstormSaving
      editBoardButton.setAttribute('aria-label', `Edit ${board.title}`)
      editBoardButton.addEventListener('click', () => {
        closeBrainstormBoardMenu()
        openEditBrainstormBoardModal(board)
      })
      const removeBoardButton = make('button', 'brainstorm-board-menu-action is-danger', 'Remove')
      removeBoardButton.type = 'button'
      removeBoardButton.setAttribute('role', 'menuitem')
      removeBoardButton.disabled = projectIsLoading || brainstormSaving
      removeBoardButton.setAttribute('aria-label', `Remove ${board.title}`)
      removeBoardButton.addEventListener('click', () => {
        closeBrainstormBoardMenu()
        removeBrainstormBoard(board)
      })
      actions.append(editBoardButton, removeBoardButton)
      row.append(actions)
    }
    boardMenu.append(row)
  })
  boardTrigger.setAttribute('aria-expanded', String(!boardMenu.hidden))
  if (createButton) createButton.disabled = !selectedProjectId || brainstormSaving
  projectSelect.disabled = brainstormSaving
}

async function selectBrainstormBoard(boardId) {
  if (brainstormDirty || brainstormSaving) {
    renderBrainstormControls()
    showDashboardToast('Finish saving board changes before switching boards.', 'error')
    return
  }
  try {
    await loadBrainstormBoard(boardId)
  } catch (error) {
    console.error('Unable to open brainstorm board:', error)
    showDashboardToast(error.message || 'The selected board could not be opened.', 'error')
  }
}

export async function loadBrainstormBoards(
  projectId = document.querySelector('#brainstorm-project-select')?.value || activeBoard?.project_id || getAccessibleProjects()[0]?.projectId || '',
  { force = false, activate = true } = {}
) {
  const availableProjects = getAccessibleProjects()
  if (!availableProjects.length) {
    brainstormBoards = []
    activeBoard = null
    activeBoardMembers = []
    stickyNotes = []
    stickyLinks = []
    loadedBoardProjectIds.clear()
    renderBrainstormControls()
    renderStickyNotes()
    return
  }
  const project = availableProjects.find(item => item.projectId === projectId)
  if (!project) return
  if (!force && loadedBoardProjectIds.has(projectId)) {
    if (activate && document.querySelector('#brainstorm-project-select')?.value === projectId) {
      const projectBoards = brainstormBoards.filter(board => board.project_id === projectId)
      const savedBoardId = localStorage.getItem('collab_active_brainstorm_board')
      const boardId = projectBoards.some(board => board.board_id === savedBoardId)
        ? savedBoardId
        : projectBoards[0]?.board_id
      if (boardId) await loadBrainstormBoard(boardId)
      else {
        activeBoard = null
        activeBoardMembers = []
        stickyNotes = []
        stickyLinks = []
        brainstormDirty = false
        renderBrainstormControls()
        renderStickyNotes()
      }
      localStorage.setItem('collab_active_brainstorm_project', projectId)
    }
    return
  }
  const existingLoad = boardLoadPromises.get(projectId)
  if (existingLoad) return existingLoad

  const loadPromise = Promise.resolve().then(async () => {
    boardsLoading = true
    renderBrainstormControls()
    try {
      const response = await api.get(`/projects/${encodeURIComponent(project.projectId)}/brainstorm-boards`)
      if (!Array.isArray(response?.data?.boards)) {
        throw new Error('The server returned an invalid brainstorm boards response.')
      }
      const projectBoards = response.data.boards.map(board => ({
        ...board,
        project_name: project.name
      }))
      brainstormBoards = [
        ...brainstormBoards.filter(board => board.project_id !== projectId),
        ...projectBoards
      ]
      loadedBoardProjectIds.add(projectId)
      const selectedProjectId = document.querySelector('#brainstorm-project-select')?.value
      if (activate && selectedProjectId === projectId) {
        const savedBoardId = localStorage.getItem('collab_active_brainstorm_board')
        const boardId = projectBoards.some(board => board.board_id === savedBoardId)
          ? savedBoardId
          : projectBoards[0]?.board_id
        if (boardId) {
          await loadBrainstormBoard(boardId)
        } else {
          activeBoard = null
          activeBoardMembers = []
          stickyNotes = []
          stickyLinks = []
          brainstormDirty = false
        }
        localStorage.setItem('collab_active_brainstorm_project', projectId)
      }
    } catch (error) {
      console.error('Unable to load brainstorm boards:', error)
      showDashboardToast(error.message || 'Brainstorm boards could not be loaded.', 'error')
      throw error
    } finally {
      boardLoadPromises.delete(projectId)
      boardsLoading = boardLoadPromises.size > 0
      renderBrainstormControls()
      renderStickyNotes()
    }
  })
  boardLoadPromises.set(projectId, loadPromise)
  return loadPromise
}

export async function openBrainstormBoardFromNotification(boardId) {
  if (brainstormDirty || brainstormSaving) {
    throw new Error('Save your board changes before opening another board.')
  }
  await loadBrainstormBoard(boardId)
  if (!brainstormBoards.some(board => board.board_id === activeBoard.board_id)) {
    const project = projects.find(item => item.projectId === activeBoard.project_id)
    brainstormBoards = [...brainstormBoards, { ...activeBoard, project_name: project?.name || '' }]
  }
  localStorage.setItem('collab_active_brainstorm_project', activeBoard.project_id)
  renderBrainstormControls()
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
    note.reactions = Array.isArray(note.reactions) ? note.reactions : []
    delete note.upvotes
    delete note.upvotedBy
    delete note.userUpvoted
    const member = activeBoardMembers.find(item => getMemberUid(item) === note.authorUid)
    if (member) {
      note.author = note.authorUid === firebaseAuth.currentUser?.uid
        ? currentUser.name || member.name || 'Project member'
        : member.name || 'Project member'
      note.authorProfileImage = member.profileImage || note.authorProfileImage || ''
    } else if (note.authorUid === firebaseAuth.currentUser?.uid) {
      note.author = currentUser.name || 'Project member'
    }
  })
  brainstormDirty = false
  localStorage.setItem('collab_active_brainstorm_board', board.board_id)
  localStorage.setItem('collab_active_brainstorm_project', board.project_id)
  renderBrainstormControls()
  renderStickyNotes()
  const saveButton = document.querySelector('#save-brainstorm-btn')
  const saveStatus = document.querySelector('#brainstorm-save-status')
  if (saveButton) saveButton.disabled = true
  if (saveStatus) saveStatus.textContent = 'Saved'
}

function openEditBrainstormBoardModal(board = activeBoard) {
  if (!board || board.created_by_firebase_uid !== firebaseAuth.currentUser?.uid) return
  if (brainstormDirty || brainstormSaving) {
    showDashboardToast('Save your board changes before editing the board name.', 'error')
    return
  }
  const boardToEdit = board

  const backdrop = make('div', 'modal-backdrop')
  const form = make('form', 'modal')
  const close = make('button', 'close-modal', '×')
  close.type = 'button'
  close.addEventListener('click', closeModal)
  const title = make('h2', 'brainstorm-create-board-title', 'Edit brainstorm board')
  const nameLabel = make('label', 'brainstorm-create-board-field', 'Board name')
  const nameInput = document.createElement('input')
  nameInput.type = 'text'
  nameInput.maxLength = 160
  nameInput.required = true
  nameInput.value = boardToEdit.title
  nameLabel.append(nameInput)
  const submit = make('button', 'primary-button full gold', 'Save changes')
  submit.type = 'submit'
  form.append(close, title, nameLabel, submit)
  backdrop.append(form)
  root.replaceChildren(backdrop)
  nameInput.focus()
  nameInput.select()

  form.addEventListener('submit', async event => {
    event.preventDefault()
    submit.disabled = true
    submit.textContent = 'Saving…'
    try {
      const response = await api.patch(
        `/projects/brainstorm-boards/${encodeURIComponent(boardToEdit.board_id)}`,
        { title: nameInput.value.trim() }
      )
      const updatedBoard = response?.data?.board
      if (!updatedBoard?.board_id) throw new Error('The server did not confirm the board name change.')
      if (activeBoard?.board_id === updatedBoard.board_id) {
        activeBoard = { ...activeBoard, ...updatedBoard }
      }
      brainstormBoards = brainstormBoards.map(board =>
        board.board_id === updatedBoard.board_id ? { ...board, ...updatedBoard } : board
      )
      closeModal()
      renderBrainstormControls()
      showDashboardToast('Board name updated.', 'success')
    } catch (error) {
      console.error('Unable to update brainstorm board name:', error)
      submit.disabled = false
      submit.textContent = 'Save changes'
      showDashboardToast(error.message || 'The board name could not be updated.', 'error')
    }
  })
}

async function removeBrainstormBoard(board) {
  if (!board || board.created_by_firebase_uid !== firebaseAuth.currentUser?.uid) return
  if (brainstormDirty || brainstormSaving) {
    showDashboardToast('Save your board changes before removing the board.', 'error')
    return
  }
  const confirmed = await showDashboardConfirmation({
    title: 'Remove brainstorm board?',
    message: `Remove "${board.title}" and all its ideas and member access? This cannot be undone.`,
    confirmText: 'Remove board',
    danger: true,
    className: 'brainstorm-board-remove-confirmation'
  })
  if (!confirmed) return

  try {
    await api.delete(`/projects/brainstorm-boards/${encodeURIComponent(board.board_id)}`)
    brainstormBoards = brainstormBoards.filter(item => item.board_id !== board.board_id)
    if (activeBoard?.board_id === board.board_id) {
      localStorage.removeItem('collab_active_brainstorm_board')
      activeBoard = null
      activeBoardMembers = []
      stickyNotes = []
      stickyLinks = []
      brainstormDirty = false
      const projectId = document.querySelector('#brainstorm-project-select')?.value
      const nextBoard = brainstormBoards.find(item => item.project_id === projectId)
      await loadBrainstormBoard(nextBoard?.board_id || '')
    }
    renderBrainstormControls()
    renderStickyNotes()
    showDashboardToast('Brainstorm board removed.', 'success')
  } catch (error) {
    console.error('Unable to remove brainstorm board:', error)
    showDashboardToast(error.message || 'The brainstorm board could not be removed.', 'error')
  }
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
    const boardData = {
      notes: stickyNotes.map(note => {
        const persistedNote = { ...note }
        delete persistedNote.authorProfileImage
        return {
          ...persistedNote,
          authorUid: note.authorUid,
          reactions: Array.isArray(note.reactions) ? note.reactions : []
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
  const selectedProjectId = document.querySelector('#brainstorm-project-select')?.value
  if (!selectedProjectId && !getAccessibleProjects().length) {
    activeBoard = null
    activeBoardMembers = []
    stickyNotes = []
    stickyLinks = []
    renderStickyNotes()
    return
  }
  if (selectedProjectId && !loadedBoardProjectIds.has(selectedProjectId)) {
    loadBrainstormBoards(selectedProjectId).catch(() => {})
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
  const deleteLinkButton = document.querySelector('#sticky-delete-link-btn')
  if (addButton) addButton.disabled = !getAccessibleProjects().length || boardsLoading || brainstormSaving
  if (saveButton) saveButton.disabled = !activeBoard || !brainstormDirty
  if (connectionButton) connectionButton.disabled = !activeBoard
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
    note.author = note.author || 'Project member'
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
    const userUid = firebaseAuth.currentUser?.uid
    const canDeleteNote = note.authorUid === userUid
    let deleteButton
    if (canDeleteNote) {
      deleteButton = make('button', 'sticky-delete-btn', '×')
      deleteButton.type = 'button'
      deleteButton.setAttribute('aria-label', `Delete note by ${note.author}`)
      deleteButton.title = 'Delete idea'
      top.append(deleteButton)
    }

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
    const reactions = Array.isArray(note.reactions) ? note.reactions : []
    const reactionCounts = new Map()
    reactions.forEach(reaction => {
      reactionCounts.set(reaction.emoji, (reactionCounts.get(reaction.emoji) || 0) + 1)
    })
    const reactionControls = make('div', 'sticky-reaction-controls')
    const reactionList = make('div', 'sticky-reaction-list')
    ideaReactionEmojis.forEach(emoji => {
      const count = reactionCounts.get(emoji) || 0
      if (!count) return
      const userReacted = reactions.some(reaction =>
        reaction.emoji === emoji && reaction.firebaseUid === userUid
      )
      const reactionButton = make('button', `sticky-reaction-chip${userReacted ? ' active' : ''}`)
      reactionButton.type = 'button'
      reactionButton.title = `${emoji} reaction${count === 1 ? '' : 's'}`
      reactionButton.setAttribute('aria-pressed', String(userReacted))
      reactionButton.append(make('span', '', emoji), make('span', '', count))
      reactionButton.addEventListener('click', () => toggleIdeaReaction(note, emoji))
      reactionList.append(reactionButton)
    })
    const pickerWrap = make('div', 'sticky-reaction-picker-wrap')
    const pickerButton = make('button', 'sticky-reaction-picker-trigger', '☺')
    pickerButton.type = 'button'
    pickerButton.title = 'Add a reaction'
    pickerButton.setAttribute('aria-label', 'Add a reaction')
    pickerButton.setAttribute('aria-expanded', 'false')
    const picker = make('div', 'sticky-reaction-picker')
    picker.hidden = true
    ideaReactionEmojis.forEach(emoji => {
      const emojiButton = make('button', 'sticky-reaction-option', emoji)
      emojiButton.type = 'button'
      emojiButton.setAttribute('aria-label', `React with ${emoji}`)
      emojiButton.addEventListener('click', () => {
        toggleIdeaReaction(note, emoji)
        picker.hidden = true
        pickerButton.setAttribute('aria-expanded', 'false')
      })
      picker.append(emojiButton)
    })
    pickerButton.addEventListener('click', () => {
      picker.hidden = !picker.hidden
      pickerButton.setAttribute('aria-expanded', String(!picker.hidden))
    })
    pickerWrap.append(pickerButton, picker)
    reactionControls.append(reactionList, pickerWrap)
    footer.append(author, reactionControls)
    card.append(top, body, footer)

    deleteButton?.addEventListener('click', () => {
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

function toggleIdeaReaction(note, emoji) {
  const uid = firebaseAuth.currentUser?.uid
  if (!uid) {
    showDashboardToast('Sign in to react to an idea.', 'error')
    return
  }
  const reactions = Array.isArray(note.reactions) ? note.reactions : []
  const alreadyReacted = reactions.some(reaction =>
    reaction.emoji === emoji && reaction.firebaseUid === uid
  )
  note.reactions = alreadyReacted
    ? reactions.filter(reaction => reaction.emoji !== emoji || reaction.firebaseUid !== uid)
    : [...reactions, { emoji, firebaseUid: uid }]
  markBrainstormDirty()
  renderStickyNotes()
}

function selectStickyLinkNote(noteId) {
  const sourceCard = document.querySelector(`[data-note-id="${CSS.escape(noteId)}"]`)
  if (!pendingStickyLinkId) {
    pendingStickyLinkId = noteId
    sourceCard?.classList.add('link-source')
    showBrainstormNotice('Choose another idea to connect.')
    return
  }
  if (pendingStickyLinkId === noteId) {
    pendingStickyLinkId = null
    sourceCard?.classList.remove('link-source')
    showBrainstormNotice('Idea connection cancelled.')
    return
  }

  const selectedType = 'related'
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
  const typeLabel = stickyLinkTypes[selectedType]?.label || stickyLinkTypes.related.label
  showBrainstormNotice(`${typeLabel} link ready. Save board to keep it.`)
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
      const deleteButton = document.querySelector('#sticky-delete-link-btn')
      if (deleteButton) deleteButton.disabled = false
      showBrainstormNotice(`${style.label} link selected.`)
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
    if (getAccessibleProjects().length) {
      openCreateBrainstormBoardModal()
    } else {
      showDashboardToast('Create or join a project before adding a brainstorm idea.', 'error')
    }
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
  const catSelectWrap = make('div', 'input-with-icon')
  const catIcon = make('span', 'input-icon-svg')
  catIcon.innerHTML = getSvg('lightbulb', '', 16, 16)
  catSelectWrap.append(catIcon, catSelect)
  catLabel.append(catSelectWrap)
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
      reactions: [],
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

function appendBrainstormSearchIcon(container) {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  icon.setAttribute('viewBox', '0 0 24 24')
  icon.setAttribute('width', '17')
  icon.setAttribute('height', '17')
  icon.setAttribute('fill', 'none')
  icon.setAttribute('stroke', 'currentColor')
  icon.setAttribute('stroke-width', '2')
  icon.setAttribute('stroke-linecap', 'round')
  icon.setAttribute('stroke-linejoin', 'round')
  icon.setAttribute('aria-hidden', 'true')
  const lens = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
  lens.setAttribute('cx', '11')
  lens.setAttribute('cy', '11')
  lens.setAttribute('r', '7')
  const handle = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  handle.setAttribute('d', 'm20 20-4-4')
  icon.append(lens, handle)
  container.append(icon)
}

function appendProjectMemberOptions(container, project, excludedUids = [], selectedUids = new Set(), searchQuery = '', onSelectionChange = () => {}) {
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
      email: project.creatorEmail || '',
      profileImage: project.creatorProfileImage || ''
    }, ...available]
    : available
  const query = searchQuery.trim().toLowerCase()
  const filteredOptions = options.filter(member =>
    `${member.name || ''} ${member.email || ''}`.toLowerCase().includes(query)
  )
  if (!filteredOptions.length) {
    const emptyMessage = query
      ? 'No matching project members.'
      : 'No additional accepted project members are available to invite.'
    container.append(make('p', 'messages-forward-empty', emptyMessage))
    return 0
  }
  filteredOptions.forEach(member => {
    const uid = getMemberUid(member)
    const isSelected = selectedUids.has(uid)
    const label = make('label', `brainstorm-board-member-option${isSelected ? ' selected' : ''}`)
    const avatar = make('span', 'brainstorm-board-member-avatar')
    renderAvatarElement(avatar, member, 'brainstorm-board-member-avatar')
    const details = make('span', 'brainstorm-board-member-details')
    details.append(
      make('strong', '', member.name || 'Project member'),
      make('small', '', member.email || '')
    )
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.name = 'brainstorm-board-members'
    checkbox.value = uid
    checkbox.checked = isSelected
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) selectedUids.add(uid)
      else selectedUids.delete(uid)
      label.classList.toggle('selected', checkbox.checked)
      onSelectionChange(selectedUids)
    })
    label.append(avatar, details, checkbox)
    container.append(label)
  })
  return filteredOptions.length
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
  const title = make('h2', 'brainstorm-create-board-title', 'Create brainstorm board')
  const projectLabel = make('label', 'brainstorm-create-board-field', 'Project')
  const projectSelect = document.createElement('select')
  availableProjects.forEach(project => {
    const option = make('option', '', project.name)
    option.value = project.projectId
    projectSelect.append(option)
  })
  projectSelect.value = document.querySelector('#brainstorm-project-select')?.value || availableProjects[0].projectId
  projectLabel.append(projectSelect)
  const nameLabel = make('label', 'brainstorm-create-board-field', 'Board name')
  const nameInput = make('input')
  nameInput.type = 'text'
  nameInput.maxLength = 160
  nameInput.required = true
  nameInput.placeholder = 'e.g. Sprint retrospective'
  const nameInputWrap = make('div', 'input-with-icon brainstorm-board-name-input')
  const nameIcon = make('span', 'input-icon-svg')
  nameIcon.innerHTML = getSvg('lightbulb', '', 16, 16)
  nameInputWrap.append(nameIcon, nameInput)
  nameLabel.append(nameInputWrap)
  const inviteField = document.createElement('fieldset')
  inviteField.className = 'brainstorm-create-board-members'
  inviteField.append(make('legend', '', 'Invite accepted project members'))
  const selectedMembers = new Set()
  const searchWrap = make('label', 'brainstorm-create-board-search')
  appendBrainstormSearchIcon(searchWrap)
  const memberSearch = document.createElement('input')
  memberSearch.type = 'search'
  memberSearch.placeholder = 'Search name or email'
  memberSearch.setAttribute('aria-label', 'Search accepted project members')
  searchWrap.append(memberSearch)
  const selectedCount = make('span', 'brainstorm-create-board-selection-count', '')
  const memberList = make('div', 'brainstorm-create-member-list')
  const updateSelectedCount = () => {
    selectedCount.textContent = selectedMembers.size
      ? `${selectedMembers.size} selected`
      : ''
  }
  const renderMembers = () => {
    memberList.replaceChildren()
    const project = availableProjects.find(item => item.projectId === projectSelect.value)
    appendProjectMemberOptions(memberList, project, [], selectedMembers, memberSearch.value, updateSelectedCount)
  }
  memberSearch.addEventListener('input', renderMembers)
  projectSelect.addEventListener('change', renderMembers)
  renderMembers()
  inviteField.append(searchWrap, selectedCount, memberList)
  const submit = make('button', 'primary-button full gold', 'Create Board')
  submit.type = 'submit'
  const submitSpinner = make('span', 'form-submit-spinner')
  submitSpinner.setAttribute('aria-hidden', 'true')
  submitSpinner.hidden = true
  const submitLabel = make('span', '', 'Create Board')
  submit.replaceChildren(submitSpinner, submitLabel)
  form.append(
    close,
    title,
    make('p', 'modal-copy brainstorm-create-board-copy', 'Only selected project members will be able to see and use this board.'),
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
    submitSpinner.hidden = false
    submitLabel.textContent = 'Creating…'
    submit.setAttribute('aria-busy', 'true')
    try {
      const memberFirebaseUids = [...selectedMembers]
      const response = await api.post(
        `/projects/${encodeURIComponent(projectSelect.value)}/brainstorm-boards`,
        { title: nameInput.value.trim(), memberFirebaseUids }
      )
      const board = response?.data?.board
      if (!board?.board_id) throw new Error('The server did not return the created brainstorm board.')
      closeModal()
      await loadBrainstormBoards(projectSelect.value, { force: true })
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
      submitSpinner.hidden = true
      submitLabel.textContent = 'Create Board'
      submit.removeAttribute('aria-busy')
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
  const form = make('form', 'modal brainstorm-invite-board-modal')
  const close = make('button', 'close-modal', '×')
  close.type = 'button'
  close.addEventListener('click', closeModal)
  const memberList = make('div', 'brainstorm-board-member-list')
  const selectedMembers = new Set()
  const searchWrap = make('label', 'brainstorm-board-member-search')
  appendBrainstormSearchIcon(searchWrap)
  const memberSearch = document.createElement('input')
  memberSearch.type = 'search'
  memberSearch.placeholder = 'Search name or email'
  memberSearch.setAttribute('aria-label', 'Search accepted project members')
  searchWrap.append(memberSearch)
  const selectedCount = make('span', 'brainstorm-board-selection-count', '')
  let submit
  const updateSelectedCount = () => {
    selectedCount.textContent = selectedMembers.size ? `${selectedMembers.size} selected` : ''
    if (submit) submit.disabled = selectedMembers.size === 0
  }
  const renderMembers = () => {
    memberList.replaceChildren()
    appendProjectMemberOptions(
      memberList,
      project,
      activeBoardMembers.map(member => member.firebaseUid),
      selectedMembers,
      memberSearch.value,
      updateSelectedCount
    )
    selectedCount.textContent = selectedMembers.size ? `${selectedMembers.size} selected` : ''
  }
  memberSearch.addEventListener('input', renderMembers)
  renderMembers()
  submit = make('button', 'primary-button full gold', 'Invite Members')
  submit.type = 'submit'
  submit.disabled = true
  form.append(
    close,
    make('h2', '', 'Invite to brainstorm board'),
    make('p', 'modal-copy', `Select accepted members of ${project.name}. They will receive an in-dashboard notification.`),
    searchWrap,
    selectedCount,
    memberList,
    submit
  )
  backdrop.append(form)
  root.replaceChildren(backdrop)
  form.addEventListener('submit', async event => {
    event.preventDefault()
    const memberFirebaseUids = [...selectedMembers]
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
      if (!invitedUids.length) throw new Error('Those members are already invited to this board.')
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

async function handleAddIdeaClick() {
  if (!activeBoard) {
    const projectId = document.querySelector('#brainstorm-project-select')?.value
    const existingBoard = brainstormBoards.find(board => board.project_id === projectId)
    if (existingBoard) {
      try {
        await loadBrainstormBoard(existingBoard.board_id)
      } catch (error) {
        console.error('Unable to open a brainstorm board for adding an idea:', error)
        showDashboardToast(error.message || 'A brainstorm board could not be opened.', 'error')
        return
      }
    } else {
      openCreateBrainstormBoardModal()
      return
    }
  }
  openAddStickyNoteModal()
}

export function initBrainstormEvents() {
  document.querySelector('#brainstorm-project-select')?.addEventListener('change', event => {
    const projectId = event.currentTarget.value
    if (brainstormDirty || brainstormSaving) {
      event.currentTarget.value = activeBoard?.project_id || ''
      showDashboardToast('Finish saving board changes before switching projects.', 'error')
      return
    }
    activeBoard = null
    activeBoardMembers = []
    stickyNotes = []
    stickyLinks = []
    brainstormDirty = false
    renderBrainstormControls()
    renderStickyNotes()
    loadBrainstormBoards(projectId).catch(() => {})
  })
  document.querySelector('#brainstorm-board-select')?.addEventListener('click', event => {
    const trigger = event.currentTarget
    const menu = document.querySelector('#brainstorm-board-menu')
    if (!menu || trigger.disabled) return
    if (menu.hidden) {
      menu.hidden = false
      trigger.setAttribute('aria-expanded', 'true')
      positionBrainstormBoardMenu()
      loadBrainstormBoards(document.querySelector('#brainstorm-project-select')?.value, {
        force: true,
        activate: false
      }).then(positionBrainstormBoardMenu).catch(() => {})
    } else {
      closeBrainstormBoardMenu()
    }
  })
  document.querySelector('#brainstorm-board-select')?.addEventListener('keydown', event => {
    if (event.key !== 'ArrowDown') return
    event.preventDefault()
    const menu = document.querySelector('#brainstorm-board-menu')
    if (menu?.hidden) event.currentTarget.click()
    menu?.querySelector('button:not(:disabled)')?.focus()
  })
  document.addEventListener('pointerdown', event => {
    const picker = document.querySelector('#brainstorm-board-picker')
    if (picker && !picker.contains(event.target)) closeBrainstormBoardMenu()
  })
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return
    const menu = document.querySelector('#brainstorm-board-menu')
    if (!menu || menu.hidden) return
    closeBrainstormBoardMenu()
    document.querySelector('#brainstorm-board-select')?.focus()
  })
  window.addEventListener('resize', closeBrainstormBoardMenu)
  window.addEventListener('scroll', event => {
    const menu = document.querySelector('#brainstorm-board-menu')
    if (!menu?.contains(event.target)) closeBrainstormBoardMenu()
  }, true)
  document.querySelector('#brainstorm-create-board-btn')?.addEventListener('click', openCreateBrainstormBoardModal)
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
    if (stickyLinkMode) showBrainstormNotice('Choose the first idea to connect.')
    else showBrainstormNotice('Idea connection mode closed.')
    renderStickyNotes()
  })
  document.querySelector('#sticky-delete-link-btn')?.addEventListener('click', () => {
    if (!selectedStickyLinkId) return
    stickyLinks = stickyLinks.filter(link => link.id !== selectedStickyLinkId)
    selectedStickyLinkId = null
    document.querySelector('#sticky-delete-link-btn').disabled = true
    markBrainstormDirty()
    renderStickyConnections()
    showBrainstormNotice('Link removed. Save board to keep the change.')
  })
  document.querySelector('#save-brainstorm-btn')?.addEventListener('click', saveBrainstormBoard)
  window.addEventListener('beforeunload', event => {
    if (!brainstormDirty) return
    event.preventDefault()
    event.returnValue = ''
  })
  window.addEventListener('resize', renderStickyConnections)
  document.querySelector('#hub-add-sticky-btn')?.addEventListener('click', handleAddIdeaClick)
}
