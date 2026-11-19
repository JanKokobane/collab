import {
  projects,
  members,
  tasks,
  getSprintMemberUids,
  currentUser,
  activeView,
  setActiveView,
  make,
  closeModal,
  root,
  saveProjects,
  saveMembers,
  saveTasks,
  addAuditLog,
  pushNotification,
  addPersistedNotification,
  hub
} from './state.js'
import { api } from './api.js'
import { firebaseAuth } from '../../firebase.js'
import { setDashboardButtonLoading, showDashboardConfirmation, showDashboardToast } from './modalChrome.js'

import {
  getActiveProject,
  isCurrentUserProjectCreator,
  showPermissionNotice,
  updateUserUI
} from './auth.js?v=20261117-no-auto-sprints'

import { switchView } from './navigation.js'
import { toLocalDateKey } from './dateUtils.js?v=20261117-date-input-validation'

// ============================================================
// PROJECTS MANAGEMENT (Create Group Projects)
// ============================================================

export function renderProjectNav() {
  const container = document.querySelector('#project-nav-list')

  if (!container) return

  container.replaceChildren()

  if (!projects.length) {
    const empty = make('div', 'project-nav-empty')
    empty.append(
      make('p', '', 'No projects yet. Create one to get started.')
    )
    const createButton = make('button', 'outline-button', 'Create a project')
    createButton.type = 'button'
    createButton.addEventListener('click', openCreateProjectModal)
    empty.append(createButton)
    container.append(empty)
    return
  }

  projects.forEach(project => {
    const item = document.createElement('a')

    item.className =
      `nav-item project ${activeView === project.name ? 'active' : ''}`

    item.dataset.view = project.name

    const dot = document.createElement('i')
    dot.className = `dot ${project.color || 'blue'}`

    const name = document.createElement('span')
    name.textContent = project.name

    item.append(dot, name)

    item.addEventListener('click', () => {
      switchView(project.name)
    })

    container.append(item)
  })
}

// ============================================================
// COLLABORATION TYPES & COLOR ACCENTS
// ============================================================

export const collaborationTypes = [
  { value: '', label: 'Choose a collaboration type' },
  { value: 'Software development', label: 'Software development' },
  { value: 'Web development', label: 'Web development' },
  { value: 'App development', label: 'App development' },
  { value: 'UI/UX design', label: 'UI/UX design' },
  { value: 'Graphic design', label: 'Graphic design' },
  { value: 'Product collaboration', label: 'Product collaboration' },
  { value: 'Marketing campaign', label: 'Marketing campaign' },
  { value: 'Digital marketing', label: 'Digital marketing' },
  { value: 'Social media marketing', label: 'Social media marketing' },
  { value: 'Content creation', label: 'Content creation' },
  { value: 'Content strategy', label: 'Content strategy' },
  { value: 'Influencer campaign', label: 'Influencer campaign' },
  { value: 'Brand partnership', label: 'Brand partnership' },
  { value: 'Event partnership', label: 'Event partnership' },
  { value: 'Event planning', label: 'Event planning' },
  { value: 'Photography', label: 'Photography' },
  { value: 'Videography', label: 'Videography' },
  { value: 'Video production', label: 'Video production' },
  { value: 'Copywriting', label: 'Copywriting' },
  { value: 'Public relations', label: 'Public relations' },
  { value: 'Advertising', label: 'Advertising' },
  { value: 'Sales partnership', label: 'Sales partnership' },
  { value: 'Business development', label: 'Business development' },
  { value: 'Research project', label: 'Research project' },
  { value: 'Consulting', label: 'Consulting' },
  { value: 'Startup collaboration', label: 'Startup collaboration' },
  { value: 'Community project', label: 'Community project' },
  { value: 'Education and training', label: 'Education and training' },
  { value: 'Music and entertainment', label: 'Music and entertainment' },
  { value: 'Fashion collaboration', label: 'Fashion collaboration' },
  { value: 'Creative project', label: 'Creative project' },
  { value: 'Nonprofit / social impact', label: 'Nonprofit / social impact' },
  { value: 'Other', label: 'Other' }
]

export const projectColors = [
  { value: 'yellow', label: 'Sunflower Yellow', color: '#EAB308' },
  { value: 'green', label: 'Emerald Green', color: '#2E8B57' },
  { value: 'blue', label: 'Sky Blue', color: '#4A90E2' },
  { value: 'purple', label: 'Royal Purple', color: '#7C3AED' },
  { value: 'coral', label: 'Coral', color: '#E07A5F' },
  { value: 'orange', label: 'Orange', color: '#F97316' },
  { value: 'rose', label: 'Rose', color: '#E11D48' }
]

export function createCollaborationTypeSelect(initialValue = '') {
  const typeSelect = document.createElement('select')
  typeSelect.className = 'project-type-select'
  typeSelect.required = true

  collaborationTypes.forEach(({ value, label }) => {
    const opt = document.createElement('option')
    opt.value = value
    opt.textContent = label
    if (value === '') {
      opt.disabled = true
      if (!initialValue) opt.selected = true
    } else if (value === initialValue) {
      opt.selected = true
    }
    typeSelect.append(opt)
  })

  return typeSelect
}

export function createColorPicker(initialColor = 'yellow', onColorChange = () => {}) {
  let selected = projectColors.some(({ value }) => value === initialColor) ? initialColor : 'yellow'
  const colorPicker = make('div', 'project-color-picker')
  const colorSelect = document.createElement('select')
  colorSelect.className = 'project-color-select'
  colorSelect.setAttribute('aria-label', 'Project color accent')
  const selectedSwatch = make('span', 'project-color-swatch')

  projectColors.forEach(({ value, label, color }) => {
    const option = document.createElement('option')
    option.value = value
    option.textContent = label
    option.dataset.color = color
    colorSelect.append(option)
  })

  const updateSelection = () => {
    selected = colorSelect.value
    selectedSwatch.style.backgroundColor =
      projectColors.find(({ value }) => value === selected)?.color || ''
  }

  colorSelect.value = selected
  updateSelection()
  colorSelect.addEventListener('change', () => {
    updateSelection()
    onColorChange(selected)
  })
  colorPicker.append(selectedSwatch, colorSelect)

  return {
    element: colorPicker,
    getColor: () => selected,
    setColor: (val) => {
      selected = projectColors.some(({ value }) => value === val) ? val : 'yellow'
      colorSelect.value = selected
      updateSelection()
    }
  }
}

