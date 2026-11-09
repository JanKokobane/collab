import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApps, initializeApp } from 'firebase/app';
import { getAuth, getReactNativePersistence, initializeAuth } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyAjQOsgPTgrc3VyNxx58UppAbm7JvP1Vuo',
  authDomain: 'collab-5a8c2.firebaseapp.com',
  projectId: 'collab-5a8c2',
  storageBucket: 'collab-5a8c2.firebasestorage.app',
  messagingSenderId: '936144338981',
  appId: '1:936144338981:web:906ae3373266e523667fcc',
};

export const firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

function isAuthAlreadyInitialized(error: unknown): boolean {
  return error instanceof Error &&
    'code' in error &&
    error.code === 'auth/already-initialized';
}

function initializeFirebaseAuth() {
  try {
    return initializeAuth(firebaseApp, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (error) {
    if (!isAuthAlreadyInitialized(error)) throw error;
    return getAuth(firebaseApp);
  }
}

export const firebaseAuth = initializeFirebaseAuth();

export const firestoreDb = getFirestore(firebaseApp);

export async function setUserPresence(user: User, isOnline: boolean): Promise<void> {
  const baseUrl = (
    process.env.EXPO_PUBLIC_API_BASE_URL || 'https://collab-y7pb.onrender.com'
  ).replace(/\/+$/, '');
  let response = await fetch(`${baseUrl}/api/messages/presence`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ isOnline }),
  });
  if (response.status === 401) {
    response = await fetch(`${baseUrl}/api/messages/presence`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await user.getIdToken(true)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ isOnline }),
    });
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as {
      code?: string;
      message?: string;
    } | null;
    const details = payload?.code ? ` (${payload.code})` : ` (HTTP ${response.status})`;
    throw new Error(`${payload?.message || 'Presence could not be updated.'}${details}`);
  }
}

export async function markCurrentUserOffline(): Promise<void> {
  const user = firebaseAuth.currentUser;
  if (user) await setUserPresence(user, false);
}
