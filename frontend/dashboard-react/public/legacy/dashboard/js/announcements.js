import { currentUser, addAuditLog, pushNotification, make } from './state.js'

export const defaultAnnouncements = [
  {
    id: 'ann-1',
    authorName: 'Alex Morgan',
    authorInitials: 'AM',
    tone: 'coral',
    role: 'Workspace Admin',
    time: '2 hours ago',
    title: 'Q4 Sprint Kickoff & Spec Finalization',
    content: 'All feature specs and Figma wireframes for the Q4 cycle are officially signed off. Please review your sprint commitments before Wednesday\'s team sync!',
    reactions: { '🚀': 4, '🎉': 5, '👀': 3 }
  },
  {
    id: 'ann-2',
    authorName: 'Elena Rostova',
    authorInitials: 'ER',
    tone: 'purple',
    role: 'Lead Engineer',
    time: 'Yesterday at 4:30 PM',
    title: 'Staging Environment Updated (v2.4.0-rc2)',
    content: 'Release candidate build v2.4.0-rc2 has been deployed to staging.collab.io. Database migrations and responsive typography updates are live for smoke testing.',
    reactions: { '❤️': 3, '💡': 4, '🚀': 2 }
  }
]

export let announcements = JSON.parse(localStorage.getItem('collab_announcements') || 'null') || defaultAnnouncements

export function saveAnnouncements() {
  localStorage.setItem('collab_announcements', JSON.stringify(announcements))
}

export function renderAnnouncements() {
  document.querySelectorAll('.announcements-feed').forEach(container => {
    const interactive = container.dataset.interactive === 'true'
    container.replaceChildren()
    if (announcements.length === 0) {
      container.append(make('div', 'announcement-empty-state', interactive ? 'No announcements yet. Create the first update above.' : 'No announcements yet.'))
      return
    }

    announcements.forEach(ann => {
      const card = make('div', 'announcement-item')
      const reactions = Object.entries(ann.reactions || {}).map(([emoji, count]) => {
        const tag = interactive ? 'button' : 'span'
        const type = interactive ? ' type="button"' : ''
        return `<${tag}${type} class="reaction-pill" data-ann-id="${ann.id}" data-emoji="${emoji}"><span>${emoji}</span> <span class="reaction-count">${count}</span></${tag}>`
      }).join('')
      const addReaction = interactive ? `<button type="button" class="add-reaction-btn" data-ann-id="${ann.id}">+ Reaction</button>` : ''
      card.innerHTML = `
        <div class="announcement-header">
          <div class="announcement-author">
            <div class="avatar announcement-avatar ${ann.tone || 'coral'}-bg">${ann.authorInitials || 'AM'}</div>
            <div class="announcement-author-copy">
              <strong>${ann.authorName}</strong>
              <span class="announcement-author-role">${ann.role || 'Collaborator'}</span>
            </div>
          </div>
          <div class="announcement-header-meta">
            <time class="announcement-time">${ann.time}</time>
            <span class="announcement-pin-tag">Pinned Broadcast</span>
          </div>
        </div>
        <div class="announcement-content">
          <h4 class="announcement-title">${ann.title}</h4>
          <p class="announcement-body">${ann.content}</p>
        </div>
        <div class="announcement-reaction-footer">
          <span class="announcement-reaction-label">Reactions</span>
          <div class="announcement-reactions">${reactions}${addReaction}</div>
        </div>`
      if (interactive) {
        card.querySelectorAll('.reaction-pill').forEach(btn => btn.addEventListener('click', () => {
          const emoji = btn.dataset.emoji
          ann.reactions[emoji] = (ann.reactions[emoji] || 0) + 1
          saveAnnouncements()
          renderAnnouncements()
        }))
        card.querySelector('.add-reaction-btn')?.addEventListener('click', () => {
          const picker = ['🚀', '❤️', '👀', '🎉', '💡', '👏']
          const chosen = picker[Math.floor(Math.random() * picker.length)]
          ann.reactions[chosen] = (ann.reactions[chosen] || 0) + 1
          saveAnnouncements()
          renderAnnouncements()
          pushNotification('Reaction Added', `Reacted with ${chosen} to "${ann.title}"`, '🎉', 'teal-bg')
        })
      }
      container.append(card)
    })
  })
}

export function initAnnouncementEvents() {
  document.querySelector('#hub-toggle-announcement-btn')?.addEventListener('click', () => {
    const composer = document.querySelector('#announcement-composer-form')
    if (!composer) return
    const isHidden = composer.style.display === 'none'
    composer.style.display = isHidden ? 'flex' : 'none'
    if (isHidden) document.querySelector('#announcement-input')?.focus()
  })
  document.querySelector('#announcement-composer-form')?.addEventListener('submit', e => {
    e.preventDefault()
    const textarea = document.querySelector('#announcement-input')
    const text = textarea?.value.trim()
    if (!text) return
    const lines = text.split('\n').filter(Boolean)
    const title = lines[0].length > 60 ? `${lines[0].slice(0, 57)}...` : lines[0]
    const content = lines.length > 1 ? lines.slice(1).join('\n') : text
    const post = { id: `ann_${Date.now()}`, authorName: currentUser.name, authorInitials: currentUser.initials, tone: currentUser.tone || 'coral', role: currentUser.role, time: 'Just now', title, content, reactions: { '🚀': 1, '❤️': 1 } }
    announcements.unshift(post)
    saveAnnouncements()
    textarea.value = ''
    renderAnnouncements()
    addAuditLog('Announcement posted', `${currentUser.name} posted: "${title}".`, 'broadcast')
    pushNotification('New Announcement', `"${title}" broadcasted to workspace`, currentUser.initials, `${currentUser.tone}-bg`)
  })
}
