import { projects, pushNotification, make, root, closeModal, activeView } from './state.js'
import { api } from './api.js'
import { firebaseAuth } from '../../firebase.js'
import { getSvg } from './icons.js'
import { showDashboardConfirmation, showDashboardToast } from './modalChrome.js'
import { getActiveProject } from './auth.js'
import { openCreateProjectModal } from './projects.js'

export let teamResources = []
let resourcesLoading = false
let resourcesLoadFailed = false
let scratchpadProjectId = ''
let scratchpadLastSavedContent = ''
let scratchpadDirty = false
let scratchpadSaving = false
let scratchpadSaveTimer = null
let scratchpadPollTimer = null
let scratchpadLoadVersion = 0

function normalizeResource(resource, project) {
  return {
    id: resource.resource_id || resource.id,
    projectId: resource.project_id || project?.projectId || project?.id,
    projectName: resource.project_name || project?.name || '',
    title: resource.title,
    url: resource.target_url || resource.url,
    category: resource.category
  }
}

function getOwnedProjects() {
  const uid = firebaseAuth.currentUser?.uid
  return uid ? projects.filter(project => project.creatorFirebaseUid === uid) : []
}

export async function loadProjectResources() {
  resourcesLoading = true
  resourcesLoadFailed = false
  teamResources = []
  renderHubResources()
  try {
    const results = await Promise.all(projects.map(async project => {
      const response = await api.get(`/projects/${encodeURIComponent(project.projectId)}/resources`)
      return (response?.data?.resources || []).map(resource => normalizeResource(resource, project))
    }))
    teamResources = results.flat()
  } catch (error) {
    resourcesLoadFailed = true
    throw error
  } finally {
    resourcesLoading = false
    renderHubResources()
  }
}

export function renderScratchpad() {
  const textarea = document.querySelector('#workspace-scratchpad-area')
  const projectSelect = document.querySelector('#scratchpad-project-select')
  if (!textarea || !projectSelect) return

  const selectedProjectId = projectSelect.value || scratchpadProjectId ||
    localStorage.getItem('collab_workspace_scratchpad_project') ||
    getActiveProject()?.projectId ||
    projects[0]?.projectId ||
    ''
  projectSelect.replaceChildren()
  projects.filter(project => project.projectId && project.name).forEach(project => {
    const option = make('option', '', project.name)
    option.value = project.projectId
    projectSelect.append(option)
  })
  projectSelect.disabled = !projectSelect.options.length
  projectSelect.value = projects.some(project => project.projectId === selectedProjectId)
    ? selectedProjectId
    : projects[0]?.projectId || ''
  scratchpadProjectId = projectSelect.value
  textarea.disabled = !scratchpadProjectId
  if (!scratchpadProjectId) {
    textarea.value = ''
    textarea.placeholder = 'Create or join a project to start shared notes.'
    document.querySelectorAll('.scratchpad-toolbar .scratchpad-btn').forEach(button => {
      button.disabled = true
    })
    updateScratchpadStatus('● Choose a project')
  } else {
    textarea.placeholder = 'Start typing team notes, sprint targets, or architectural decisions...'
    document.querySelectorAll('.scratchpad-toolbar .scratchpad-btn').forEach(button => {
      button.disabled = false
    })
  }
}

function updateScratchpadStatus(message, color = '') {
  const saveStatus = document.querySelector('#scratchpad-save-status')
  if (!saveStatus) return
  saveStatus.textContent = message
  if (color) saveStatus.style.color = color
}

async function saveScratchpad(projectId = scratchpadProjectId) {
  const textarea = document.querySelector('#workspace-scratchpad-area')
  if (!textarea || !projectId || !scratchpadDirty) return true
  if (scratchpadSaving) return false

  clearTimeout(scratchpadSaveTimer)
  const content = textarea.value
  scratchpadSaving = true
  updateScratchpadStatus('● Saving...', '#F5B800')
  try {
    const response = await api.put(
      `/projects/${encodeURIComponent(projectId)}/scratchpad`,
      { content }
    )
    const savedContent = response?.data?.scratchpad?.content
    if (typeof savedContent !== 'string') {
      throw new Error('The server returned an invalid scratchpad response.')
    }
    if (projectId === scratchpadProjectId) {
      scratchpadLastSavedContent = savedContent
      scratchpadDirty = textarea.value !== savedContent
      if (scratchpadDirty) {
        scheduleScratchpadSave()
      } else {
        updateScratchpadStatus('● Synced', '#10B981')
      }
    }
    return true
  } catch (error) {
    if (projectId === scratchpadProjectId) {
      updateScratchpadStatus('● Save failed', '#DC2626')
      showDashboardToast(error.message || 'The project scratchpad could not be saved.', 'error')
    }
    return false
  } finally {
    scratchpadSaving = false
  }
}

