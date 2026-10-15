import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'
import {
  browserPopupRedirectResolver,
  browserSessionPersistence,
  initializeAuth
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'
import {
  doc,
  getFirestore,
  serverTimestamp,
  updateDoc
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
  const uid = firebaseAuth.currentUser?.uid
  if (!uid) return
  await updateDoc(doc(firestoreDb, 'messagePresence', uid), {
    is_online: false,
    last_seen_at: serverTimestamp()
  })
}






// TEMPORARY: Get Firebase ID token for Postman testing
window.getCollabFirebaseToken = async () => {
  const user = firebaseAuth.currentUser

  if (!user) {
    console.error('No Firebase user is currently signed in.')
    return null
  }

  const token = await user.getIdToken(true)

  console.log('Firebase ID Token:')
  console.log(token)

  return token
}