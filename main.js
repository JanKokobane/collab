import './style.css'

const seedTasks = [
  { id: 1, title: 'Create wireframes for the new dashboard', tag: 'Design', tagTone: 'purple', due: 'Today', assignee: 'AM', assigneeTone: 'teal', progress: 72, description: 'Bring the dashboard concept to life with clear, low-fidelity wireframes.', comments: 4 },
  { id: 2, title: 'Set up analytics tracking', tag: 'Development', tagTone: 'blue', due: 'Tomorrow', assignee: 'JL', assigneeTone: 'orange', progress: 35, description: 'Add the key events and conversion tracking for the product launch.', comments: 2 },
  { id: 3, title: 'Write launch announcement', tag: 'Marketing', tagTone: 'green', due: 'Oct 8', assignee: 'SK', assigneeTone: 'pink', progress: 0, description: 'Draft the announcement for the upcoming launch campaign.', comments: 0 },
  { id: 4, title: 'Review onboarding flow', tag: 'Product', tagTone: 'yellow', due: 'Oct 10', assignee: 'AM', assigneeTone: 'teal', progress: 58, description: 'Review the onboarding experience and note opportunities to reduce friction.', comments: 6 },
  { id: 5, title: 'Prepare product screenshots', tag: 'Design', tagTone: 'purple', due: 'Oct 12', assignee: 'SK', assigneeTone: 'pink', progress: 15, description: 'Capture polished screenshots for the launch page and social channels.', comments: 1 },
  { id: 6, title: 'QA final release candidate', tag: 'Development', tagTone: 'blue', due: 'Oct 14', assignee: 'JL', assigneeTone: 'orange', progress: 0, description: 'Run through the release checklist and record any blocking issues.', comments: 0 },
]

let tasks = JSON.parse(localStorage.getItem('collab-tasks') || 'null') || seedTasks
let activeView = 'Product Launch'
const root = document.querySelector('#modal-root')

const make = (tag, className, text) => {
  const element = document.createElement(tag)
  if (className) element.className = className
  if (text !== undefined) element.textContent = text
  return element
}

const saveTasks = () => localStorage.setItem('collab-tasks', JSON.stringify(tasks))

function taskCard(task, status) {
  const card = make('article', 'task-card')
  card.dataset.id = String(task.id)
  const top = make('div', 'task-top')
  top.append(make('span', `tag ${task.tagTone}`, task.tag), make('button', 'card-more', '•••'))
  const title = make('h4', '', task.title)
  const meta = make('div', 'task-meta')
  meta.append(make('span', task.due === 'Today' ? 'due today' : 'due', `□ ${task.due}`))
  if (task.comments) meta.append(make('span', '', `♧ ${task.comments}`))
  const footer = make('div', 'card-footer')
  footer.append(make('div', `avatar ${task.assigneeTone}-bg`, task.assignee))
  if (status === 'Done') footer.append(make('span', 'done-label', 'Completed'))
  else {
    const progress = make('div', 'progress')
    const bar = make('span')
    bar.style.width = `${task.progress}%`
    progress.append(bar)
    footer.append(progress)
  }
  card.append(top, title, meta, footer)
  card.addEventListener('click', () => openDrawer(task))
  return card
}

function renderTasks() {
  const lists = { 'To do': document.querySelector('#todo-list'), 'In progress': document.querySelector('#progress-list'), Done: document.querySelector('#done-list') }
  Object.values(lists).forEach(list => { list.replaceChildren() })
  tasks.forEach((task, index) => {
    const status = task.done ? 'Done' : index < 3 ? 'To do' : 'In progress'
    lists[status].append(taskCard(task, status))
  })
}

function closeModal() { root.replaceChildren() }

function openTaskModal() {
  const backdrop = make('div', 'modal-backdrop')
  const form = make('form', 'modal')
  const close = make('button', 'close-modal', '×')
  close.type = 'button'
  close.addEventListener('click', closeModal)
  const title = make('h2', '', 'Create a task')
  const copy = make('p', 'modal-copy', 'Give your team a clear next step.')
  const titleLabel = make('label', '', 'Task title')
  const titleInput = make('input')
  titleInput.name = 'title'; titleInput.required = true; titleInput.placeholder = 'e.g. Review homepage copy'
  titleLabel.append(titleInput)
  const projectLabel = make('label', '', 'Project')
  const project = document.createElement('select'); project.name = 'tag'
  ;['Design', 'Development', 'Marketing', 'Product'].forEach(value => project.append(make('option', '', value)))
  projectLabel.append(project)
  const dueLabel = make('label', '', 'Due date'); const due = make('input'); due.name = 'due'; due.placeholder = 'Oct 18'; dueLabel.append(due)
  const assigneeLabel = make('label', '', 'Assignee'); const assignee = document.createElement('select'); assignee.name = 'assignee'
  ;[['AM', 'Alex Morgan'], ['SK', 'Sam Kim'], ['JL', 'Jordan Lee']].forEach(([value, text]) => { const option = make('option', '', text); option.value = value; assignee.append(option) })
  assigneeLabel.append(assignee)
  const row = make('div', 'form-row'); row.append(dueLabel, assigneeLabel)
  const submit = make('button', 'primary-button full', 'Create task'); submit.type = 'submit'
  form.append(close, make('p', 'eyebrow', 'NEW TASK'), title, copy, titleLabel, projectLabel, row, submit)
  form.addEventListener('submit', event => {
    event.preventDefault()
    const tagTone = { Design: 'purple', Development: 'blue', Marketing: 'green', Product: 'yellow' }[project.value]
    const assigneeTone = { AM: 'teal', SK: 'pink', JL: 'orange' }[assignee.value]
    tasks.push({ id: Date.now(), title: titleInput.value, tag: project.value, tagTone, due: due.value || 'Oct 18', assignee: assignee.value, assigneeTone, progress: 0, comments: 0, description: 'A new task for the product launch team.' })
    saveTasks(); closeModal(); renderTasks()
  })
  backdrop.append(form); root.append(backdrop); titleInput.focus()
}

