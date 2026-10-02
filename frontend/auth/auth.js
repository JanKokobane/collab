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
    tabRegister?.classList.add('active')
    tabSignin?.classList.remove('active')
    formRegister?.classList.add('active')
    formSignin?.classList.remove('active')
    if (heading) heading.textContent = 'Register your workspace'
    if (subheading) subheading.textContent = 'Create your account to start collaborating with your team.'
    document.querySelector('#reg-name')?.focus()
  } else {
    tabSignin?.classList.add('active')
    tabRegister?.classList.remove('active')
    formSignin?.classList.add('active')
    formRegister?.classList.remove('active')
    if (heading) heading.textContent = 'Sign in to Collab'
    if (subheading) subheading.textContent = 'Any user can sign in immediately — no password or verification required.'
    document.querySelector('#signin-user')?.focus()
  }
}

tabSignin?.addEventListener('click', () => switchTab('signin'))
tabRegister?.addEventListener('click', () => switchTab('register'))

// Handle URL parameters (e.g. ?mode=register from "Get Collab for free" button or pre-filled email)
const urlParams = new URLSearchParams(window.location.search)
const modeParam = (urlParams.get('mode') || urlParams.get('tab') || urlParams.get('action') || '').toLowerCase()
const hashParam = window.location.hash.toLowerCase()
const emailParam = urlParams.get('email')

if (emailParam) {
  const signinUser = document.querySelector('#signin-user')
  const regEmail = document.querySelector('#reg-email')
  if (signinUser) signinUser.value = emailParam
  if (regEmail) regEmail.value = emailParam
}

// Automatically open Sign Up / Registration tab if requested
if (modeParam === 'register' || modeParam === 'signup' || hashParam === '#register' || hashParam === '#signup' || emailParam) {
  switchTab('register')
}

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

// Password Visibility Toggle
const togglePasswordBtn = document.querySelector('#toggle-password-btn')
const passwordInput = document.querySelector('#signin-password')

if (togglePasswordBtn && passwordInput) {
  togglePasswordBtn.addEventListener('click', () => {
    const isPassword = passwordInput.getAttribute('type') === 'password'
    passwordInput.setAttribute('type', isPassword ? 'text' : 'password')
    togglePasswordBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password')
    togglePasswordBtn.setAttribute('title', isPassword ? 'Hide password' : 'Show password')

    const eyeOpen = togglePasswordBtn.querySelector('.eye-open-icon')
    const eyeClosed = togglePasswordBtn.querySelector('.eye-closed-icon')
    if (eyeOpen && eyeClosed) {
      eyeOpen.style.display = isPassword ? 'none' : 'block'
      eyeClosed.style.display = isPassword ? 'block' : 'none'
    }
    passwordInput.focus()
  })
}

// 1. Sign In Form Submission
formSignin?.addEventListener('submit', event => {
  event.preventDefault()
  const userInput = document.querySelector('#signin-user')
  const user = parseUser(userInput?.value)
  loginAndRedirect(user)
})

// 2. Registration Form Submission
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

// Dynamic copyright year update
document.querySelectorAll('.current-year').forEach(el => {
  el.textContent = new Date().getFullYear()
})