function scheduleScratchpadSave() {
  clearTimeout(scratchpadSaveTimer)
  scratchpadSaveTimer = setTimeout(() => {
    saveScratchpad()
  }, 600)
}

export async function loadProjectScratchpad(projectId = document.querySelector('#scratchpad-project-select')?.value) {
  const textarea = document.querySelector('#workspace-scratchpad-area')
  if (!textarea || !projectId) return
  if (projectId === scratchpadProjectId && scratchpadDirty && !await saveScratchpad(projectId)) {
    throw new Error('Unsaved project scratchpad changes could not be saved.')
  }

  const loadVersion = ++scratchpadLoadVersion
  scratchpadProjectId = projectId
  scratchpadDirty = false
  textarea.disabled = true
  updateScratchpadStatus('● Loading...', '#F5B800')
  try {
    const response = await api.get(`/projects/${encodeURIComponent(projectId)}/scratchpad`)
    if (loadVersion !== scratchpadLoadVersion ||
        document.querySelector('#scratchpad-project-select')?.value !== projectId) return
    const content = response?.data?.scratchpad?.content
    if (typeof content !== 'string') {
      throw new Error('The server returned an invalid scratchpad response.')
    }
    const legacyContent = localStorage.getItem('collab_workspace_scratchpad')
    const legacyScratchpadMigrated = localStorage.getItem('collab_workspace_scratchpad_migrated')
    if (!content && legacyContent && legacyScratchpadMigrated !== 'true') {
      textarea.value = legacyContent
      scratchpadLastSavedContent = ''
      scratchpadDirty = true
      if (!await saveScratchpad(projectId)) {
        throw new Error('Your existing scratchpad notes could not be moved into this project.')
      }
      localStorage.setItem('collab_workspace_scratchpad_migrated', 'true')
      localStorage.removeItem('collab_workspace_scratchpad')
      textarea.disabled = false
      localStorage.setItem('collab_workspace_scratchpad_project', projectId)
      return
    }
    textarea.value = content
    textarea.disabled = false
    scratchpadLastSavedContent = content
    scratchpadDirty = false
    localStorage.setItem('collab_workspace_scratchpad_project', projectId)
    updateScratchpadStatus('● Synced', '#10B981')
  } catch (error) {
    if (loadVersion === scratchpadLoadVersion) {
      textarea.disabled = false
      updateScratchpadStatus('● Load failed', '#DC2626')
      throw error
    }
  }
}

async function refreshScratchpadFromServer() {
  const textarea = document.querySelector('#workspace-scratchpad-area')
  const projectId = scratchpadProjectId
  if (
    !textarea || !projectId || activeView !== 'Workspace' ||
    document.hidden || document.activeElement === textarea ||
    scratchpadDirty || scratchpadSaving
  ) return

  try {
    const response = await api.get(`/projects/${encodeURIComponent(projectId)}/scratchpad`)
    const content = response?.data?.scratchpad?.content
    if (typeof content !== 'string') {
      throw new Error('The server returned an invalid scratchpad response.')
    }
    if (
      projectId === scratchpadProjectId &&
      document.querySelector('#scratchpad-project-select')?.value === projectId &&
      document.activeElement !== textarea &&
      !scratchpadDirty &&
      content !== scratchpadLastSavedContent
    ) {
      textarea.value = content
      scratchpadLastSavedContent = content
      updateScratchpadStatus('● Synced', '#10B981')
    }
  } catch (error) {
    console.error('Unable to refresh the project scratchpad:', error)
  }
}

