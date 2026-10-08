import { currentUser, pushNotification, make, root, closeModal } from './state.js'

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

export const defaultResources = [
  { id: 'res-1', title: 'Figma Design System', url: 'https://figma.com/@collab-workspace', category: 'Design' },
  { id: 'res-2', title: 'GitHub CI/CD Pipelines', url: 'https://github.com/collab/workspace', category: 'Engineering' },
  { id: 'res-3', title: 'Product Requirements Doc (PRD)', url: 'https://notion.so/collab/q4-specs', category: 'Product' },
  { id: 'res-4', title: 'Staging Preview Server', url: 'https://staging.collab.io', category: 'Testing' },
  { id: 'res-5', title: 'Team Standup Meet Room', url: 'https://meet.google.com/collab-sync', category: 'Meetings' }
]

export let teamResources = JSON.parse(localStorage.getItem('collab_team_resources') || 'null') || defaultResources

export function saveTeamResources() {
  localStorage.setItem('collab_team_resources', JSON.stringify(teamResources))
}

export function renderScratchpad() {
  const textarea = document.querySelector('#workspace-scratchpad-area')
  if (!textarea || textarea.dataset.loaded) return
  const saved = localStorage.getItem('collab_workspace_scratchpad')
  textarea.value = saved !== null ? saved : defaultScratchpad
  textarea.dataset.loaded = 'true'
}

export function renderHubResources() {
  const brandLogos = {
    'figma.com': 'https://cdn.simpleicons.org/figma/F24E1E',
    'github.com': 'https://cdn.simpleicons.org/github/181717',
    'notion.so': 'https://cdn.simpleicons.org/notion/000000',
    'meet.google.com': 'https://cdn.simpleicons.org/googlemeet/00897B'
  }
  const workspaceLogo = new URL('../images/favicon.png', window.location.href).href

  document.querySelectorAll('.hub-resources-grid').forEach(container => {
    container.replaceChildren()
    teamResources.forEach(resource => {
      const item = make('a', 'hub-resource-item')
      item.href = resource.url
      item.target = '_blank'
      item.rel = 'noopener noreferrer'

      let hostname = ''
      try {
        hostname = new URL(resource.url).hostname.replace(/^www\./, '')
      } catch {
        hostname = ''
      }
      const brandDomain = Object.keys(brandLogos).find(domain => hostname === domain || hostname.endsWith(`.${domain}`))
      const logo = make('img', 'hub-res-logo')
      logo.src = brandLogos[brandDomain] || workspaceLogo
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
      const domain = make('small', '', hostname || resource.url)
      content.append(titleRow, domain)
      item.append(logo, content, make('span', 'hub-res-arrow', '↗'))
      container.append(item)
    })
  })
}

export function openAddResourceModal() {
  const backdrop = make('div', 'modal-backdrop')
  const form = make('form', 'modal')
  const close = make('button', 'close-modal', '×')
  close.type = 'button'
  close.addEventListener('click', closeModal)
  const title = make('h2', '', 'Add Pinned Resource')
  const copy = make('p', 'modal-copy', 'Pin a shared Figma file, documentation link, repository, or tool to the workspace.')
  const titleLabel = make('label', '', 'Resource Title')
  const titleInput = make('input')
  titleInput.placeholder = 'e.g. Design Tokens Figma'
  titleInput.required = true
  titleLabel.append(titleInput)
  const urlLabel = make('label', '', 'Target URL')
  const urlInput = make('input')
  urlInput.type = 'url'
  urlInput.placeholder = 'https://figma.com/@collab'
  urlInput.required = true
  urlLabel.append(urlInput)
  const catLabel = make('label', '', 'Category')
  const catSelect = document.createElement('select')
  ;['Design', 'Engineering', 'Product', 'Testing', 'Meetings', 'Analytics'].forEach(category => {
    const option = make('option', '', category)
    option.value = category
    catSelect.append(option)
  })
  catLabel.append(catSelect)
  const submit = make('button', 'primary-button full gold', 'Pin Resource')
  submit.type = 'submit'
  form.append(close, title, copy, titleLabel, urlLabel, catLabel, submit)
  backdrop.append(form)
  root.replaceChildren(backdrop)
  form.addEventListener('submit', e => {
    e.preventDefault()
    const resource = { id: `res_${Date.now()}`, title: titleInput.value.trim(), url: urlInput.value.trim(), category: catSelect.value }
    teamResources.push(resource)
    saveTeamResources()
    closeModal()
    renderHubResources()
    addAuditLog('Resource pinned', `Added bookmark "${resource.title}".`, 'bookmark')
    pushNotification('Resource Pinned', `"${resource.title}" is now available in Workspace Hub.`, '🔗', 'teal-bg')
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
