import { activeView, currentUser, make, projects, root, closeModal, renderAvatarElement } from './state.js'
import { api } from './api.js'
import { showDashboardToast } from './modalChrome.js'
import { getSvg } from './icons.js'

let notes = []
let activeProjectId = ''
let loadVersion = 0
let refreshTimer = null
let draggingNote = null

function getProjectForView() {
  return projects.find(project => project.name === activeView && project.projectId) || null
}

function normalizeNote(note) {
  return {
    id: note.note_id || note.noteId,
    projectId: note.project_id || note.projectId,
    authorUid: note.created_by_firebase_uid || note.createdByFirebaseUid,
    authorName: note.author_name || note.authorName || '',
    authorProfileImage: note.author_profile_image || note.authorProfileImage || '',
    content: note.content || '',
    color: note.color || 'yellow',
    x: Number(note.position_x ?? note.positionX ?? 0.08),
    y: Number(note.position_y ?? note.positionY ?? 0.12),
    recipients: Array.isArray(note.recipients) ? note.recipients : []
  }
}

function getProjectMembers(project) {
  const people = [
    {
      firebaseUid: project.creatorFirebaseUid,
      name: project.creatorName || 'Project creator',
      initials: project.creatorInitials,
      profileImage: project.creatorProfileImage
    },
    ...(Array.isArray(project.acceptedMembers) ? project.acceptedMembers : [])
  ]
  const byUid = new Map()
  people.forEach(person => {
    const uid = person.firebaseUid || person.firebase_uid
    if (uid && uid !== currentUser?.uid) {
      byUid.set(uid, {
        firebaseUid: uid,
        name: person.name || person.email || 'Project member',
        initials: person.initials,
        profileImage: person.profileImage || person.profile_image || ''
      })
    }
  })
  return [...byUid.values()]
}

function setNoteLayerVisibility(layer, isVisible) {
  layer.hidden = !isVisible
}

function getNotePath(projectId) {
  return `/projects/${encodeURIComponent(projectId)}/sticky-notes`
}

function positionNote(note, card, layer) {
  const maxX = Math.max(0, layer.clientWidth - card.offsetWidth)
  const maxY = Math.max(0, layer.clientHeight - card.offsetHeight)
  const x = Math.min(note.x, maxX / Math.max(1, layer.clientWidth))
  const y = Math.min(note.y, maxY / Math.max(1, layer.clientHeight))
  card.style.left = `${x * layer.clientWidth}px`
  card.style.top = `${y * layer.clientHeight}px`
}

function saveNotePosition(note, card, layer) {
  const x = Math.min(1, Math.max(0, card.offsetLeft / Math.max(1, layer.clientWidth)))
  const y = Math.min(1, Math.max(0, card.offsetTop / Math.max(1, layer.clientHeight)))
  note.x = x
  note.y = y
  api.put(`${getNotePath(note.projectId)}/${encodeURIComponent(note.id)}`, {
    position: { x, y }
  }).catch(error => {
    console.error('Unable to save sticky note position:', error)
    showDashboardToast(error.message || 'The sticky note position could not be saved.', 'error')
  })
}

function createNoteCard(note, layer) {
  const card = make('article', `project-sticky-note ${note.color}`)
  card.dataset.noteId = note.id
  card.setAttribute('aria-label', `Sticky note by ${note.authorName || 'project member'}`)

  const handle = make('div', 'project-sticky-note-handle')
  const authorAvatar = make('span', 'project-sticky-note-author-avatar')
  renderAvatarElement(authorAvatar, {
    name: note.authorName,
    profileImage: note.authorProfileImage
  }, 'project-sticky-note-author-avatar')
  const dragIcon = make('span', 'project-sticky-note-grip')
  dragIcon.innerHTML = getSvg('dots', '', 15, 15)
  handle.append(authorAvatar, dragIcon, make('span', '', note.authorUid === currentUser?.uid ? 'Your note' : note.authorName))

  if (note.authorUid === currentUser?.uid) {
    const editButton = make('button', 'project-sticky-note-edit', 'Edit')
    editButton.type = 'button'
    editButton.addEventListener('click', () => {
      const project = projects.find(item => item.projectId === note.projectId)
      openStickyNoteModal(project, note)
    })
    const deleteButton = make('button', 'project-sticky-note-delete', '×')
    deleteButton.type = 'button'
    deleteButton.setAttribute('aria-label', 'Delete sticky note')
    deleteButton.addEventListener('click', async () => {
      deleteButton.disabled = true
      try {
        await api.delete(`${getNotePath(note.projectId)}/${encodeURIComponent(note.id)}`)
        notes = notes.filter(item => item.id !== note.id)
        card.remove()
        showDashboardToast('Sticky note deleted.', 'success')
      } catch (error) {
        deleteButton.disabled = false
        showDashboardToast(error.message || 'The sticky note could not be deleted.', 'error')
      }
    })
    handle.append(editButton, deleteButton)
  }

  const text = make('p', 'project-sticky-note-content', note.content)
  card.append(handle, text)
  layer.append(card)
  positionNote(note, card, layer)
  handle.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('button')) return
    const bounds = card.getBoundingClientRect()
    draggingNote = {
      note,
      card,
      layer,
      pointerId: event.pointerId,
      offsetX: event.clientX - bounds.left,
      offsetY: event.clientY - bounds.top
    }
    handle.setPointerCapture(event.pointerId)
    card.classList.add('is-dragging')
    event.preventDefault()
  })
  handle.addEventListener('pointermove', event => {
    if (!draggingNote || draggingNote.card !== card || draggingNote.pointerId !== event.pointerId) return
    const layerBounds = layer.getBoundingClientRect()
    const nextX = event.clientX - layerBounds.left - draggingNote.offsetX
    const nextY = event.clientY - layerBounds.top - draggingNote.offsetY
    card.style.left = `${Math.max(0, Math.min(layer.clientWidth - card.offsetWidth, nextX))}px`
    card.style.top = `${Math.max(0, Math.min(layer.clientHeight - card.offsetHeight, nextY))}px`
  })
  const finishDragging = event => {
    if (!draggingNote || draggingNote.card !== card || draggingNote.pointerId !== event.pointerId) return
    const drag = draggingNote
    draggingNote = null
    card.classList.remove('is-dragging')
    saveNotePosition(drag.note, drag.card, drag.layer)
  }
  handle.addEventListener('pointerup', finishDragging)
  handle.addEventListener('pointercancel', finishDragging)
  return card
}

