import { members, currentUser, activeView, addAuditLog, pushNotification, make, root, closeModal } from './state.js'

export const defaultPolls = []

const storedTeamPolls = JSON.parse(localStorage.getItem('collab_team_polls') || 'null')
export let teamPolls = (storedTeamPolls || defaultPolls).filter(poll => poll.id !== 'poll-1')
if (storedTeamPolls && teamPolls.length !== storedTeamPolls.length) {
  localStorage.setItem('collab_team_polls', JSON.stringify(teamPolls))
}

export function saveTeamPolls() {
  localStorage.setItem('collab_team_polls', JSON.stringify(teamPolls))
}

export function renderTeamPolls() {
  document.querySelectorAll('.team-polls-container').forEach(container => {
    const interactive = container.dataset.interactive === 'true'
    container.replaceChildren()
    const visiblePolls = teamPolls.filter(isPollAudienceMember)
    if (visiblePolls.length === 0) {
      container.append(make('div', 'poll-empty-state', interactive ? 'No active polls. Create a team decision above.' : 'No active team polls.'))
      return
    }

    visiblePolls.forEach(poll => {
      const card = make('div', 'team-poll-card')
      card.append(make('h4', 'poll-title', poll.title))
      if (poll.description) card.append(make('p', 'poll-desc', poll.description))
      const optionsList = make('div', 'poll-options-list')
      const votes = getPollVoteCounts(poll)
      const totalVotes = Object.values(votes).reduce((sum, count) => sum + count, 0)
      poll.options.forEach(option => {
        const count = votes[option.id] || 0
        const selected = getPollUserChoice(poll) === option.id
        const row = make('div', `poll-option-row${interactive ? '' : ' readonly'}${selected ? ' selected' : ''}`)
        const progress = make('div', 'poll-option-progress')
        progress.style.width = `${totalVotes ? Math.round((count / totalVotes) * 100) : 0}%`
        const content = make('div', 'poll-option-content')
        content.append(
          make('span', 'poll-opt-radio', selected ? '●' : '○'),
          make('span', 'poll-opt-text', option.text),
          make('span', 'poll-opt-pct', `${count} vote${count === 1 ? '' : 's'}`)
        )
        row.append(progress, content)
        if (interactive) row.addEventListener('click', () => submitPollVote(poll.id, option.id))
        optionsList.append(row)
      })
      card.append(optionsList)
      container.append(card)
    })
  })
  if (activeView === 'Workspace') showPendingPollPopup()
}

export function submitPollVote(pollId, optionId) {
  const poll = teamPolls.find(item => item.id === pollId)
  if (!poll || !isPollAudienceMember(poll) || !poll.options.some(option => option.id === optionId)) return
  const voterEmail = currentUser.email
  poll.votesByMember ||= {}
  const previousChoice = poll.votesByMember[voterEmail] || (
    poll.creatorEmail === voterEmail ? poll.userChoice : null
  )
  if (previousChoice === optionId) return
  if (previousChoice) {
    const previous = poll.options.find(option => option.id === previousChoice)
    if (previous && previous.votes > 0) previous.votes--
  } else {
    poll.options.forEach(option => { option.votes ||= 0 })
  }
  const chosen = poll.options.find(option => option.id === optionId)
  chosen.votes = (chosen.votes || 0) + 1
  poll.votesByMember[voterEmail] = optionId
  poll.totalVotes = poll.options.reduce((sum, option) => sum + (option.votes || 0), 0)
  saveTeamPolls()
  renderTeamPolls()
  addAuditLog('Vote submitted', `${currentUser.name} voted on "${poll.title}".`, 'poll')
  pushNotification('Vote Recorded', `You voted for: "${chosen.text.slice(0, 32)}..."`, '🗳️', 'teal-bg')
}

function getPollAudience(poll) {
  if (Array.isArray(poll.invitedMemberEmails)) return poll.invitedMemberEmails
  return members.map(member => member.email).filter(Boolean)
}

