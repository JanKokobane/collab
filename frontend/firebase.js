import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'
import {
  browserPopupRedirectResolver,
  browserSessionPersistence,
  initializeAuth
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'
import {
  getFirestore
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'

const firebaseConfig = {
  apiKey: 'AIzaSyAjQOsgPTgrc3VyNxx58UppAbm7JvP1Vuo',
  authDomain: 'collab-5a8c2.firebaseapp.com',
  projectId: 'collab-5a8c2',
  storageBucket: 'collab-5a8c2.firebasestorage.app',
  messagingSenderId: '936144338981',
  appId: '1:936144338981:web:906ae3373266e523667fcc'
}

export const firebaseApp = initializeApp(firebaseConfig)
export const firebaseAuth = initializeAuth(firebaseApp, {
  persistence: browserSessionPersistence,
  popupRedirectResolver: browserPopupRedirectResolver
})
export const firestoreDb = getFirestore(firebaseApp)

export async function markCurrentUserOffline() {
  const user = firebaseAuth.currentUser
  if (!user) return
  const baseUrl = (window.COLLAB_API_BASE_URL !== undefined ? window.COLLAB_API_BASE_URL : (typeof window !== 'undefined' && window.location ? window.location.origin : '')).replace(/\/+$/, '')
  const response = await fetch(`${baseUrl}/api/messages/presence`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ isOnline: false })
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(payload?.message || 'Presence could not be updated.')
  }
}
