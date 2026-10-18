import { projects, activeView, getAccessibleMembers, getAccessibleTasks, meetings, notifications, currentUser, loadNotificationsFromAPI, loadProjectsFromAPI, markNotificationRead, markAllNotificationsRead, clearAllNotifications, make, getUserInitials, renderAvatarElement, root, closeModal, hub } from './state.js'
import { renderStickyNotes, renderPersistentBrainstorm, initBrainstormEvents, openBrainstormBoardFromNotification } from './brainstorm.js'
import { renderScratchpad, renderHubResources, initWorkspaceResourceEvents } from './workspaceResources.js'
import { api } from './api.js'
import { getSafeMeetingUrl } from './meetings.js'
import { showDashboardToast } from './modalChrome.js'

// RENDER WORKSPACE HUB
export function renderWorkspaceHub() {
  renderWorkspaceSummary()
  renderUpcomingMeetings()
  renderWorkspaceManagement()
  renderStickyNotes()
  renderScratchpad()
}

export function renderWorkspaceManagement() {
  renderHubResources()
}

export function renderBrainstorm() {
  renderPersistentBrainstorm()
}

export function renderWorkspaceSummary() {
  const accessibleMembers = getAccessibleMembers()
  const firstName = currentUser?.name?.trim().split(/\s+/)[0] || 'there'
  const userName = document.querySelector('#hub-user-name')
  const openTaskCount = document.querySelector('#hub-open-task-count')
  const meetingCount = document.querySelector('#hub-meeting-count')
  const memberCount = document.querySelector('#hub-member-count')
  const unreadCount = document.querySelector('#hub-unread-count')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)
  const accessibleTasks = getAccessibleTasks()
  const dueThisWeek = accessibleTasks.filter(task => {
    if (!task.date) return false
    const dueDate = new Date(`${task.date}T00:00:00`)
    return !Number.isNaN(dueDate.getTime()) && dueDate >= weekStart && dueDate <= weekEnd
  })
  const upcomingCount = meetings.filter(meeting => {
    const date = new Date(`${meeting.date}T00:00:00`)
    return !Number.isNaN(date.getTime()) && date >= today
  }).length

  if (userName) userName.textContent = firstName
  const completedCount = accessibleTasks.filter(task => task.status === 'Done').length
  const completedTaskCount = document.querySelector('#hub-completed-task-count')
  const totalTaskCount = document.querySelector('#hub-task-total-count')
  const dueWeekCount = document.querySelector('#hub-due-week-count')
  const dueWeekPending = document.querySelector('#hub-due-week-pending')
  const statsCompletedCount = document.querySelector('#stats-completed-task-count')
  const statsTotalCount = document.querySelector('#stats-task-total-count')
  const statsDueWeekCount = document.querySelector('#stats-due-week-count')
  const statsDueWeekPending = document.querySelector('#stats-due-week-pending')
  const statsTeamMemberCount = document.querySelector('#stats-team-member-count')
  const statsTeamMemberAvatars = document.querySelector('#stats-team-member-avatars')
  const hubTeamMemberAvatars = document.querySelector('#hub-team-member-avatars')
  const activeProject = projects.find(project => project.name === activeView)
  const projectTasks = activeProject
    ? accessibleTasks.filter(task =>
      task.projectId
        ? task.projectId === activeProject.projectId
        : task.project === activeProject.name
    )
    : accessibleTasks
  const statsTasks = activeProject ? projectTasks : accessibleTasks
  const statsDueThisWeek = statsTasks.filter(task => {
    if (!task.date) return false
    const dueDate = new Date(`${task.date}T00:00:00`)
    return !Number.isNaN(dueDate.getTime()) && dueDate >= weekStart && dueDate <= weekEnd
  })
  const projectMembers = activeProject
    ? [
      ...(activeProject.creatorEmail || activeProject.creatorFirebaseUid
        ? [{
          firebaseUid: activeProject.creatorFirebaseUid,
          email: activeProject.creatorEmail,
          name: activeProject.creatorName,
          initials: activeProject.creatorInitials,
          tone: activeProject.creatorTone,
          profileImage: activeProject.creatorProfileImage ||
            (activeProject.creatorFirebaseUid === currentUser.uid
              ? currentUser.profileImage || currentUser.photoURL || ''
              : '')
        }]
        : []),
      ...(activeProject.acceptedMembers || [])
    ]
    : accessibleMembers
  const statsMembers = activeProject
    ? [...new Map(projectMembers
      .filter(member => member.email || member.firebaseUid)
      .map(member => [
        member.firebaseUid || member.email.trim().toLowerCase(),
        member
      ])).values()]
    : accessibleMembers
  if (completedTaskCount) completedTaskCount.textContent = completedCount
  if (totalTaskCount) totalTaskCount.textContent = accessibleTasks.length
  if (dueWeekCount) dueWeekCount.textContent = dueThisWeek.length
  if (dueWeekPending) dueWeekPending.textContent = dueThisWeek.filter(task => task.status !== 'Done').length
  if (statsCompletedCount) {
    statsCompletedCount.textContent = statsTasks.filter(task => task.status === 'Done').length
  }
  if (statsTotalCount) statsTotalCount.textContent = statsTasks.length
  if (statsDueWeekCount) statsDueWeekCount.textContent = statsDueThisWeek.length
  if (statsDueWeekPending) {
    statsDueWeekPending.textContent = statsDueThisWeek.filter(task => task.status !== 'Done').length
  }
  if (statsTeamMemberCount) statsTeamMemberCount.textContent = statsMembers.length

  if (statsTeamMemberAvatars) {
    statsTeamMemberAvatars.replaceChildren()
    statsMembers.slice(0, 3).forEach(member => {
      const avatar = make('span')
      renderAvatarElement(avatar, member)
      statsTeamMemberAvatars.append(avatar)
    })
    if (statsMembers.length > 3) {
      statsTeamMemberAvatars.append(make('span', 'avatar more-avatar', `+${statsMembers.length - 3}`))
    }
  }
  if (hubTeamMemberAvatars) {
    hubTeamMemberAvatars.replaceChildren()
    accessibleMembers.slice(0, 3).forEach(member => {
      const avatar = make('span')
      renderAvatarElement(avatar, member)
      hubTeamMemberAvatars.append(avatar)
    })
    if (accessibleMembers.length > 3) {
      hubTeamMemberAvatars.append(make('span', 'avatar more-avatar', `+${accessibleMembers.length - 3}`))
    }
  }
  if (openTaskCount) openTaskCount.textContent = accessibleTasks.filter(task => task.status !== 'Done').length
  if (meetingCount) meetingCount.textContent = upcomingCount
  if (memberCount) memberCount.textContent = accessibleMembers.length
  if (unreadCount) unreadCount.textContent = notifications.filter(notification => notification.unread).length
}