function isPollAudienceMember(poll) {
  return Boolean(currentUser?.email && getPollAudience(poll).includes(currentUser.email))
}

function getPollUserChoice(poll) {
  return poll.votesByMember?.[currentUser.email] || (
    poll.creatorEmail === currentUser.email ? poll.userChoice : null
  )
}

function getPollVoteCounts(poll) {
  return Object.fromEntries(poll.options.map(option => [option.id, Math.max(0, Number(option.votes) || 0)]))
}

function markPollPopupViewed(poll) {
  poll.viewedBy ||= []
  if (!poll.viewedBy.includes(currentUser.email)) {
    poll.viewedBy.push(currentUser.email)
    saveTeamPolls()
  }
}

function showPendingPollPopup() {
  if (document.querySelector('.poll-popup-backdrop')) return
  const poll = teamPolls.find(item =>
    isPollAudienceMember(item) &&
    (item.creatorEmail ? item.creatorEmail !== currentUser.email : item.creator !== currentUser.name) &&
    !(item.viewedBy || []).includes(currentUser.email)
  )
  if (poll) openPollPopup(poll)
}

function openPollPopup(poll) {
  const backdrop = make('div', 'poll-popup-backdrop')
  const dialog = make('section', 'poll-popup')
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  dialog.setAttribute('aria-labelledby', 'poll-popup-title')
  const close = make('button', 'close-modal', '×')
  close.type = 'button'
  close.setAttribute('aria-label', 'Close poll')
  const dismiss = () => {
    markPollPopupViewed(poll)
    closeModal()
    if (activeView === 'Workspace') showPendingPollPopup()
  }
  close.addEventListener('click', dismiss)
  backdrop.addEventListener('click', event => {
    if (event.target === backdrop) dismiss()
  })

  dialog.append(close, make('span', 'poll-popup-eyebrow', 'Team poll'))
  const title = make('h2', 'poll-title', poll.title)
  title.id = 'poll-popup-title'
  dialog.append(title)
  if (poll.description) dialog.append(make('p', 'poll-desc', poll.description))

  const optionsList = make('div', 'poll-options-list')
  const votes = getPollVoteCounts(poll)
  const totalVotes = Object.values(votes).reduce((sum, count) => sum + count, 0)
  let selectedOption = getPollUserChoice(poll) || ''
  const rows = new Map()
  poll.options.forEach(option => {
    const count = votes[option.id] || 0
    const row = make('button', `poll-option-row poll-popup-option${selectedOption === option.id ? ' selected' : ''}`)
    row.type = 'button'
    row.setAttribute('aria-pressed', String(selectedOption === option.id))
    const progress = make('span', 'poll-option-progress')
    progress.style.width = `${totalVotes ? Math.round((count / totalVotes) * 100) : 0}%`
    const content = make('span', 'poll-option-content')
    content.append(
      make('span', 'poll-opt-radio', selectedOption === option.id ? '●' : '○'),
      make('span', 'poll-opt-text', option.text),
      make('span', 'poll-opt-pct', `${count} · ${totalVotes ? Math.round((count / totalVotes) * 100) : 0}%`)
    )
    row.append(progress, content)
    rows.set(option.id, row)
    row.addEventListener('click', () => {
      selectedOption = option.id
      rows.forEach((optionRow, id) => {
        const isSelected = id === selectedOption
        optionRow.classList.toggle('selected', isSelected)
        optionRow.setAttribute('aria-pressed', String(isSelected))
        optionRow.querySelector('.poll-opt-radio').textContent = isSelected ? '●' : '○'
      })
      voteButton.disabled = false
    })
    optionsList.append(row)
  })
  dialog.append(optionsList)

  const voteButton = make('button', 'primary-button full gold poll-popup-vote', getPollUserChoice(poll) ? 'Change vote' : 'Vote')
  voteButton.type = 'button'
  voteButton.disabled = !selectedOption
  voteButton.addEventListener('click', () => {
    if (!selectedOption) return
    submitPollVote(poll.id, selectedOption)
    dismiss()
  })
  dialog.append(voteButton)
  backdrop.append(dialog)
  root.replaceChildren(backdrop)
}