export function renderHubResources() {
  const brandLogos = [
    { domains: ['figma.com'], hint: 'figma', logo: 'https://cdn.simpleicons.org/figma/F24E1E' },
    { domains: ['github.com'], hint: 'github', logo: 'https://cdn.simpleicons.org/github/181717' },
    { domains: ['notion.so', 'notion.site'], hint: 'notion', logo: 'https://cdn.simpleicons.org/notion/000000' },
    { domains: ['meet.google.com'], hint: 'googlemeet', logo: 'https://cdn.simpleicons.org/googlemeet/00897B' }
  ]
  const workspaceLogo = new URL('../images/favicon.png', window.location.href).href

  const addButton = document.querySelector('#hub-add-resource-btn')
  if (addButton) addButton.hidden = false

  document.querySelectorAll('.hub-resources-grid').forEach(container => {
    container.replaceChildren()
    if (!teamResources.length) {
      const message = resourcesLoading
        ? 'Loading project resources…'
        : resourcesLoadFailed
          ? 'Project resources could not be loaded. Please try again.'
          : 'No resources have been pinned to your projects yet.'
      const empty = make('p', 'hub-resources-empty', message)
      container.append(empty)
      return
    }
    teamResources.forEach(resource => {
      const item = make('div', 'hub-resource-item')
      const link = make('a', 'hub-resource-link')
      link.href = resource.url
      link.target = '_blank'
      link.rel = 'noopener noreferrer'

      let hostname = ''
      try {
        hostname = new URL(resource.url).hostname.replace(/^www\./, '')
      } catch {
        hostname = ''
      }
      const resourceIdentity = `${hostname} ${resource.url} ${resource.title}`.toLowerCase()
      const brand = brandLogos.find(candidate =>
        candidate.domains.some(domain => hostname === domain || hostname.endsWith(`.${domain}`)) ||
        resourceIdentity.includes(candidate.hint)
      )
      const isLocalHost = !hostname ||
        hostname === 'localhost' ||
        hostname.endsWith('.localhost') ||
        hostname === '127.0.0.1' ||
        hostname === '::1'
      const logo = make('img', 'hub-res-logo')
      logo.src = brand?.logo || (
        isLocalHost
          ? workspaceLogo
          : `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`
      )
      logo.alt = `${resource.title} logo`
      logo.loading = 'lazy'
      logo.decoding = 'async'
      logo.addEventListener('error', () => {
        if (logo.dataset.fallback) return
        logo.dataset.fallback = 'true'
        logo.src = workspaceLogo
      })

      const content = make('div', 'hub-res-content')
      const titleRow = make('div', 'hub-res-title-row')
      titleRow.append(make('strong', '', resource.title), make('span', 'hub-res-tag', resource.category))
      const domain = make('small', '', `${resource.projectName ? `${resource.projectName} · ` : ''}${hostname || resource.url}`)
      content.append(titleRow, domain)
      link.append(logo, content, make('span', 'hub-res-arrow', '↗'))
      item.append(link)

      if (
        container.id === 'admin-hub-resources-list' &&
        getOwnedProjects().some(project => project.projectId === resource.projectId)
      ) {
        const actions = make('div', 'hub-resource-actions')
        const editButton = make('button', 'hub-resource-action', 'Edit')
        editButton.type = 'button'
        editButton.setAttribute('aria-label', `Edit ${resource.title}`)
        editButton.addEventListener('click', () => openAddResourceModal(resource))

        const removeButton = make('button', 'hub-resource-action is-danger', 'Remove')
        removeButton.type = 'button'
        removeButton.setAttribute('aria-label', `Remove ${resource.title}`)
        removeButton.addEventListener('click', () => removeProjectResource(resource))
        actions.append(editButton, removeButton)
        item.append(actions)
      }
      container.append(item)
    })
  })
}

async function removeProjectResource(resource) {
  const confirmed = await showDashboardConfirmation({
    title: 'Remove project resource?',
    message: `Remove "${resource.title}" from ${resource.projectName}? Project members will be notified.`,
    confirmText: 'Remove resource',
    danger: true
  })
  if (!confirmed) return

  try {
    await api.delete(`/projects/${encodeURIComponent(resource.projectId)}/resources/${encodeURIComponent(resource.id)}`)
    teamResources = teamResources.filter(item => item.id !== resource.id)
    renderHubResources()
    showDashboardToast('Resource removed. Project members have been notified.', 'success')
  } catch (error) {
    console.error('Unable to remove project resource:', error)
    showDashboardToast(error.message || 'The project resource could not be removed.', 'error')
  }
}