export function renderUpcomingMeetings() {
  const tbody = document.querySelector('#workspace-upcoming-meetings')
  if (!tbody) return
  tbody.replaceChildren()

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const upcoming = meetings
    .filter(meeting => {
      const date = new Date(`${meeting.date}T00:00:00`)
      return !Number.isNaN(date.getTime()) && date >= today
    })
    .sort((first, second) => first.date.localeCompare(second.date) || first.time.localeCompare(second.time))

  if (upcoming.length === 0) {
    const row = document.createElement('tr')
    const cell = make('td', 'meeting-empty-state', 'No upcoming meetings scheduled.')
    cell.colSpan = 7
    row.append(cell)
    tbody.append(row)
    return
  }

  upcoming.forEach(meeting => {
    const row = document.createElement('tr')
    const date = new Date(`${meeting.date}T00:00:00`)
    const formattedDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
    row.className = 'upcoming-meeting-row'
    row.tabIndex = 0
    row.setAttribute('role', 'button')
    row.setAttribute('aria-label', `Open ${meeting.title} on ${formattedDate}`)
    const attendeeCell = make('td')
    const attendeeWrap = make('div', 'meeting-attendees')
    ;(meeting.attendees || []).forEach(person => {
      const avatar = make('span', `avatar ${person.tone || 'teal'}-bg meeting-attendee`)
      renderAvatarElement(avatar, person, 'meeting-attendee')
      avatar.title = person.name
      attendeeWrap.append(avatar)
    })
    attendeeCell.append(attendeeWrap)
    const hostName = meeting.host || 'Not assigned'
    const hostMember = getAccessibleMembers().find(person =>
      person.firebaseUid === meeting.hostFirebaseUid
    )
    const hostCell = make('td')
    const hostWrap = make('div', 'meeting-host')
    if (hostMember || hostName !== 'Not assigned') {
      const hostAvatar = make('span', `avatar ${hostMember?.tone || 'coral'}-bg meeting-host-avatar`)
      renderAvatarElement(hostAvatar, hostMember || {
        name: hostName,
        initials: getUserInitials(hostName),
        profileImage: meeting.hostProfileImage
      }, 'meeting-host-avatar')
      hostAvatar.setAttribute('aria-hidden', 'true')
      hostWrap.append(hostAvatar)
    }
    hostWrap.append(make('span', 'meeting-host-name', hostName))
    hostCell.append(hostWrap)
    const locationCell = make('td', 'meeting-location')
    const meetingUrl = getSafeMeetingUrl(meeting.location)
    if (meetingUrl) {
      const link = make('a', '', meeting.location)
      link.href = meetingUrl
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      link.addEventListener('click', event => event.stopPropagation())
      locationCell.append(link)
    } else {
      locationCell.textContent = meeting.location || 'Location not set'
    }
    const meetingCell = make('td', 'meeting-title-cell', meeting.title)
    const dateCell = make('td', '', formattedDate)
    const timeCell = make('td', '', meeting.time || 'Time not set')
    const projectCell = make('td', 'meeting-project-name', meeting.projectName || 'Project')
    const labeledCells = [
      [meetingCell, 'Meeting'],
      [dateCell, 'Date'],
      [timeCell, 'Time'],
      [hostCell, 'Host'],
      [attendeeCell, 'Attendees'],
      [projectCell, 'Project'],
      [locationCell, 'Location']
    ]
    labeledCells.forEach(([cell, label]) => cell.dataset.label = label)
    row.append(
      meetingCell,
      dateCell,
      timeCell,
      hostCell,
      attendeeCell,
      projectCell,
      locationCell
    )
    const openSchedule = () => hub.openDayScheduleModal?.(meeting.date)
    row.addEventListener('click', openSchedule)
    row.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        openSchedule()
      }
    })
    tbody.append(row)
  })
}