function createProjectTimeSpanSelector() {
  const field = make('div', 'project-time-span-field')
  const fieldLabel = make('span', 'project-time-span-label', 'Time Span')
  const hiddenInput = make('input')
  hiddenInput.type = 'hidden'
  hiddenInput.name = 'timeSpan'

  const startInput = make('input')
  startInput.type = 'hidden'
  startInput.value = toLocalDateKey()

  const endInput = make('input')
  endInput.type = 'hidden'
  const dateCalendars = createProjectDateRangeCalendars(startInput, endInput, () => {
    updatePreview()
  })
  const dates = dateCalendars.element

  const preview = make('output', 'project-time-span-preview', 'Choose an end date to preview the time span.')
  preview.setAttribute('aria-live', 'polite')
  preview.setAttribute('aria-label', 'Calculated project time span')

  const updatePreview = () => {
    const startDate = new Date(`${startInput.value}T00:00:00Z`)
    const endDate = new Date(`${endInput.value}T00:00:00Z`)
    const validStart = Number.isFinite(startDate.getTime())
    const validEnd = Number.isFinite(endDate.getTime())

    if (!validStart || !validEnd) {
      hiddenInput.value = ''
      preview.textContent = 'Choose an end date to preview the time span.'
      return
    }

    const durationDays = (endDate.getTime() - startDate.getTime()) / 86400000
    if (durationDays < 0) {
      hiddenInput.value = ''
      preview.textContent = 'End date must be on or after the start date.'
      return
    }

    const durationWeeks = durationDays / 7
    const formattedWeeks = Math.round(durationWeeks)
    const unit = formattedWeeks === 1 ? 'Week' : 'Weeks'
    const monthLabel = formatDurationInMonths(durationWeeks)
    const dateFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
    const formattedSpan = `${formattedWeeks} ${unit} (about ${monthLabel}; ${dateFormatter.format(startDate)} – ${dateFormatter.format(endDate)})`
    hiddenInput.value = formattedSpan
    preview.textContent = formattedSpan
  }

  startInput.addEventListener('change', updatePreview)
  endInput.addEventListener('change', updatePreview)

  field.append(fieldLabel, dates, preview, hiddenInput)
  return {
    element: field,
    input: hiddenInput,
    focus: dateCalendars.focus,
    getDates: () => ({ startDate: startInput.value, dueDate: endInput.value })
  }
}

function createProjectDateRangeCalendars(startInput, endInput, onChange) {
  const container = make('section', 'project-time-span-calendars')
  container.setAttribute('aria-label', 'Choose project start and end dates')

  const todayKey = toLocalDateKey()
  const today = new Date(`${todayKey}T00:00:00`)
  const firstMonth = new Date(today.getFullYear(), today.getMonth(), 1)

  const calendarGrid = make('div', 'project-time-span-calendar-grid')
  const panels = [
    { key: 'start', label: 'Start Date' },
    { key: 'end', label: 'Due Date' }
  ].map(({ key, label }, panelIndex) => {
    const panel = make('section', 'project-time-span-calendar')
    const monthDate = new Date(firstMonth.getFullYear(), firstMonth.getMonth() + panelIndex, 1)
    const heading = make('h4', 'project-time-span-calendar-heading', label)
    const monthNavigation = make('div', 'project-time-span-calendar-navigation')
    const previous = make('button', 'project-time-span-calendar-nav', '‹')
    previous.type = 'button'
    previous.setAttribute('aria-label', `Show previous ${label.toLowerCase()} month`)
    const month = make('div', 'project-time-span-calendar-month')
    const next = make('button', 'project-time-span-calendar-nav', '›')
    next.type = 'button'
    next.setAttribute('aria-label', `Show next ${label.toLowerCase()} month`)
    monthNavigation.append(previous, month, next)
    const weekdays = make('div', 'project-time-span-calendar-weekdays')
    ;['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].forEach(day => {
      weekdays.append(make('span', '', day))
    })
    const days = make('div', 'project-time-span-calendar-days')
    const selectedDate = make('output', 'project-time-span-selected-date')
    selectedDate.setAttribute('aria-live', 'polite')
    panel.append(heading, monthNavigation, weekdays, days, selectedDate)
    calendarGrid.append(panel)
    const panelState = { key, month, days, selectedDate, monthDate, previous }
    previous.addEventListener('click', () => {
      if (previous.disabled) return
      panelState.monthDate = new Date(
        panelState.monthDate.getFullYear(),
        panelState.monthDate.getMonth() - 1,
        1
      )
      render()
    })
    next.addEventListener('click', () => {
      panelState.monthDate = new Date(
        panelState.monthDate.getFullYear(),
        panelState.monthDate.getMonth() + 1,
        1
      )
      render()
    })
    return panelState
  })

  const render = () => {
    panels.forEach(panel => {
      const monthDate = panel.monthDate
      const year = monthDate.getFullYear()
      const monthIndex = monthDate.getMonth()
      const monthName = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(monthDate)
      panel.month.textContent = monthName
      panel.previous.disabled = monthDate <= firstMonth
      panel.days.replaceChildren()

      const firstWeekday = (new Date(year, monthIndex, 1).getDay() + 6) % 7
      for (let blank = 0; blank < firstWeekday; blank += 1) {
        panel.days.append(make('span', 'project-time-span-calendar-blank'))
      }

      const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
      for (let day = 1; day <= daysInMonth; day += 1) {
        const dateKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        const selectedKey = panel.key === 'start' ? startInput.value : endInput.value
        const isPast = dateKey < todayKey
        const beforeStart = panel.key === 'end' && startInput.value && dateKey < startInput.value
        const dayButton = make('button', 'project-time-span-calendar-day', String(day))
        dayButton.type = 'button'
        dayButton.dataset.dateKey = dateKey
        dayButton.disabled = isPast || Boolean(beforeStart)
        dayButton.setAttribute('aria-label', new Intl.DateTimeFormat('en-US', {
          timeZone: 'UTC',
          month: 'long',
          day: 'numeric',
          year: 'numeric'
        }).format(new Date(`${dateKey}T00:00:00Z`)))
        if (dateKey === todayKey) dayButton.classList.add('is-today')
        if (dateKey === selectedKey) {
          dayButton.classList.add(panel.key === 'start' ? 'is-start-date' : 'is-end-date')
          dayButton.setAttribute('aria-pressed', 'true')
        } else {
          dayButton.setAttribute('aria-pressed', 'false')
        }
        if (startInput.value && endInput.value && dateKey > startInput.value && dateKey < endInput.value) {
          dayButton.classList.add('is-in-range')
        }
        dayButton.addEventListener('click', () => {
          if (panel.key === 'start') {
            startInput.value = dateKey
            if (endInput.value && endInput.value < dateKey) {
              endInput.value = dateKey
              const endPanel = panels.find(item => item.key === 'end')
              if (endPanel) {
                endPanel.monthDate = new Date(year, monthIndex, 1)
              }
            }
          } else {
            endInput.value = dateKey
          }
          onChange()
          render()
          panel.days.querySelector(`[data-date-key="${dateKey}"]`)?.focus()
        })
        panel.days.append(dayButton)
      }

      const selectedDateKey = panel.key === 'start' ? startInput.value : endInput.value
      panel.selectedDate.textContent = selectedDateKey
        ? new Intl.DateTimeFormat('en-US', {
          timeZone: 'UTC',
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        }).format(new Date(`${selectedDateKey}T00:00:00Z`))
        : 'Select a date'
    })
  }

  container.append(calendarGrid)
  render()
  return {
    element: container,
    render,
    focus: () => panels[0].days.querySelector('button:not(:disabled)')?.focus()
  }
}

