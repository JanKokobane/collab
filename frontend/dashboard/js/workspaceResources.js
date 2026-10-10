import { projects, pushNotification, make, root, closeModal } from './state.js'
import { api } from './api.js'
import { firebaseAuth } from '../../firebase.js'
import { getSvg } from './icons.js'
import { showDashboardConfirmation, showDashboardToast } from './modalChrome.js'
import { getActiveProject } from './auth.js'

export const defaultScratchpad = `## 🎯 Q4 Deliverables & Architecture Notes
- [x] Finalize authentication and session timeout policy
- [x] Configure high-contrast and Dark Mode palettes
- [ ] Review performance overhead on drag-and-drop task reordering
- [ ] Schedule cross-browser smoke tests across Safari, Chrome, and Firefox

### 💡 Ideas for Upcoming Sprint:
- Implement real-time cursor presence on task detail pane
- Add export to CSV/JSON for team velocity metrics
- Create keyboard shortcut guide (Cmd+K / Ctrl+K)
`

export let teamResources = []
let resourcesLoading = false
let resourcesLoadFailed = false

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
  if (!textarea || textarea.dataset.loaded) return
  const saved = localStorage.getItem('collab_workspace_scratchpad')
  textarea.value = saved !== null ? saved : defaultScratchpad
  textarea.dataset.loaded = 'true'
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
  if (addButton) addButton.hidden = getOwnedProjects().length === 0

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
  const editableProject = resourceToEdit
    ? ownedProjects.find(project => project.projectId === resourceToEdit.projectId)
    : null
  if (!ownedProjects.length || (resourceToEdit && !editableProject)) {
    showDashboardToast(
      resourceToEdit
        ? 'Only the project creator can edit this resource.'
        : 'Only project creators can pin resources. Create a project to get started.',
      'error'
    )
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
  const saveStatus = document.querySelector('#scratchpad-save-status')
  scratchpad?.addEventListener('input', () => {
    localStorage.setItem('collab_workspace_scratchpad', scratchpad.value)
    if (!saveStatus) return
    saveStatus.textContent = '● Saving...'
    saveStatus.style.color = '#F5B800'
    clearTimeout(scratchpad._saveTimer)
    scratchpad._saveTimer = setTimeout(() => {
      saveStatus.textContent = '● Synced'
      saveStatus.style.color = '#10B981'
    }, 500)
  })
  document.querySelector('#scratchpad-add-check')?.addEventListener('click', () => {
    if (!scratchpad) return
    scratchpad.value = `${scratchpad.value.trimEnd()}\n- [ ] New sprint target: `
    scratchpad.focus()
    localStorage.setItem('collab_workspace_scratchpad', scratchpad.value)
  })
  document.querySelector('#scratchpad-add-bullet')?.addEventListener('click', () => {
    if (!scratchpad) return
    scratchpad.value = `${scratchpad.value.trimEnd()}\n- Note: `
    scratchpad.focus()
    localStorage.setItem('collab_workspace_scratchpad', scratchpad.value)
  })
  document.querySelector('#scratchpad-add-code')?.addEventListener('click', () => {
    if (!scratchpad) return
    scratchpad.value = `${scratchpad.value.trimEnd()}\n\`\`\`js\n// Architecture snippet\nconst config = {}\n\`\`\`\n`
    scratchpad.focus()
    localStorage.setItem('collab_workspace_scratchpad', scratchpad.value)
  })
  document.querySelector('#scratchpad-clear-btn')?.addEventListener('click', () => {
    if (!scratchpad) return
    scratchpad.value = ''
    localStorage.setItem('collab_workspace_scratchpad', '')
    if (saveStatus) saveStatus.textContent = '● Cleared'
    pushNotification('Scratchpad Cleared', 'Workspace notes were cleared.', '📝', 'coral-bg')
  })
  document.querySelector('#hub-add-resource-btn')?.addEventListener('click', openAddResourceModal)
}