export function openCreatePollModal() {
  const backdrop = make('div', 'modal-backdrop')
  const form = make('form', 'modal')
  const close = make('button', 'close-modal', '×')
  close.type = 'button'
  close.addEventListener('click', closeModal)
  const title = make('h2', '', 'Create Team Decision Poll')
  const copy = make('p', 'modal-copy', 'Launch an async RFC vote for the workspace to align on architecture or delivery targets.')
  const titleLabel = make('label', '', 'Poll Question / RFC Title')
  const titleInput = make('input')
  titleInput.placeholder = 'e.g. Next Major Feature to Prioritize'
  titleInput.required = true
  titleLabel.append(titleInput)
  const descLabel = make('label', '', 'Description & Context')
  const descInput = make('textarea')
  descInput.placeholder = 'Explain the trade-offs or decision criteria...'
  descInput.rows = 2
  descLabel.append(descInput)
  const opt1Label = make('label', '', 'Option 1')
  const opt1 = make('input')
  opt1.placeholder = 'Choice A'
  opt1.required = true
  opt1Label.append(opt1)
  const opt2Label = make('label', '', 'Option 2')
  const opt2 = make('input')
  opt2.placeholder = 'Choice B'
  opt2.required = true
  opt2Label.append(opt2)
  const opt3Label = make('label', '', 'Option 3 (Optional)')
  const opt3 = make('input')
  opt3.placeholder = 'Choice C'
  opt3Label.append(opt3)
  const submit = make('button', 'primary-button full gold', 'Launch Decision Poll')
  submit.type = 'submit'
  form.append(close, title, copy, titleLabel, descLabel, opt1Label, opt2Label, opt3Label, submit)
  backdrop.append(form)
  root.replaceChildren(backdrop)
  form.addEventListener('submit', e => {
    e.preventDefault()
    const options = [{ id: `opt_${Date.now()}_1`, text: opt1.value.trim(), votes: 1 }, { id: `opt_${Date.now()}_2`, text: opt2.value.trim(), votes: 0 }]
    if (opt3.value.trim()) options.push({ id: `opt_${Date.now()}_3`, text: opt3.value.trim(), votes: 0 })
    const invitedMemberEmails = [...new Set([...members.map(member => member.email), currentUser.email].filter(Boolean))]
    const poll = {
      id: `poll_${Date.now()}`,
      title: titleInput.value.trim(),
      description: descInput.value.trim() || 'Team alignment poll.',
      creator: currentUser.name,
      creatorEmail: currentUser.email,
      invitedMemberEmails,
      viewedBy: [],
      votesByMember: {},
      totalVotes: 0,
      options: options.map(option => ({ ...option, votes: 0 }))
    }
    teamPolls.unshift(poll)
    saveTeamPolls()
    closeModal()
    renderTeamPolls()
    addAuditLog('Poll created', `${currentUser.name} created decision poll: "${poll.title}".`, 'poll')
    pushNotification('New Poll Launched', `Vote now on "${poll.title}"`, '📊', 'teal-bg')
  })
}

export function initPollEvents() {
  document.querySelector('#hub-create-poll-btn')?.addEventListener('click', openCreatePollModal)
  window.addEventListener('storage', event => {
    if (event.key !== 'collab_team_polls' || event.newValue === null) return
    let updatedPolls
    try {
      updatedPolls = JSON.parse(event.newValue)
    } catch (error) {
      console.error('Unable to read updated team polls from storage.', error)
      return
    }
    if (!Array.isArray(updatedPolls)) {
      console.error('Updated team polls storage must contain an array.')
      return
    }
    teamPolls = updatedPolls.filter(poll => poll.id !== 'poll-1')
    renderTeamPolls()
  })
}