export function openAddResourceModal(resourceToEdit = null) {
  const ownedProjects = getOwnedProjects()
  if (!resourceToEdit && ownedProjects.length === 0) {
    showDashboardToast('Create a project first, then you can pin resources to it.', 'error')
    openCreateProjectModal()
    return
  }

  const editableProject = resourceToEdit
    ? ownedProjects.find(project => project.projectId === resourceToEdit.projectId)
    : null
  if (resourceToEdit && !editableProject) {
    showDashboardToast('Only the creator of this project can edit this resource.', 'error')
    return
  }

  const backdrop = make('div', 'modal-backdrop')
  const form = make('form', 'modal')
  const close = make('button', 'close-modal', '×')
  close.type = 'button'
  close.addEventListener('click', closeModal)
  const editing = Boolean(resourceToEdit)
  const title = make('h2', '', editing ? 'Edit Pinned Resource' : 'Add Pinned Resource')
  const copy = make('p', 'modal-copy', editing
    ? 'Update this project resource. Project members will be notified.'
    : 'Pin a resource to one of your projects. Only that project’s members can view it.')
  const addField = (labelText, iconName, control) => {
    const label = make('label', 'resource-form-label', labelText)
    const field = make('div', 'input-with-icon')
    const icon = make('span', 'input-icon-svg')
    icon.innerHTML = getSvg(iconName, '', 16, 16)
    field.append(icon, control)
    label.append(field)
    return label
  }

  const projectSelect = document.createElement('select')
  ownedProjects.forEach(project => {
    const option = make('option', '', project.name)
    option.value = project.projectId
    projectSelect.append(option)
  })
  if (editing) {
    projectSelect.value = editableProject.projectId
    projectSelect.disabled = true
  } else {
    const activeProjectId = getActiveProject()?.projectId
    const initialProjectId = ownedProjects.find(project => project.projectId === activeProjectId)?.projectId
    if (initialProjectId) projectSelect.value = initialProjectId
  }

  const titleInput = make('input')
  titleInput.maxLength = 255
  titleInput.placeholder = 'e.g. Design Tokens Figma'
  titleInput.required = true
  titleInput.value = resourceToEdit?.title || ''
  const urlInput = make('input')
  urlInput.type = 'url'
  urlInput.maxLength = 2048
  urlInput.placeholder = 'https://figma.com/@your-project'
  urlInput.required = true
  urlInput.value = resourceToEdit?.url || ''
  const catSelect = document.createElement('select')
  ;[
    'Design',
    'Engineering',
    'Product',
    'Testing',
    'Meetings',
    'Analytics',
    'Documentation',
    'Research',
    'Marketing',
    'Sales',
    'Customer Support',
    'Operations',
    'Finance',
    'Legal',
    'Human Resources',
    'Recruiting',
    'Strategy',
    'Planning',
    'Roadmaps',
    'Requirements',
    'Specifications',
    'Architecture',
    'APIs & Integrations',
    'Code Repositories',
    'DevOps',
    'Cybersecurity',
    'Data Science',
    'Databases',
    'Infrastructure',
    'Deployment',
    'Monitoring',
    'Incident Response',
    'Quality Assurance',
    'Bug Tracking',
    'User Experience',
    'Prototyping',
    'Branding',
    'Content',
    'SEO',
    'Social Media',
    'Campaigns',
    'Competitor Analysis',
    'Training',
    'Onboarding',
    'Policies',
    'Contracts',
    'Vendor Management',
    'Reports',
    'Presentations',
    'Other'
  ].forEach(category => {
    const option = make('option', '', category)
    option.value = category
    catSelect.append(option)
  })
  if (resourceToEdit) catSelect.value = resourceToEdit.category

  const projectLabel = addField('Project', 'folder', projectSelect)
  const titleLabel = addField('Resource title', 'title', titleInput)
  const urlLabel = addField('Target URL', 'link', urlInput)
  const catLabel = addField('Category', 'grid', catSelect)
  const submit = make('button', 'primary-button full gold', editing ? 'Save Changes' : 'Pin Resource')
  submit.type = 'submit'
  form.append(close, title, copy, projectLabel, titleLabel, urlLabel, catLabel, submit)
  backdrop.append(form)
  root.replaceChildren(backdrop)
  form.addEventListener('submit', async e => {
    e.preventDefault()
    submit.disabled = true
    submit.textContent = editing ? 'Saving…' : 'Pinning…'
    try {
      const project = ownedProjects.find(item => item.projectId === projectSelect.value)
      const requestBody = {
        title: titleInput.value.trim(),
        targetUrl: urlInput.value.trim(),
        category: catSelect.value
      }
      const resourcePath = `/projects/${encodeURIComponent(projectSelect.value)}/resources`
      const response = editing
        ? await api.put(`${resourcePath}/${encodeURIComponent(resourceToEdit.id)}`, requestBody)
        : await api.post(resourcePath, requestBody)
      const savedResource = normalizeResource(response?.data?.resource, project)
      teamResources = editing
        ? teamResources.map(item => item.id === resourceToEdit.id ? savedResource : item)
        : [savedResource, ...teamResources]
      closeModal()
      renderHubResources()
      showDashboardToast(
        editing ? 'Resource updated. Project members have been notified.' : 'Resource pinned to the project.',
        'success'
      )
      if (!editing) {
        pushNotification('Resource Pinned', `"${titleInput.value.trim()}" is now available to ${project.name} members.`, '🔗', 'teal-bg')
      }
    } catch (error) {
      console.error(`Unable to ${editing ? 'update' : 'pin'} project resource:`, error)
      submit.disabled = false
      submit.textContent = editing ? 'Save Changes' : 'Pin Resource'
      showDashboardToast(error.message || 'The project resource could not be pinned.', 'error')
    }
  })
}