function formatDurationInMonths(weeks) {
  if (weeks < 4) return 'Less than 1 Month'
  const months = Math.round(weeks / 4)
  return `${months} ${months === 1 ? 'Month' : 'Months'}`
}

export function formatProjectTimeSpanForDisplay(value) {
  const timeSpan = String(value || '').trim()
  const monthMatch = timeSpan.match(/\(about\s+([^;]+);/i)
  if (monthMatch) return monthMatch[1].trim()

  const weekMatch = timeSpan.match(/^(\d+(?:\.\d+)?)\s+weeks?\b/i)
  if (weekMatch) return formatDurationInMonths(Number(weekMatch[1]))

  return timeSpan || 'Ongoing'
}

// ============================================================
// CREATE GROUP PROJECT
// ============================================================

export function openCreateProjectModal() {
  const backdrop = make('div', 'modal-backdrop')
  backdrop.addEventListener('click', e => {
    if (e.target === backdrop) closeModal()
  })

  const form = make('form', 'modal')
  form.id = 'create-group-project-form'

  const close = make('button', 'close-modal', '×')
  close.type = 'button'
  close.addEventListener('click', closeModal)

  const title = make('h2', '', 'Create Group Project')
  const copy = make(
    'p',
    'modal-copy',
    'Start a shared board for your team to plan, break into sprints, assign, and track work.'
  )

  const nameLabel = make('label', '', 'Project Name')
  const nameInput = make('input')
  nameInput.required = true
  nameInput.placeholder = 'e.g. Mobile App v2'
  nameLabel.append(nameInput)

  const typeLabel = make('label', '', 'Collaboration Type')
  const typeSelect = createCollaborationTypeSelect('')
  typeLabel.append(typeSelect)

  const timeSpanSelector = createProjectTimeSpanSelector()

  const descLabel = make('label', '', 'Description')
  const descInput = document.createElement('textarea')
  descInput.rows = 3
  descInput.maxLength = 10000
  descInput.required = true
  descInput.placeholder = 'Brief purpose of this project board'
  descLabel.append(descInput)

  const colorLabel = make('label', '', 'Color Accent')
  const colorPickerObj = createColorPicker('yellow')
  colorLabel.append(colorPickerObj.element)

  const submit = make('button', 'primary-button full gold', 'Create Project Board')
  submit.type = 'submit'
  const errorNotice = make('p', 'project-form-error')
  errorNotice.setAttribute('role', 'alert')
  errorNotice.hidden = true

  form.append(
    close,
    make('p', 'eyebrow', 'NEW GROUP PROJECT'),
    title,
    copy,
    nameLabel,
    typeLabel,
    timeSpanSelector.element,
    descLabel,
    colorLabel,
    errorNotice,
    submit
  )

  form.addEventListener('submit', async e => {
    e.preventDefault()

    const name = nameInput.value.trim()
    const projectType = typeSelect.value || 'General Collaboration'
    const timeSpan = timeSpanSelector.input.value.trim()
    const projectDates = timeSpanSelector.getDates()
    const description = descInput.value.trim()
    const color = colorPickerObj.getColor()

    if (!name) {
      nameInput.focus()
      return
    }

    if (!timeSpan) {
      errorNotice.textContent = 'Select both a start date and a due date for the project.'
      errorNotice.hidden = false
      timeSpanSelector.focus()
      return
    }
    if (!description) {
      errorNotice.textContent = 'Enter a project description.'
      errorNotice.hidden = false
      descInput.focus()
      return
    }
    errorNotice.hidden = true

    const duplicateProject = projects.some(
      p => String(p.name).trim().toLowerCase() === name.toLowerCase()
    )
    if (duplicateProject) {
      nameInput.setCustomValidity('A project with this name already exists.')
      nameInput.reportValidity()
      return
    }
    nameInput.setCustomValidity('')

    const timestamp = Date.now()
    const newProject = {
      id: `p_${timestamp}`,
      name,
      projectType,
      timeSpan,
      color,
      description,
      creatorEmail: currentUser?.email || 'admin@collab.io',
      creatorName: currentUser?.name || 'Alex Morgan',
      creatorInitials: currentUser?.initials || 'AM',
      invitedMembers: [],
      teamMemberCount: 0,
      sprints: []
    }

    const restoreSubmit = setDashboardButtonLoading(submit, 'Creating project…')
    try {
      const response = await api.post('/projects', {
        project_id: newProject.id,
        name: newProject.name,
        project_type: newProject.projectType,
        time_span: newProject.timeSpan,
        start_date: projectDates.startDate,
        due_date: projectDates.dueDate,
        description: newProject.description,
        color: newProject.color,
        invited_members: newProject.invitedMembers,
        sprints: newProject.sprints
      })
      const savedProject = response?.data?.project
      if (!savedProject) {
        throw new Error('The server did not return the created project.')
      }
      const savedNotification = response?.data?.notification
      if (!savedNotification) {
        throw new Error('The server did not return the project notification.')
      }
      addPersistedNotification(savedNotification)
      projects.push({
        ...newProject,
        ...savedProject,
        id: savedProject.project_id || savedProject.id || newProject.id,
        projectId: savedProject.project_id || savedProject.id || newProject.id,
        projectType: savedProject.project_type || newProject.projectType,
        timeSpan: savedProject.time_span || newProject.timeSpan,
        startDate: savedProject.start_date || projectDates.startDate,
        dueDate: savedProject.due_date || projectDates.dueDate,
        creatorFirebaseUid: savedProject.creator_firebase_uid || null,
        creatorEmail: savedProject.creator_email || newProject.creatorEmail,
        creatorName: savedProject.creator_name || newProject.creatorName,
        creatorInitials: savedProject.creator_initials || newProject.creatorInitials
      })
    } catch (error) {
      errorNotice.textContent = error.message || 'The project could not be created. Please try again.'
      errorNotice.hidden = false
      restoreSubmit()
      return
    }

    closeModal()
    renderProjectNav()
    hub.renderAdminProjectsTable?.()
    switchView(name)

    addAuditLog(
      'Project created',
      `${currentUser?.name || 'Admin'} created ${projectType} project "${name}".`,
      'sync'
    )
    showDashboardToast(`Project "${name}" created.`, 'success')

  })

  backdrop.append(form)
  root.replaceChildren(backdrop)
  nameInput.focus()
}

// ============================================================
// EDIT GROUP PROJECT
// ============================================================

export function openEditProjectModal(project) {
  if (!project) return

  const backdrop = make('div', 'modal-backdrop')
  backdrop.addEventListener('click', e => {
    if (e.target === backdrop) closeModal()
  })

  const form = make('form', 'modal')

  const close = make('button', 'close-modal', '×')
  close.type = 'button'
  close.addEventListener('click', closeModal)

  const title = make('h2', '', 'Edit Group Project')
  const copy = make(
    'p',
    'modal-copy',
    'Update project name, collaboration type, timeline schedule, description, or color theme.'
  )

  const nameLabel = make('label', '', 'Project Name')
  const nameInput = make('input')
  nameInput.required = true
  nameInput.value = project.name || ''
  nameInput.placeholder = 'e.g. Mobile App v2'
  nameLabel.append(nameInput)

  const typeLabel = make('label', '', 'Collaboration Type')
  const typeSelect = createCollaborationTypeSelect(project.projectType || '')
  typeLabel.append(typeSelect)

  const timeSpanLabel = make('label', '', 'Time Span (Optional)')
  const timeSpanInput = make('input')
  timeSpanInput.placeholder = 'e.g. 6 weeks, Q4 2026, or Oct 15 - Dec 1'
  timeSpanInput.value = project.timeSpan || ''
  timeSpanLabel.append(timeSpanInput)

  const descLabel = make('label', '', 'Description')
  const descInput = document.createElement('textarea')
  descInput.rows = 3
  descInput.maxLength = 10000
  descInput.required = true
  descInput.placeholder = 'Brief purpose of this project board'
  descInput.value = project.description || ''
  descLabel.append(descInput)

  const colorLabel = make('label', '', 'Color Accent')
  const colorPickerObj = createColorPicker(project.color || 'yellow')
  colorLabel.append(colorPickerObj.element)

  const submit = make('button', 'primary-button full gold', 'Save Project Changes')
  submit.type = 'submit'
  const errorNotice = make('p', 'project-form-error')
  errorNotice.setAttribute('role', 'alert')
  errorNotice.hidden = true

  form.append(
    close,
    make('p', 'eyebrow', 'EDIT GROUP PROJECT'),
    title,
    copy,
    nameLabel,
    typeLabel,
    timeSpanLabel,
    descLabel,
    colorLabel,
    errorNotice,
    submit
  )

  form.addEventListener('submit', async e => {
    e.preventDefault()

    const name = nameInput.value.trim()
    const projectType = typeSelect.value || project.projectType || 'Product collaboration'
    const timeSpan = timeSpanInput.value.trim() || 'Ongoing'
    const description = descInput.value.trim()
    const color = colorPickerObj.getColor()

    if (!name) {
      nameInput.focus()
      return
    }

    if (!description) {
      errorNotice.textContent = 'Enter a project description.'
      errorNotice.hidden = false
      descInput.focus()
      return
    }
    errorNotice.hidden = true

    const duplicate = projects.some(
      p => p.id !== project.id && String(p.name).trim().toLowerCase() === name.toLowerCase()
    )
    if (duplicate) {
      nameInput.setCustomValidity('Another project with this name already exists.')
      nameInput.reportValidity()
      return
    }
    nameInput.setCustomValidity('')

    const oldName = project.name
    const restoreSubmit = setDashboardButtonLoading(submit, 'Saving project…')
    try {
      const response = await api.put(`/projects/${encodeURIComponent(project.projectId || project.id)}`, {
        name,
        project_type: projectType,
        time_span: timeSpan,
        description,
        color
      })
      const savedProject = response?.data?.project
      if (!savedProject) {
        throw new Error('The server did not return the updated project.')
      }
      project.name = savedProject.name || name
      project.projectType = savedProject.project_type || projectType
      project.timeSpan = savedProject.time_span || timeSpan
      project.description = savedProject.description ?? description
      project.color = savedProject.color || color
    } catch (error) {
      errorNotice.textContent = error.message || 'The project could not be updated. Please try again.'
      errorNotice.hidden = false
      restoreSubmit()
      return
    }

    if (oldName !== name) {
      tasks.forEach(t => {
        if (t.project === oldName) {
          t.project = name
        }
      })
      saveTasks()

      if (activeView === oldName) {
        setActiveView(name)
      }
    }

    saveProjects()
    closeModal()

    renderProjectNav()
    hub.renderAdminProjectsTable?.()
    hub.renderTasks?.()
    hub.renderOverviewPanel?.()
    hub.renderListView?.()

    addAuditLog(
      'Project updated',
      `${currentUser?.name || 'Admin'} updated project "${name}".`,
      'edit'
    )

    pushNotification(
      'Project Updated',
      `"${name}" details were updated.`,
      '✏️',
      'teal-bg'
    )
    showDashboardToast(`Project "${name}" updated.`, 'success')
  })

  backdrop.append(form)
  root.replaceChildren(backdrop)
  nameInput.focus()
}

// ============================================================
// BREAK PROJECT INTO SMALL SPRINTS
// ============================================================

export function openAddSprintModal(projectOverride = null) {
  const proj = projectOverride || getActiveProject()

  const isCreator =
    proj?.creatorFirebaseUid === firebaseAuth.currentUser?.uid

  if (!isCreator) {
    showPermissionNotice()
    return
  }

  if (!proj) {
    return
  }

  const backdrop =
    make('div', 'modal-backdrop')
  backdrop.addEventListener('click', event => {
    if (event.target === backdrop) closeModal()
  })

  const form =
    make('form', 'modal')

  const close =
    make('button', 'close-modal', '×')

  close.type = 'button'

  close.addEventListener(
    'click',
    closeModal
  )

  const title =
    make(
      'h2',
      '',
      `Break ${proj.name} into Sprint`
    )

  const copy =
    make(
      'p',
      'modal-copy',
      `Project Creator (${proj.creatorName}): Define a focused milestone sprint for your team.`
    )

  const nameLabel =
    make(
      'label',
      '',
      'Sprint / Milestone Title'
    )

  const nameInput =
    make('input')

  nameInput.required = true

  const count =
    (proj.sprints
      ? proj.sprints.length
      : 0) + 1

  nameInput.placeholder =
    `e.g. Sprint ${count}: Core Implementation`

  nameLabel.append(nameInput)

  const statusLabel =
    make(
      'label',
      '',
      'Sprint Status'
    )

  const statusSelect =
    document.createElement('select')

  ;[
    'Active',
    'Upcoming',
    'Completed'
  ].forEach(status => {
    const opt =
      make(
        'option',
        '',
        status
      )

    opt.value = status

    statusSelect.append(opt)
  })

  statusLabel.append(statusSelect)

  const submit =
    make(
      'button',
      'primary-button full gold',
      'Add Sprint to Project'
    )

  submit.type = 'submit'

  form.append(
    close,
    make(
      'p',
      'eyebrow',
      'PROJECT MILESTONE'
    ),
    title,
    copy,
    nameLabel,
    statusLabel,
    submit
  )

  form.addEventListener(
    'submit',
    async e => {
      e.preventDefault()

      const sName =
        nameInput.value.trim()

      if (!sName) {
        nameInput.focus()
        return
      }

      const updatedSprints = [
        ...(Array.isArray(proj.sprints) ? proj.sprints : []),
        {
        id: `s_${Date.now()}`,
        name: sName,
        status: statusSelect.value
        }
      ]
      const restoreSubmit = setDashboardButtonLoading(submit, 'Adding sprint…')
      try {
        await api.put(
          `/projects/${encodeURIComponent(proj.projectId || proj.id)}`,
          { sprints: updatedSprints }
        )
      } catch (error) {
        restoreSubmit()
        showDashboardToast(error.message || 'The sprint could not be saved.', 'error')
        return
      }
      proj.sprints = updatedSprints

      closeModal()

      updateUserUI()
      hub.renderAdminTasksTable?.()

      addAuditLog(
        'Sprint created',
        `${proj.creatorName} added "${sName}" to ${proj.name}.`,
        'flag'
      )

      pushNotification(
        'Sprint Created',
        `"${sName}" added to ${proj.name}`,
        '⚡',
        'blue-bg'
      )
      showDashboardToast(`Sprint "${sName}" added to ${proj.name}.`, 'success')
    }
  )

  backdrop.append(form)

  root.replaceChildren(backdrop)

  nameInput.focus()
}

// ============================================================
// INVITE A REGISTERED COLLAB USER TO A PROJECT
// ============================================================

function prepareInvitationAvatar(source) {
  const value = String(source || '').trim()
  if (!value) return Promise.resolve('')

  if (value.startsWith('https://')) {
    const url = new URL(value)
    if (url.protocol !== 'https:' || !url.hostname || value.length > 2048) {
      return Promise.reject(new Error('The profile photo URL is invalid.'))
    }
    return Promise.resolve(value)
  }

  if (!/^data:image\/(?:jpeg|png|webp|gif);base64,/.test(value)) {
    return Promise.reject(new Error('The profile photo format is not supported.'))
  }

  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const size = 256
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const context = canvas.getContext('2d')
      if (!context) {
        reject(new Error('The profile photo could not be prepared.'))
        return
      }
      const scale = Math.max(size / image.width, size / image.height)
      const width = image.width * scale
      const height = image.height * scale
      context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height)
      resolve(canvas.toDataURL('image/jpeg', 0.75))
    }
    image.onerror = () => reject(new Error('The profile photo could not be loaded.'))
    image.src = value
  })
}

