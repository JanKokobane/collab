import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'
import { firebaseAuth } from '@collab/firebase'

export function subscribeToAuth(callback, onError) {
  return onAuthStateChanged(firebaseAuth, callback, onError)
}

export async function signOutCurrentUser() {
  await signOut(firebaseAuth)
}

