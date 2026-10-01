import './auth.css'

const defaultUser = { name: 'Alex Morgan', email: 'alex@collab.io', initials: 'AM', tone: 'coral', role: 'Product Lead' }

// Tab switching
const tabSignin = document.querySelector('#tab-signin')
const tabRegister = document.querySelector('#tab-register')
const formSignin = document.querySelector('#form-signin')
const formRegister = document.querySelector('#form-register')
const heading = document.querySelector('#auth-heading')
const subheading = document.querySelector('#auth-subheading')

function switchTab(tab) {
  if (tab === 'register') {
    tabRegister.classList.add('active')
    tabSignin.classList.remove('active')
    formRegister.classList.add('active')
    formSignin.classList.remove('active')
    heading.textContent = 'Register your workspace'
    subheading.textContent = 'Create your account to start collaborating with your team.'
    document.querySelector('#reg-name')?.focus()
  } else {
    tabSignin.classList.add('active')
    tabRegister.classList.remove('active')
    formSignin.classList.add('active')
    formRegister.classList.remove('active')
    heading.textContent = 'Sign in to Collab'
    subheading.textContent = 'Any user can sign in immediately — no password or verification required.'
    document.querySelector('#signin-user')?.focus()
  }
}

tabSignin?.addEventListener('click', () => switchTab('signin'))
tabRegister?.addEventListener('click', () => switchTab('register'))

function parseUser(input) {
  const trimmed = (input || '').trim()
  if (!trimmed) return defaultUser

  if (trimmed.includes('@')) {
    const rawName = trimmed.split('@')[0].replace(/[._+-]+/g, ' ')
    const name = rawName
      .split(' ')
      .filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ') || 'Collab User'
    const words = name.split(' ')
    const initials = words.length > 1 ? (words[0][0] + words[1][0]).toUpperCase() : words[0].slice(0, 2).toUpperCase()
    return { name, email: trimmed.toLowerCase(), initials, tone: 'coral', role: 'Active Member' }
  } else {
    const words = trimmed.split(' ').filter(Boolean)
    const name = words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') || 'Collab User'
    const initials = words.length > 1 ? (words[0][0] + words[1][0]).toUpperCase() : words[0].slice(0, 2).toUpperCase()
    const cleanEmail = name.toLowerCase().replace(/\s+/g, '.') + '@collab.io'
    return { name, email: cleanEmail, initials, tone: 'coral', role: 'Active Member' }
  }
}

function loginAndRedirect(user) {
  localStorage.setItem('collab-user', JSON.stringify(user))
  localStorage.setItem('collab-logged-in', 'true')
  window.location.href = 'dashboard.html'
}

// 1. Sign In Form Submission
formSignin?.addEventListener('submit', event => {
  event.preventDefault()
  const userInput = document.querySelector('#signin-user')
  const user = parseUser(userInput?.value)
  loginAndRedirect(user)
})

// 2. 1-Click Guest Button
document.querySelector('#guest-btn')?.addEventListener('click', () => {
  loginAndRedirect(defaultUser)
})

// 3. Quick Persona Chips
document.querySelectorAll('.persona-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const name = chip.dataset.name
    const email = chip.dataset.email
    const initials = chip.dataset.initials
    loginAndRedirect({ name, email, initials, tone: 'coral', role: 'Team Member' })
  })
})

// 4. Registration Form Submission
formRegister?.addEventListener('submit', event => {
  event.preventDefault()
  const name = document.querySelector('#reg-name')?.value || 'New User'
  const email = document.querySelector('#reg-email')?.value || 'user@collab.io'
  const role = document.querySelector('#reg-role')?.value || 'Workspace Member'
  const workspace = document.querySelector('#reg-workspace')?.value || 'Product Launch'

  const words = name.trim().split(' ').filter(Boolean)
  const initials = words.length > 1 ? (words[0][0] + words[1][0]).toUpperCase() : words[0].slice(0, 2).toUpperCase()

  const newUser = {
    name,
    email,
    initials,
    role,
    workspace,
    tone: 'coral'
  }

  loginAndRedirect(newUser)
})