export function openInviteCollaboratorModal(
  targetProject = null
) {
  const ownedProjects = projects.filter(project =>
    project.creatorFirebaseUid && project.creatorFirebaseUid === firebaseAuth.currentUser?.uid
  )
  const activeProject = getActiveProject()
  const proj = targetProject || ownedProjects.find(project => project.id === activeProject?.id) || ownedProjects[0]
  if (!ownedProjects.length || (targetProject && !ownedProjects.some(project => project.id === targetProject.id))) {
    showPermissionNotice()
    return
  }

  const backdrop =
    make('div', 'modal-backdrop')
  backdrop.addEventListener('click', event => {
    if (event.target === backdrop) closeModal()
  })

  const form =
    make('form', 'modal messages-create-modal project-invite-modal')
  form.setAttribute('role', 'dialog')
  form.setAttribute('aria-modal', 'true')

  const close =
    make(
      'button',
      'close-modal',
      '×'
    )

  close.type = 'button'
  close.setAttribute('aria-label', 'Close dialog')

  close.addEventListener(
    'click',
    closeModal
  )

  const title =
    make(
      'h2',
      '',
      `Invite Member to ${proj ? proj.name : 'Workspace'}`
    )
  title.id = 'project-invite-modal-title'
  form.setAttribute('aria-labelledby', title.id)

  const copy =
    make(
      'p',
      'modal-copy',
      'Search for an existing Collab user. They will receive an invitation in their dashboard and can accept or decline it there.'
    )
  const header = make('header', 'messages-create-header project-invite-header')
  header.append(make('span', 'messages-create-eyebrow', 'PROJECT COLLABORATOR'), title, copy, close)

  const searchLabel = make('label', 'messages-create-label', 'Search registered Collab users')
  const searchInput = make('input')
  searchInput.type = 'search'
  searchInput.placeholder = 'Search by name or email...'
  searchInput.autocomplete = 'off'
  searchInput.minLength = 2
  searchInput.setAttribute('aria-label', 'Search registered Collab users')
  searchLabel.append(searchInput)

  const searchStatus = make('p', 'project-invite-search-status')
  searchStatus.setAttribute('role', 'status')
  searchStatus.setAttribute('aria-live', 'polite')
  searchStatus.textContent = 'Enter at least 2 characters to search.'

  const searchResults = make('div', 'invite-user-search-results')
  const selectedUsersLabel = make('p', 'messages-create-label project-invite-section-label', 'Selected users')
  const selectedUsersList = make('div', 'invite-selected-users')
  selectedUsersLabel.hidden = true
  selectedUsersList.hidden = true

  const selectedUsers = new Map()
  let searchTimer = null
  let searchSequence = 0

  const roleLabel =
    make(
      'label',
      'messages-create-label',
      'Role & Permissions'
    )

  const roleSelect =
    document.createElement('select')

  const invitationRoleGroups = [
    {
      label: 'General',
      roles: [
        'Workspace Admin',
        'Product Lead',
        'Designer',
        'Engineer',
        'QA Specialist',
        'Content Strategist',
        'Member'
      ]
    },
    {
      label: 'Project & delivery',
      roles: [
        'Project Manager',
        'Program Manager',
        'Scrum Master',
        'Agile Coach',
        'Product Owner',
        'Delivery Manager',
        'Release Manager'
      ]
    },
    {
      label: 'Analysis & data',
      roles: [
        'Business Analyst',
        'Systems Analyst',
        'Data Analyst',
        'Data Scientist',
        'Machine Learning Engineer',
        'Researcher'
      ]
    },
    {
      label: 'Engineering & quality',
      roles: [
        'DevOps Engineer',
        'Site Reliability Engineer',
        'Security Engineer',
        'QA Lead',
        'Test Automation Engineer',
        'Frontend Developer',
        'Backend Developer',
        'Full-Stack Developer',
        'Mobile Developer',
        'API Developer',
        'Database Administrator'
      ]
    },
    {
      label: 'Design & research',
      roles: [
        'UX Researcher',
        'UX Writer',
        'UI Designer',
        'Product Designer',
        'Visual Designer',
        'Brand Designer',
        'Motion Designer'
      ]
    },
    {
      label: 'Content & marketing',
      roles: [
        'Technical Writer',
        'Documentation Specialist',
        'Content Writer',
        'Copywriter',
        'Editor',
        'SEO Specialist',
        'Marketing Manager',
        'Growth Marketer',
        'Social Media Manager',
        'Community Manager'
      ]
    },
    {
      label: 'Business & operations',
      roles: [
        'Customer Success Manager',
        'Support Specialist',
        'Sales Lead',
        'Operations Manager',
        'Finance Manager',
        'HR Manager',
        'Legal Advisor',
        'Stakeholder',
        'Business Owner'
      ]
    }
  ]
  invitationRoleGroups.forEach(group => {
    const optionGroup = make('optgroup')
    optionGroup.label = group.label
    group.roles.forEach(role => {
      const option = make('option', '', role)
      option.value = role
      optionGroup.append(option)
    })
    roleSelect.append(optionGroup)
  })

  roleLabel.append(roleSelect)

  // ==========================================================
  // PROJECT
  // ==========================================================

  const projectLabel =
    make(
      'label',
      'messages-create-label',
      'Assign to Project'
    )

  const projectSelect =
    document.createElement('select')

  ownedProjects.forEach(project => {
    const opt =
      make(
        'option',
        '',
        project.name
      )

    opt.value =
      project.id

    if (targetProject ? project.id === targetProject.id : project.name === proj?.name) {
      opt.selected = true
    }

    projectSelect.append(opt)
  })

  projectLabel.append(projectSelect)

  // ==========================================================
  // SUBMIT
  // ==========================================================

  const submit =
    make(
      'button',
      'primary-button full gold',
      ''
    )

  submit.type = 'submit'
  submit.disabled = true
  const submitLabel = make('span', '', 'Send Invitation')
  const submitSpinner = make('span', 'invite-submit-spinner')
  submitSpinner.setAttribute('aria-hidden', 'true')
  submitSpinner.hidden = true
  submit.append(submitSpinner, submitLabel)
  const errorNotice = make('p', 'project-form-error')
  errorNotice.setAttribute('role', 'alert')
  errorNotice.hidden = true

  form.append(
    header,
    searchLabel,
    searchStatus,
    searchResults,
    selectedUsersLabel,
    selectedUsersList,
    roleLabel,
    projectLabel,
    errorNotice,
    submit
  )
  submit.classList.add('messages-create-submit')

  const renderSelectedUsers = () => {
    selectedUsersList.replaceChildren()
    selectedUsers.forEach(user => {
      const entry = make('div', 'invite-selected-user')
      entry.append(
        make('span', '', `${user.name} (${user.email})`)
      )
      const remove = make('button', 'invite-selected-user-remove', 'Remove')
      remove.type = 'button'
      remove.setAttribute('aria-label', `Remove ${user.name} from invitation`)
      remove.addEventListener('click', () => {
        selectedUsers.delete(user.firebaseUid)
        renderSelectedUsers()
        searchInput.dispatchEvent(new Event('input'))
      })
      entry.append(remove)
      selectedUsersList.append(entry)
    })
    const hasSelection = selectedUsers.size > 0
    selectedUsersLabel.hidden = !hasSelection
    selectedUsersList.hidden = !hasSelection
    submit.disabled = !hasSelection
  }

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer)
    const requestSequence = ++searchSequence
    const search = searchInput.value.trim()
    renderSelectedUsers()
    errorNotice.hidden = true
    searchResults.replaceChildren()

    if (search.length < 2) {
      searchStatus.textContent = 'Enter at least 2 characters to search.'
      return
    }

    searchStatus.textContent = 'Waiting to search...'
    searchTimer = setTimeout(async () => {
      searchStatus.textContent = 'Searching registered users...'
      try {
        const response = await api.get(`/users/search?q=${encodeURIComponent(search)}`)
        if (requestSequence !== searchSequence) return
        const users = response?.users
        if (!Array.isArray(users)) {
          throw new Error('The server returned an invalid user search response.')
        }
        searchResults.replaceChildren()
        const validUsers = users
          .map(user => {
            const firebaseUid = user?.firebaseUid || user?.firebase_uid || user?.uid
            const email = user?.email
            const name = user?.name || user?.displayName || user?.display_name || email
            return firebaseUid && email && name ? { firebaseUid, email, name } : null
          })
          .filter(Boolean)

        if (!validUsers.length) {
          searchStatus.textContent = 'No users found.'
          return
        }

        validUsers.forEach(selectedUser => {
          const { firebaseUid, email, name } = selectedUser
          const resultButton = make('button', 'invite-user-search-result')
          resultButton.type = 'button'
          resultButton.disabled = selectedUsers.has(firebaseUid)
          resultButton.append(
            make('span', 'messages-create-avatar', name.split(/\s+/).filter(Boolean).map(part => part[0]).join('').slice(0, 2).toUpperCase()),
            make('strong', '', name),
            make('small', '', email),
            make('span', 'project-invite-result-action', resultButton.disabled ? 'Already selected' : 'Add')
          )
          resultButton.addEventListener('click', () => {
            if (selectedUsers.has(firebaseUid)) return
            selectedUsers.set(firebaseUid, selectedUser)
            renderSelectedUsers()
            resultButton.disabled = true
            resultButton.lastElementChild.textContent = 'Already selected'
            errorNotice.hidden = true
          })
          searchResults.append(resultButton)
        })
        searchStatus.textContent = `${validUsers.length} user${validUsers.length === 1 ? '' : 's'} found. Select one to invite.`
      } catch (error) {
        if (requestSequence !== searchSequence) return
        searchStatus.textContent = error.message || 'User search failed. Please try again.'
      }
    }, 300)
  })

  form.addEventListener(
    'submit',
    async e => {
      e.preventDefault()
      const role =
        roleSelect.value

      if (!selectedUsers.size) {
        errorNotice.textContent = 'Search for and select at least one registered Collab user first.'
        errorNotice.hidden = false
        return
      }

      const invitees = [...selectedUsers.values()]
      const selectedProjectId = projectSelect.value
      submit.disabled = true
      submitSpinner.hidden = false
      submit.setAttribute('aria-busy', 'true')
      submitLabel.textContent = 'Sending invitations...'
      try {
        const inviterAvatar = await prepareInvitationAvatar(
          currentUser.profileImage || currentUser.photoURL || firebaseAuth.currentUser?.photoURL
        )
        await api.post('/invitations', {
          firebaseUids: invitees.map(user => user.firebaseUid),
          firebaseUid: invitees.length === 1 ? invitees[0].firebaseUid : undefined,
          users: invitees.map(user => ({
            firebaseUid: user.firebaseUid,
            email: user.email
          })),
          emails: invitees.map(user => user.email),
          role,
          projectId: selectedProjectId,
          inviterAvatar
        })
      } catch (error) {
        errorNotice.textContent = error.code
          ? `${error.message} (${error.code})`
          : error.message || 'The invitation could not be sent.'
        errorNotice.hidden = false
        submit.disabled = false
        submitSpinner.hidden = true
        submit.removeAttribute('aria-busy')
        submitLabel.textContent = 'Send Invitation'
        return
      }

      addAuditLog(
        'Member invited',
        `${currentUser.name || 'Project creator'} invited ${invitees.map(user => user.name).join(', ')} to ${proj.name}.`,
        'userPlus'
      )
      pushNotification(
        'Invitation Sent',
        `${invitees.length} ${invitees.length === 1 ? 'person has' : 'people have'} been invited to ${proj.name}.`,
        '✉️',
        'blue-bg'
      )
      closeModal()
      showDashboardToast(
        `Invitation${invitees.length === 1 ? '' : 's'} sent to ${invitees.map(user => user.name).join(', ')}.`,
        'success'
      )
    }
  )

  backdrop.append(form)

  root.replaceChildren(backdrop)

  searchInput.focus()
}

