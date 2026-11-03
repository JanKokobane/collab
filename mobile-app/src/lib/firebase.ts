import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApps, initializeApp } from 'firebase/app';
import { getReactNativePersistence, initializeAuth } from 'firebase/auth';
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

export const firebaseAuth = initializeAuth(firebaseApp, {
  persistence: getReactNativePersistence(AsyncStorage),
});

export const firestoreDb = getFirestore(firebaseApp);

export async function markCurrentUserOffline(): Promise<void> {
  const user = firebaseAuth.currentUser;
  if (!user) return;

  const baseUrl = (
    process.env.EXPO_PUBLIC_API_BASE_URL || 'https://collab-y7pb.onrender.com'
  ).replace(/\/+$/, '');
  const response = await fetch(`${baseUrl}/api/messages/presence`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ isOnline: false }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message || 'Presence could not be updated.');
  }
}
