// ============================================================
// ELEMENTS
// ============================================================

const tabSignin = document.querySelector('#tab-signin')
const tabRegister = document.querySelector('#tab-register')

const formSignin = document.querySelector('#form-signin')
const formRegister = document.querySelector('#form-register')

const heading = document.querySelector('#auth-heading')
const subheading = document.querySelector('#auth-subheading')

const signinUserInput = document.querySelector('#signin-user')
const signinPasswordInput = document.querySelector('#signin-password')

const regNameInput = document.querySelector('#reg-name')
const regEmailInput = document.querySelector('#reg-email')
const regWorkspaceInput = document.querySelector('#reg-workspace')
const regRoleInput = document.querySelector('#reg-role')


// ============================================================
// TAB SWITCHING
// ============================================================

function switchTab(tab, updateUrl = true) {
  const isRegister = tab === 'register'

  // ----------------------------------------------------------
  // Update tab buttons
  // ----------------------------------------------------------

  if (tabSignin) {
    tabSignin.classList.toggle('active', !isRegister)
    tabSignin.setAttribute('aria-selected', String(!isRegister))
  }

  if (tabRegister) {
    tabRegister.classList.toggle('active', isRegister)
    tabRegister.setAttribute('aria-selected', String(isRegister))
  }

  // ----------------------------------------------------------
  // Update forms
  // ----------------------------------------------------------

  if (formSignin) {
    formSignin.classList.toggle('active', !isRegister)
  }

  if (formRegister) {
    formRegister.classList.toggle('active', isRegister)
  }

  // ----------------------------------------------------------
  // Update heading
  // ----------------------------------------------------------

  if (heading) {
    heading.textContent = isRegister
      ? 'Register your workspace'
      : 'Sign in to Collab'
  }

  // ----------------------------------------------------------
  // Update subheading
  // ----------------------------------------------------------

  if (subheading) {
    subheading.textContent = isRegister
      ? 'Create your account to start collaborating with your team.'
      : 'Sign in to access your Collab workspace dashboard.'
  }

  // ----------------------------------------------------------
  // Update URL
  // ----------------------------------------------------------

  if (updateUrl) {
    const url = new URL(window.location.href)

    url.searchParams.set(
      'mode',
      isRegister ? 'register' : 'signin'
    )

    window.history.replaceState(
      {},
      '',
      url.toString()
    )
  }

  // ----------------------------------------------------------
  // Focus correct field
  // ----------------------------------------------------------

  requestAnimationFrame(() => {
    if (isRegister) {
      regNameInput?.focus()
    } else {
      signinUserInput?.focus()
    }
  })
}


// ============================================================
// TAB BUTTON EVENTS
// ============================================================

tabSignin?.addEventListener('click', event => {
  event.preventDefault()
  switchTab('signin')
})

tabRegister?.addEventListener('click', event => {
  event.preventDefault()
  switchTab('register')
})


// ============================================================
// URL PARAMETERS
//
// Examples:
//
// auth.html
// auth.html?mode=signin
// auth.html?mode=register
// auth.html?tab=signin
// auth.html?tab=register
// auth.html?action=signin
// auth.html?action=register
// auth.html#signin
// auth.html#register
// ============================================================

const urlParams = new URLSearchParams(
  window.location.search
)

const modeParam = (
  urlParams.get('mode') ||
  urlParams.get('tab') ||
  urlParams.get('action') ||
  ''
).toLowerCase()

const hashParam = window.location.hash
  .replace('#', '')
  .toLowerCase()

const emailParam = urlParams.get('email')


// ============================================================
// PREFILL EMAIL
// ============================================================

if (emailParam) {
  const decodedEmail = decodeURIComponent(emailParam)

  if (signinUserInput) {
    signinUserInput.value = decodedEmail
  }

  if (regEmailInput) {
    regEmailInput.value = decodedEmail
  }
}


// ============================================================
// INITIAL TAB
// ============================================================

// Explicit registration request
if (
  modeParam === 'register' ||
  modeParam === 'signup' ||
  hashParam === 'register' ||
  hashParam === 'signup'
) {
  switchTab('register', false)
}

// Explicit sign-in request
else if (
  modeParam === 'signin' ||
  modeParam === 'login' ||
  hashParam === 'signin' ||
  hashParam === 'login'
) {
  switchTab('signin', false)
}

// No mode specified = Sign In
else {
  switchTab('signin', false)
}


// ============================================================
// PARSE SIGN-IN USER
// ============================================================

function parseUser(input) {
  const trimmed = (input || '').trim()

  // Never create a default user
  if (!trimmed) {
    return null
  }

  // ----------------------------------------------------------
  // Email login
  // ----------------------------------------------------------

  if (trimmed.includes('@')) {
    const rawName = trimmed
      .split('@')[0]
      .replace(/[._+-]+/g, ' ')

    const name = rawName
      .split(' ')
      .filter(Boolean)
      .map(
        word =>
          word.charAt(0).toUpperCase() +
          word.slice(1).toLowerCase()
      )
      .join(' ')

    if (!name) {
      return null
    }

    const words = name
      .split(' ')
      .filter(Boolean)

    const initials =
      words.length > 1
        ? (
            words[0][0] +
            words[1][0]
          ).toUpperCase()
        : words[0]
            .slice(0, 2)
            .toUpperCase()

    return {
      name,
      email: trimmed.toLowerCase(),
      initials,
      tone: 'coral',
      role: 'Active Member'
    }
  }

  // ----------------------------------------------------------
  // Name login
  // ----------------------------------------------------------

  const words = trimmed
    .split(' ')
    .filter(Boolean)

  if (!words.length) {
    return null
  }

  const name = words
    .map(
      word =>
        word.charAt(0).toUpperCase() +
        word.slice(1).toLowerCase()
    )
    .join(' ')

  const initials =
    words.length > 1
      ? (
          words[0][0] +
          words[1][0]
        ).toUpperCase()
      : words[0]
          .slice(0, 2)
          .toUpperCase()

  const cleanEmail =
    name
      .toLowerCase()
      .replace(/\s+/g, '.') +
    '@collab.io'

  return {
    name,
    email: cleanEmail,
    initials,
    tone: 'coral',
    role: 'Active Member'
  }
}