// ============================================================
// MANAGE & REMOVE COLLABORATORS MODAL
// ============================================================

function openLegacyManageCollaboratorsModal() {
  const proj =
    getActiveProject()

  if (!proj) {
    return
  }

  const isCreator =
    isCurrentUserProjectCreator()

  const backdrop =
    make(
      'div',
      'modal-backdrop'
    )

  const box =
    make(
      'div',
      'modal'
    )

  box.style.maxWidth =
    '540px'

  const close =
    make(
      'button',
      'close-modal',
      '×'
    )

  close.type = 'button'

  close.addEventListener(
    'click',
    closeModal
  )

  const title =
    make(
      'h2',
      '',
      `${proj.name} — Team Collaborators`
    )

  const copy =
    make(
      'p',
      'modal-copy',
      `Collaborators invited to work on ${proj.name}. Project creator: ${proj.creatorName}.`
    )

  const listContainer =
    make(
      'div',
      'admin-table-wrapper'
    )

  listContainer.style.margin =
    '16px 0 20px'

  const table =
    make(
      'table',
      'admin-table'
    )

  table.innerHTML = `
    <thead>
      <tr>
        <th>Collaborator</th>
        <th>Role</th>
        <th>Tasks</th>
        ${isCreator ? '<th>Action</th>' : ''}
      </tr>
    </thead>
    <tbody id="proj-collab-tbody"></tbody>
  `

  listContainer.append(table)

  const tbody =
    table.querySelector(
      '#proj-collab-tbody'
    )

  const invited =
    proj.invitedMembers ||
    members

  invited.forEach(member => {
    const tr =
      document.createElement('tr')

    const isThisCreator =
      member.email ===
        proj.creatorEmail ||
      member.name ===
        proj.creatorName

    // ========================================================
    // MEMBER
    // ========================================================

    const tdMem =
      document.createElement('td')

    const wrap =
      make(
        'div',
        'member-cell'
      )

    wrap.append(
      make(
        'div',
        `avatar ${member.tone || 'coral'}-bg`,
        member.initials
      ),
      make(
        'strong',
        '',
        member.name
      )
    )

    tdMem.append(wrap)

    // ========================================================
    // ROLE
    // ========================================================

    const tdRole =
      document.createElement('td')

    tdRole.textContent =
      isThisCreator
        ? `${member.role} (Creator)`
        : member.role

    // ========================================================
    // TASK COUNT
    // ========================================================

    const tdTasks =
      document.createElement('td')

    const taskCount =
      tasks.filter(
        task => {
          if (task.project !== proj.name) return false
          return proj.creatorFirebaseUid === member.firebaseUid ||
            (proj.sprints || []).some(sprint =>
              getSprintMemberUids(sprint).includes(member.firebaseUid)
            )
        }
      ).length

    tdTasks.textContent =
      `${taskCount} active`

    tr.append(
      tdMem,
      tdRole,
      tdTasks
    )

    // ========================================================
    // ACTION
    // ========================================================

    if (isCreator) {
      const tdAct =
        document.createElement('td')

      if (!isThisCreator) {
        const removeBtn =
          make(
            'button',
            'action-btn delete',
            'Remove'
          )

        removeBtn.type =
          'button'

        removeBtn.addEventListener(
          'click',
          () => {
            proj.invitedMembers =
              (
                proj.invitedMembers ||
                []
              ).filter(
                member =>
                  member.id !==
                    member.id &&
                  member.email !==
                    member.email
              )

            saveProjects()

            addAuditLog(
              'Collaborator removed',
              `${proj.creatorName} removed ${member.name} from ${proj.name}.`,
              'trash'
            )

            closeModal()

            openManageCollaboratorsModal()

            updateUserUI()
          }
        )

        tdAct.append(removeBtn)
      } else {
        const ownerText =
          document.createElement('small')

        ownerText.style.color =
          '#A1A1AA'

        ownerText.textContent =
          'Owner'

        tdAct.append(ownerText)
      }

      tr.append(tdAct)
    }

    tbody.append(tr)
  })

  // ==========================================================
  // ACTIONS
  // ==========================================================

  const actionsRow =
    make(
      'div',
      'modal-actions-row'
    )

  if (isCreator) {
    const inviteBtn =
      make(
        'button',
        'primary-button gold',
        '+ Invite Another Member'
      )

    inviteBtn.type =
      'button'

    inviteBtn.addEventListener(
      'click',
      () => {
        closeModal()

        openInviteCollaboratorModal()
      }
    )

    actionsRow.append(inviteBtn)
  }

  box.append(
    close,
    make(
      'p',
      'eyebrow',
      'PROJECT TEAM'
    ),
    title,
    copy,
    listContainer,
    actionsRow
  )

  backdrop.append(box)

  root.replaceChildren(backdrop)
}

