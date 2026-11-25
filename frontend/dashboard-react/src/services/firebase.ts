import { initializeApp } from 'firebase/app';
import {
  browserPopupRedirectResolver,
  browserSessionPersistence,
  initializeAuth
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyAjQOsgPTgrc3VyNxx58UppAbm7JvP1Vuo',
  authDomain: 'collab-5a8c2.firebaseapp.com',
  projectId: 'collab-5a8c2',
  storageBucket: 'collab-5a8c2.firebasestorage.app',
  messagingSenderId: '936144338981',
  appId: '1:936144338981:web:906ae3373266e523667fcc'
};

export const firebaseApp = initializeApp(firebaseConfig);
export const firebaseAuth = initializeAuth(firebaseApp, {
  persistence: browserSessionPersistence,
  popupRedirectResolver: browserPopupRedirectResolver
});
export const firestoreDb = getFirestore(firebaseApp);

const configuredApiBaseUrl = window.COLLAB_API_BASE_URL?.trim();

export const apiBaseUrl = (
  import.meta.env.DEV
    ? ''
    : configuredApiBaseUrl || 'https://collab-backup-backend.onrender.com'
).replace(/\/+$/, '');

export async function markCurrentUserOffline(): Promise<void> {
  const user = firebaseAuth.currentUser;
  if (!user) return;
  const response = await fetch(`${apiBaseUrl}/api/messages/presence`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ isOnline: false })
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message || 'Presence could not be updated.');
  }
}