export function initWorkspaceResourceEvents() {
  const scratchpad = document.querySelector('#workspace-scratchpad-area')
  const projectSelect = document.querySelector('#scratchpad-project-select')
  scratchpad?.addEventListener('input', () => {
    scratchpadDirty = scratchpad.value !== scratchpadLastSavedContent
    if (scratchpadDirty) {
      updateScratchpadStatus('● Unsaved changes', '#F5B800')
      scheduleScratchpadSave()
    } else {
      clearTimeout(scratchpadSaveTimer)
      updateScratchpadStatus('● Synced', '#10B981')
    }
  })
  projectSelect?.addEventListener('change', async () => {
    const previousProjectId = scratchpadProjectId
    if (scratchpadDirty && !await saveScratchpad(previousProjectId)) {
      projectSelect.value = previousProjectId
      return
    }
    try {
      await loadProjectScratchpad(projectSelect.value)
    } catch (error) {
      console.error('Unable to load the selected project scratchpad:', error)
      showDashboardToast(error.message || 'The selected project scratchpad could not be loaded.', 'error')
    }
  })
  document.querySelector('#scratchpad-add-check')?.addEventListener('click', () => {
    if (!scratchpad || !scratchpadProjectId) return
    scratchpad.value = `${scratchpad.value.trimEnd()}\n- [ ] New sprint target: `
    scratchpad.focus()
    scratchpad.dispatchEvent(new Event('input', { bubbles: true }))
  })
  document.querySelector('#scratchpad-add-bullet')?.addEventListener('click', () => {
    if (!scratchpad || !scratchpadProjectId) return
    scratchpad.value = `${scratchpad.value.trimEnd()}\n- Note: `
    scratchpad.focus()
    scratchpad.dispatchEvent(new Event('input', { bubbles: true }))
  })
  document.querySelector('#scratchpad-add-code')?.addEventListener('click', () => {
    if (!scratchpad || !scratchpadProjectId) return
    scratchpad.value = `${scratchpad.value.trimEnd()}\n\`\`\`js\n// Architecture snippet\nconst config = {}\n\`\`\`\n`
    scratchpad.focus()
    scratchpad.dispatchEvent(new Event('input', { bubbles: true }))
  })
  document.querySelector('#scratchpad-clear-btn')?.addEventListener('click', async () => {
    if (!scratchpad || !scratchpadProjectId) return
    scratchpad.value = ''
    scratchpad.dispatchEvent(new Event('input', { bubbles: true }))
    if (await saveScratchpad()) {
      pushNotification('Scratchpad Cleared', 'Project notes were cleared.', '📝', 'coral-bg')
    }
  })
  if (!scratchpadPollTimer) {
    scratchpadPollTimer = window.setInterval(refreshScratchpadFromServer, 5000)
  }
  document.querySelector('#hub-add-resource-btn')?.addEventListener('click', () => openAddResourceModal())
}