export function openManageCollaboratorsModal() {
  const project = getActiveProject()
  if (!project) return

  if (!isCurrentUserProjectCreator()) {
    showPermissionNotice()
    return
  }

  const backdrop = make('div', 'modal-backdrop')
  backdrop.addEventListener('click', event => {
    if (event.target === backdrop) closeModal()
  })
  const dialog = make('section', 'modal messages-create-modal project-invitations-modal')
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  const close = make('button', 'close-modal', '×')
  close.type = 'button'
  close.setAttribute('aria-label', 'Close dialog')
  close.addEventListener('click', closeModal)

  const title = make('h2', '', `${project.name} — Invitations`)
  title.id = 'project-invitations-modal-title'
  dialog.setAttribute('aria-labelledby', title.id)
  const copy = make('p', 'modal-copy', 'Review invite status. Removing an accepted collaborator revokes their project access.')
  const header = make('header', 'messages-create-header project-invitations-header')
  header.append(make('span', 'messages-create-eyebrow', 'PROJECT TEAM'), title, copy, close)
  const notice = make('p', 'project-form-error')
  notice.setAttribute('role', 'alert')
  notice.hidden = true
  const tableWrap = make('div', 'admin-table-wrapper invitation-table-wrapper')
  const table = make('table', 'admin-table invitation-table')
  table.innerHTML = '<thead><tr><th>Collaborator</th><th>Role</th><th>Status</th><th>Invited</th><th>Action</th></tr></thead><tbody></tbody>'
  tableWrap.append(table)
  const tbody = table.querySelector('tbody')

  const refresh = async () => {
    notice.hidden = true
    tbody.replaceChildren()
    try {
      const response = await api.get(`/projects/${encodeURIComponent(project.projectId || project.id)}/invitations`)
      const invitations = response?.data?.invitations
      if (!Array.isArray(invitations)) throw new Error('The server returned an invalid invitations response.')
      if (!invitations.length) {
        const row = document.createElement('tr')
        const empty = make('td', 'notification-empty-state', 'No invitations for this project yet.')
        empty.colSpan = 5
        row.append(empty)
        tbody.append(row)
        return
      }
      invitations.forEach(invitation => {
        const row = document.createElement('tr')
        const identity = make('div', 'member-info invitation-identity')
        identity.append(
          make('strong', '', invitation.invited_name || 'Collab user'),
          make('small', '', invitation.invited_email || 'Email unavailable')
        )
        const identityCell = make('td')
        identityCell.append(identity)

        const roleCell = make('td')
        roleCell.append(make('span', 'invitation-role', invitation.role || 'Member'))

        const statusCell = make('td')
        const normalizedStatus = String(invitation.status || 'unknown').toLowerCase()
        const statusClass = normalizedStatus === 'accepted'
          ? 'active'
          : normalizedStatus === 'pending'
            ? 'pending'
            : 'invitation-status-other'
        statusCell.append(make('span', `status-badge invitation-status ${statusClass}`, normalizedStatus))

        const invitedDate = new Date(invitation.created_at)
        const invitedCell = make(
          'td',
          'invitation-date',
          Number.isNaN(invitedDate.getTime()) ? 'Date unavailable' : invitedDate.toLocaleDateString()
        )

        row.append(identityCell, roleCell, statusCell, invitedCell)

        const actions = make('td')
        if (invitation.status === 'pending' || invitation.status === 'accepted') {
          const remove = make('button', 'action-btn delete invitation-remove-button', invitation.status === 'pending' ? 'Revoke' : 'Remove')
          remove.type = 'button'
          remove.addEventListener('click', async () => {
            const confirmed = await showDashboardConfirmation({
              title: invitation.status === 'pending' ? 'Revoke invitation?' : 'Remove collaborator?',
              message: `Are you sure you want to ${invitation.status === 'pending' ? 'revoke this invitation for' : 'remove access for'} ${invitation.invited_name || invitation.invited_email}?`,
              confirmText: invitation.status === 'pending' ? 'Revoke invitation' : 'Remove access',
              danger: true
            })
            if (!confirmed) return

            const restoreRemove = setDashboardButtonLoading(remove, 'Removing…')
            try {
              await api.delete(`/projects/${encodeURIComponent(project.projectId || project.id)}/invitations/${encodeURIComponent(invitation.invitation_id)}`)
              await refresh()
              showDashboardToast(
                invitation.status === 'pending' ? 'Invitation revoked.' : 'Collaborator access removed.',
                'success'
              )
            } catch (error) {
              notice.textContent = error.message || 'The invitation or access could not be removed.'
              notice.hidden = false
              restoreRemove()
            }
          })
          actions.append(remove)
        } else {
          actions.textContent = '—'
        }
        row.append(actions)
        tbody.append(row)
      })
    } catch (error) {
      notice.textContent = error.message || 'Invitations could not be loaded.'
      notice.hidden = false
    }
  }

  const invite = make('button', 'primary-button gold', '+ Invite another member')
  invite.classList.add('messages-create-submit')
  invite.type = 'button'
  invite.addEventListener('click', () => {
    closeModal()
    openInviteCollaboratorModal(project)
  })
  dialog.append(header, notice, tableWrap, invite)
  backdrop.append(dialog)
  root.replaceChildren(backdrop)
  refresh()
}