// ============================================================
// SAVE USER + REDIRECT
// ============================================================

function loginAndRedirect(user) {
  // Do not allow empty/default users
  if (!user) {
    return
  }

  localStorage.setItem(
    'collab-user',
    JSON.stringify(user)
  )

  localStorage.setItem(
    'collab-logged-in',
    'true'
  )

  window.location.href = './dashboard.html'
}


// ============================================================
// PASSWORD VISIBILITY TOGGLE
// ============================================================

const togglePasswordBtn =
  document.querySelector('#toggle-password-btn')

if (
  togglePasswordBtn &&
  signinPasswordInput
) {
  togglePasswordBtn.addEventListener(
    'click',
    () => {
      const isPassword =
        signinPasswordInput.getAttribute('type') ===
        'password'

      signinPasswordInput.setAttribute(
        'type',
        isPassword ? 'text' : 'password'
      )

      togglePasswordBtn.setAttribute(
        'aria-label',
        isPassword
          ? 'Hide password'
          : 'Show password'
      )

      togglePasswordBtn.setAttribute(
        'title',
        isPassword
          ? 'Hide password'
          : 'Show password'
      )

      const eyeOpen =
        togglePasswordBtn.querySelector(
          '.eye-open-icon'
        )

      const eyeClosed =
        togglePasswordBtn.querySelector(
          '.eye-closed-icon'
        )

      if (eyeOpen && eyeClosed) {
        eyeOpen.style.display =
          isPassword
            ? 'none'
            : 'block'

        eyeClosed.style.display =
          isPassword
            ? 'block'
            : 'none'
      }

      signinPasswordInput.focus()
    }
  )
}


// ============================================================
// SIGN IN FORM SUBMISSION
// ============================================================

formSignin?.addEventListener(
  'submit',
  event => {
    event.preventDefault()

    const userInput =
      signinUserInput?.value.trim() || ''

    const password =
      signinPasswordInput?.value || ''

    // --------------------------------------------------------
    // Validate username/email
    // --------------------------------------------------------

    if (!userInput) {
      alert(
        'Please enter your name or email address.'
      )

      signinUserInput?.focus()

      return
    }

    // --------------------------------------------------------
    // Validate password
    // --------------------------------------------------------

    if (!password) {
      alert(
        'Please enter your password.'
      )

      signinPasswordInput?.focus()

      return
    }

    // --------------------------------------------------------
    // Create user session
    // --------------------------------------------------------

    const user = parseUser(userInput)

    if (!user) {
      alert(
        'Unable to create your user session.'
      )

      return
    }

    loginAndRedirect(user)
  }
)


// ============================================================
// REGISTRATION FORM SUBMISSION
// ============================================================

formRegister?.addEventListener(
  'submit',
  event => {
    event.preventDefault()

    const name =
      regNameInput?.value.trim() || ''

    const email =
      regEmailInput?.value.trim() || ''

    const workspace =
      regWorkspaceInput?.value.trim() ||
      ''

    const role =
      regRoleInput?.value ||
      ''


    // --------------------------------------------------------
    // Validate name
    // --------------------------------------------------------

    if (!name) {
      alert(
        'Please enter your full name.'
      )

      regNameInput?.focus()

      return
    }


    // --------------------------------------------------------
    // Validate email
    // --------------------------------------------------------

    if (!email) {
      alert(
        'Please enter your email address.'
      )

      regEmailInput?.focus()

      return
    }


    // --------------------------------------------------------
    // Validate workspace
    // --------------------------------------------------------

    if (!workspace) {
      alert(
        'Please enter your workspace or team name.'
      )

      regWorkspaceInput?.focus()

      return
    }


    // --------------------------------------------------------
    // Generate initials
    // --------------------------------------------------------

    const words = name
      .split(' ')
      .filter(Boolean)

    const initials =
      words.length > 1
        ? (
            words[0][0] +
            words[1][0]
          ).toUpperCase()
        : words[0]
            .slice(0, 2)
            .toUpperCase()


    // --------------------------------------------------------
    // Create new user
    // --------------------------------------------------------

    const newUser = {
      name,
      email: email.toLowerCase(),
      initials,
      role: role || 'Workspace Member',
      workspace,
      tone: 'coral'
    }


    // --------------------------------------------------------
    // Save user and enter dashboard
    // --------------------------------------------------------

    loginAndRedirect(newUser)
  }
)


// ============================================================
// DYNAMIC COPYRIGHT YEAR
// ============================================================

document
  .querySelectorAll('.current-year')
  .forEach(element => {
    element.textContent =
      new Date().getFullYear()
  })