function openDrawer(task) {
  const backdrop = make('div', 'drawer-backdrop')
  const drawer = make('aside', 'drawer')
  const close = make('button', 'close-drawer', '×'); close.addEventListener('click', closeModal)
  const title = make('h2', '', task.title)
  const description = make('p', 'drawer-desc', task.description)
  const info = make('div', 'drawer-info')
  const person = make('div'); person.append(make('small', '', 'ASSIGNEE'), make('span', '', task.assignee === 'AM' ? 'AM  Alex Morgan' : task.assignee === 'SK' ? 'SK  Sam Kim' : 'JL  Jordan Lee'))
  const date = make('div'); date.append(make('small', '', 'DUE DATE'), make('span', '', `□ ${task.due}`))
  info.append(person, date)
  const section = make('div', 'drawer-section'); section.append(make('div', 'section-title', `Comments ${task.comments}`))
  const comment = make('div', 'comment'); comment.append(make('i', 'avatar orange-bg', 'JL'), make('p', '', 'Jordan Lee — Looks good to me. I’ll review this today.'))
  section.append(comment)
  const complete = make('button', 'complete-button', '✓  Mark as complete')
  complete.addEventListener('click', () => { task.done = true; saveTasks(); closeModal(); renderTasks() })
  drawer.append(close, make('span', `tag ${task.tagTone}`, task.tag), title, description, info, section, complete)
  backdrop.append(drawer); root.append(backdrop)
}

function openSignin() {
  const backdrop = make('div', 'modal-backdrop'); const form = make('form', 'modal auth-modal')
  const close = make('button', 'close-modal', '×'); close.type = 'button'; close.addEventListener('click', closeModal)
  const emailLabel = make('label', '', 'Email address'); const email = make('input'); email.type = 'email'; email.required = true; email.placeholder = 'you@company.com'; emailLabel.append(email)
  const passwordLabel = make('label', '', 'Password'); const password = make('input'); password.type = 'password'; password.required = true; password.placeholder = '••••••••'; passwordLabel.append(password)
  const submit = make('button', 'primary-button full', 'Sign in'); submit.type = 'submit'
  form.append(close, make('span', 'brand-mark large', 'c'), make('h2', '', 'Welcome back'), make('p', 'modal-copy', 'Sign in to continue to your workspace.'), emailLabel, passwordLabel, submit)
  form.addEventListener('submit', event => { event.preventDefault(); closeModal(); document.querySelector('#signin').textContent = 'Alex Morgan' })
  backdrop.append(form); root.append(backdrop); email.focus()
}

document.querySelectorAll('[data-view]').forEach(item => item.addEventListener('click', () => {
  activeView = item.dataset.view
  document.querySelector('#page-title').textContent = activeView
  document.querySelector('#breadcrumb-title').textContent = activeView
}))
const enterWorkspace = () => document.body.classList.add('workspace-mode')
document.querySelector('#landing-cta').addEventListener('click', enterWorkspace)
document.querySelector('#hero-cta').addEventListener('click', enterWorkspace)
document.querySelector('#landing-signin').addEventListener('click', openSignin)
document.querySelector('#workflow-cta').addEventListener('click', enterWorkspace)
document.querySelector('#pricing-cta').addEventListener('click', enterWorkspace)
document.querySelector('#final-cta').addEventListener('click', enterWorkspace)
document.querySelector('#new-task').addEventListener('click', openTaskModal)
document.querySelectorAll('[data-add]').forEach(button => button.addEventListener('click', openTaskModal))
document.querySelector('#signin').addEventListener('click', openSignin)
document.querySelector('#search').addEventListener('input', event => {
  const query = event.target.value.toLowerCase()
  document.querySelectorAll('.task-card').forEach(card => { card.hidden = !card.textContent.toLowerCase().includes(query) })
})
renderTasks()