function renderNotes() {
  const layer = document.querySelector('#project-sticky-note-layer')
  if (!layer) return
  layer.replaceChildren()
  notes.forEach(note => createNoteCard(note, layer))
}

export async function renderProjectStickyNotes() {
  const layer = document.querySelector('#project-sticky-note-layer')
  if (!layer) return
  const project = getProjectForView()
  setNoteLayerVisibility(layer, Boolean(project))
  if (!project) {
    activeProjectId = ''
    notes = []
    layer.replaceChildren()
    return
  }
  if (project.projectId === activeProjectId) return

  activeProjectId = project.projectId
  const requestVersion = ++loadVersion
  notes = []
  renderNotes()
  try {
    const response = await api.get(getNotePath(project.projectId))
    if (requestVersion !== loadVersion || activeProjectId !== project.projectId) return
    if (!Array.isArray(response?.data?.notes)) {
      throw new Error('The server returned an invalid sticky notes response.')
    }
    notes = response.data.notes.map(normalizeNote)
    renderNotes()
  } catch (error) {
    if (requestVersion === loadVersion) {
      console.error('Unable to load project sticky notes:', error)
      showDashboardToast(error.message || 'Project sticky notes could not be loaded.', 'error')
    }
  }
}

function openStickyNoteModal(project, noteToEdit = null) {
  if (!project) return

  const backdrop = make('div', 'modal-backdrop')
  backdrop.addEventListener('click', event => {
    if (event.target === backdrop) closeModal()
  })
  const form = make('form', 'modal messages-create-modal project-sticky-note-modal')
  form.setAttribute('role', 'dialog')
  form.setAttribute('aria-modal', 'true')
  const close = make('button', 'close-modal', '×')
  close.type = 'button'
  close.setAttribute('aria-label', 'Close dialog')
  close.addEventListener('click', closeModal)
  const title = make('h2', '', noteToEdit ? 'Edit Sticky Note' : 'New Sticky Note')
  title.id = 'project-sticky-note-title'
  form.setAttribute('aria-labelledby', title.id)
  const header = make('header', 'messages-create-header')
  header.append(
    make('span', 'messages-create-eyebrow', 'PROJECT NOTES'),
    title,
    make('p', 'modal-copy', noteToEdit
      ? 'Update this note on the project board.'
      : 'Place a movable note on this project’s board.'),
    close
  )
  const textarea = make('textarea')
  textarea.rows = 5
  textarea.maxLength = 2000
  textarea.required = true
  textarea.classList.add('no-input-icon')
  textarea.placeholder = 'Write a reminder, checklist, or quick note…'
  textarea.value = noteToEdit?.content || ''
  const contentLabel = make('label', 'messages-create-label', 'Note')
  contentLabel.append(textarea)

  const colorPicker = document.createElement('div')
  colorPicker.className = 'project-sticky-color-picker'
  let selectedColor = noteToEdit?.color || 'yellow'
  const colorOptions = [
    ['yellow', 'Yellow'],
    ['pink', 'Pink'],
    ['blue', 'Blue'],
    ['green', 'Green']
  ]
  colorOptions.forEach(([color, label]) => {
    const option = make('button', `project-sticky-color-option ${color}${color === selectedColor ? ' selected' : ''}`)
    option.type = 'button'
    option.setAttribute('aria-label', `${label} note`)
    option.setAttribute('aria-pressed', String(color === selectedColor))
    option.addEventListener('click', () => {
      selectedColor = color
      colorPicker.querySelectorAll('button').forEach(button => {
        const isSelected = button.classList.contains(color)
        button.classList.toggle('selected', isSelected)
        button.setAttribute('aria-pressed', String(isSelected))
      })
    })
    colorPicker.append(option)
  })
  const colorLabel = make('label', 'messages-create-label', 'Color')
  colorLabel.append(colorPicker)

  const memberList = make('div', 'messages-member-list project-sticky-recipient-list')
  const recipients = []
  getProjectMembers(project).forEach(member => {
    const label = make('label', 'messages-member-option project-sticky-recipient')
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.value = member.firebaseUid
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) recipients.push(member.firebaseUid)
      else recipients.splice(recipients.indexOf(member.firebaseUid), 1)
      label.classList.toggle('selected', checkbox.checked)
    })
    const avatar = make('span', 'messages-create-avatar')
    renderAvatarElement(avatar, member, 'messages-create-avatar')
    label.append(
      checkbox,
      avatar,
      make('span', '', member.name),
      make('small', '', 'Project member')
    )
    memberList.append(label)
  })
  if (!recipients.length && !memberList.children.length) {
    memberList.append(make('p', 'messages-list-empty', 'No other accepted project members are available.'))
  }
  const shareLabel = make('div', 'project-sticky-sharing')
  shareLabel.append(
    make('p', 'messages-create-label', 'Share with project members'),
    make('p', 'project-sticky-share-help', 'Leave everyone unchecked to keep this note private to you. Tagged members will be notified.'),
    memberList
  )

  const submit = make('button', 'primary-button full gold', 'Create Sticky Note')
  submit.type = 'submit'
  form.append(
    header,
    make('p', 'project-sticky-note-project', project.name),
    contentLabel,
    colorLabel,
    ...(noteToEdit ? [] : [shareLabel]),
    submit
  )
  submit.classList.add('messages-create-submit')
  backdrop.append(form)
  root.replaceChildren(backdrop)
  textarea.focus()
  form.addEventListener('submit', async event => {
    event.preventDefault()
    if (!textarea.value.trim()) return
    submit.disabled = true
    submit.textContent = noteToEdit ? 'Saving…' : 'Creating…'
    try {
      const response = noteToEdit
        ? await api.put(`${getNotePath(project.projectId)}/${encodeURIComponent(noteToEdit.id)}`, {
          content: textarea.value.trim(),
          color: selectedColor
        })
        : await api.post(getNotePath(project.projectId), {
          content: textarea.value.trim(),
          color: selectedColor,
          recipientFirebaseUids: recipients,
          position: {
            x: Math.min(0.72, 0.06 + (notes.length % 3) * 0.22),
            y: Math.min(0.76, 0.08 + Math.floor(notes.length / 3) * 0.2)
          }
        })
      if (!response?.data?.note) throw new Error('The server did not return the saved sticky note.')
      closeModal()
      if (getProjectForView()?.projectId !== project.projectId) return
      if (noteToEdit) {
        notes = notes.map(note => note.id === noteToEdit.id
          ? { ...note, content: response.data.note.content, color: response.data.note.color }
          : note)
      } else {
        notes.push(normalizeNote({
          ...response.data.note,
          author_name: currentUser?.name || 'You',
          author_profile_image: currentUser?.profileImage || currentUser?.photoURL || '',
          recipients: recipients.map(firebaseUid => ({
            firebaseUid,
            name: getProjectMembers(project).find(member => member.firebaseUid === firebaseUid)?.name || 'Project member'
          }))
        }))
      }
      renderNotes()
      showDashboardToast(noteToEdit
        ? 'Sticky note updated.'
        : recipients.length
          ? 'Sticky note shared with project members.'
          : 'Private sticky note created.', 'success')
    } catch (error) {
      submit.disabled = false
      submit.textContent = noteToEdit ? 'Save Changes' : 'Create Sticky Note'
      showDashboardToast(error.message || `The sticky note could not be ${noteToEdit ? 'updated' : 'created'}.`, 'error')
    }
  })
}

function openCreateStickyNoteModal() {
  openStickyNoteModal(getProjectForView())
}

export function initProjectStickyNotes() {
  const layer = document.querySelector('#project-sticky-note-layer')
  const addButton = document.querySelector('#project-add-sticky-note')
  if (!layer || !addButton || addButton.dataset.initialized) return
  addButton.dataset.initialized = 'true'
  addButton.addEventListener('click', openCreateStickyNoteModal)
  if (!refreshTimer) {
    refreshTimer = window.setInterval(async () => {
      const project = getProjectForView()
      if (!project || document.hidden || draggingNote || project.projectId !== activeProjectId) return
      try {
        const response = await api.get(getNotePath(project.projectId))
        if (project.projectId !== activeProjectId || !Array.isArray(response?.data?.notes)) return
        notes = response.data.notes.map(normalizeNote)
        renderNotes()
      } catch (error) {
        console.error('Unable to refresh project sticky notes:', error)
      }
    }, 10000)
  }
}