export function renderNotifications() {
  const tbody = document.querySelector('#settings-notifications-tbody')
  if (!tbody) return
  tbody.replaceChildren()
  const markAllButton = document.querySelector('#mark-all-notifications-read')
  const clearAllButton = document.querySelector('#clear-all-notifications')
  if (markAllButton) markAllButton.disabled = !notifications.some(notification => notification.unread)
  if (clearAllButton) clearAllButton.disabled = notifications.length === 0

  if (notifications.length === 0) {
    const row = document.createElement('tr')
    const cell = make('td', 'notification-empty-state', 'You are all caught up.')
    cell.colSpan = 5
    row.append(cell)
    tbody.append(row)
    return
  }

  notifications.forEach(notification => {
    const row = document.createElement('tr')
    row.classList.toggle('notification-row-unread', notification.unread)
    const avatarValue = notification.avatar || '•'
    const hasProfilePhoto = Boolean(
      notification.invitationId &&
      (/^data:image\/(?:jpeg|png|webp);base64,/.test(avatarValue) ||
        /^https:\/\//.test(avatarValue))
    )
    const source = make(
      'span',
      `notif-avatar ${notification.toneClass || 'coral-bg'}`,
      hasProfilePhoto ? '' : avatarValue
    )
    source.classList.toggle('notification-person-avatar', Boolean(notification.invitationId))
    if (hasProfilePhoto) {
      const image = document.createElement('img')
      image.src = avatarValue
      image.alt = 'Inviter profile photo'
      image.loading = 'lazy'
      image.decoding = 'async'
      image.referrerPolicy = 'no-referrer'
      image.addEventListener('error', () => {
        image.remove()
        source.classList.remove('notification-person-avatar')
        const inviterName = notification.detail.match(/^(.+?) invited you to join\b/i)?.[1]
        source.textContent = inviterName
          ? inviterName.trim().split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase()
          : '•'
      }, { once: true })
      source.append(image)
    }
    const title = make('div', 'settings-notification-title')
    title.append(source, make('strong', '', notification.title))
    const titleCell = make('td')
    titleCell.append(title)
    const status = make('span', `notification-status ${notification.unread ? 'unread' : 'read'}`, notification.unread ? 'Unread' : 'Read')
    const statusCell = make('td')
    statusCell.append(status)
    const actionCell = make('td')
    const actionButtons = make('div', 'notification-action-buttons')
    const invitationIsPending =
      notification.invitationId &&
      notification.invitationStatus === 'pending' &&
      (!notification.invitationExpiresAt || new Date(notification.invitationExpiresAt) > new Date())

    if (invitationIsPending) {
      const respond = async (action, button) => {
        button.disabled = true
        const buttons = actionCell.querySelectorAll('button')
        buttons.forEach(item => { item.disabled = true })
        let result
        try {
          result = await api.post(
            action === 'accept' ? '/invitations/accept' : '/invitations/decline-in-app',
            { invitationId: notification.invitationId }
          )
          await loadNotificationsFromAPI()
          if (action === 'accept') {
            await loadProjectsFromAPI()
            hub.renderProjectNav?.()
            await hub.loadProjectMembers?.()
            const project = projects.find(item => item.id === result?.data?.projectId)
            if (project) hub.switchView?.(project.name)
          }
        } catch (error) {
          const message = make('span', 'project-form-error', error.message || 'The invitation response could not be saved.')
          message.setAttribute('role', 'alert')
          actionCell.append(message)
          buttons.forEach(item => { item.disabled = false })
        }
      }
      const acceptButton = make('button', 'action-btn primary gold', 'Accept')
      acceptButton.type = 'button'
      acceptButton.addEventListener('click', () => respond('accept', acceptButton))
      const declineButton = make('button', 'action-btn delete', 'Decline')
      declineButton.type = 'button'
      declineButton.addEventListener('click', () => respond('decline', declineButton))
      actionButtons.append(acceptButton, declineButton)
      actionCell.append(actionButtons)
    } else if (notification.invitationId && notification.invitationStatus === 'pending') {
      actionCell.append(make('span', 'notification-read-label', 'Expired'))
    } else if (
      notification.boardId &&
      ['brainstorm_board_invitation', 'brainstorm_board_updated'].includes(notification.type)
    ) {
      const openBoardButton = make('button', 'action-btn primary gold', 'Open board')
      openBoardButton.type = 'button'
      openBoardButton.addEventListener('click', async () => {
        openBoardButton.disabled = true
        openBoardButton.textContent = 'Opening…'
        try {
          await openBrainstormBoardFromNotification(notification.boardId)
          if (notification.unread) await markNotificationRead(notification.id)
          hub.switchView?.('Brainstorm')
        } catch (error) {
          console.error('Unable to open brainstorm board from notification:', error)
          openBoardButton.disabled = false
          openBoardButton.textContent = 'Open board'
          showDashboardToast(error.message || 'The brainstorm board could not be opened.', 'error')
        }
      })
      actionButtons.append(openBoardButton)
      actionCell.append(actionButtons)
    } else if (notification.unread) {
      const readButton = make('button', 'action-btn', 'Mark read')
      readButton.type = 'button'
      readButton.addEventListener('click', () => {
        markNotificationRead(notification.id).catch(error => {
          console.error('Unable to mark notification as read:', error)
        })
      })
      actionButtons.append(readButton)
      actionCell.append(actionButtons)
    } else {
      actionCell.append(make('span', 'notification-read-label', 'Done'))
    }
    row.append(
      make('td', '', notification.time || 'Just now'),
      titleCell,
      make('td', 'notification-detail-cell', notification.detail),
      statusCell,
      actionCell
    )
    tbody.append(row)
  })
}

function openNotificationConfirmation({ title, message, confirmLabel, onConfirm, isDestructive = false }) {
  const backdrop = make('div', 'modal-backdrop')
  const dialog = make('section', 'modal notification-confirmation-modal')
  dialog.setAttribute('role', 'alertdialog')
  dialog.setAttribute('aria-modal', 'true')
  dialog.setAttribute('aria-labelledby', 'notification-confirmation-title')
  dialog.dataset.chromeReady = 'true'
  const close = make('button', 'close-modal', '×')
  close.type = 'button'
  close.setAttribute('aria-label', 'Cancel')
  close.addEventListener('click', closeModal)
  const header = make('header', 'notification-confirmation-header')
  const iconWrap = make('div', `notification-confirmation-icon${isDestructive ? ' destructive' : ''}`)
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  icon.setAttribute('viewBox', '0 0 24 24')
  icon.setAttribute('fill', 'none')
  icon.setAttribute('stroke', 'currentColor')
  icon.setAttribute('stroke-width', '1.8')
  icon.setAttribute('stroke-linecap', 'round')
  icon.setAttribute('stroke-linejoin', 'round')
  icon.setAttribute('aria-hidden', 'true')
  const iconPath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  iconPath.setAttribute('d', isDestructive
    ? 'M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6'
    : 'M20 7 10 17l-5-5')
  icon.append(iconPath)
  iconWrap.append(icon)
  const eyebrow = make('span', 'notification-confirmation-eyebrow', 'Notification management')
  const heading = make('h2', '', title)
  heading.id = 'notification-confirmation-title'
  const copy = make('p', 'modal-copy', message)
  const actions = make('div', 'notification-confirmation-actions')
  const cancel = make('button', 'outline-button', 'Cancel')
  cancel.type = 'button'
  cancel.classList.add('notification-confirmation-cancel')
  cancel.addEventListener('click', closeModal)
  const confirm = make('button', `primary-button${isDestructive ? ' notification-confirmation-danger' : ' gold'}`, confirmLabel)
  confirm.type = 'button'
  confirm.classList.add('notification-confirmation-submit')
  confirm.addEventListener('click', () => {
    closeModal()
    onConfirm()
  })
  actions.append(cancel, confirm)
  header.append(close, iconWrap, eyebrow, heading)
  const body = make('div', 'notification-confirmation-body')
  body.append(copy, actions)
  dialog.append(header, body)
  backdrop.append(dialog)
  backdrop.addEventListener('click', event => {
    if (event.target === backdrop) closeModal()
  })
  root.replaceChildren(backdrop)
  cancel.focus()
}

export function initWorkspaceHubEvents() {
  document.querySelector('#mark-all-notifications-read')?.addEventListener('click', () => {
    if (!notifications.some(notification => notification.unread)) return
    openNotificationConfirmation({
      title: 'Mark all notifications as read?',
      message: 'All unread notifications will be marked as read.',
      confirmLabel: 'Mark all read',
      onConfirm: () => markAllNotificationsRead().catch(error => {
        console.error('Unable to mark all notifications as read:', error)
      })
    })
  })
  document.querySelector('#clear-all-notifications')?.addEventListener('click', () => {
    if (!notifications.length) return
    openNotificationConfirmation({
      title: 'Clear all notifications?',
      message: 'This cannot be undone. All notifications will be permanently removed.',
      confirmLabel: 'Clear all',
      onConfirm: () => clearAllNotifications().catch(error => {
        console.error('Unable to clear notifications:', error)
      }),
      isDestructive: true
    })
  })
  initBrainstormEvents()
  initWorkspaceResourceEvents()
}
