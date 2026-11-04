import { useEffect } from 'react';
import { AppState } from 'react-native';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { firebaseAuth, setUserPresence } from '@/lib/firebase';

export default function AuthLayout() {
  useEffect(() => {
    let currentUser: User | null = null;
    let appState = AppState.currentState;
    let presenceQueue = Promise.resolve();

    const reportPresence = (user: User, isOnline: boolean) => {
      presenceQueue = presenceQueue
        .then(() => setUserPresence(user, isOnline))
        .catch((error) => {
          console.error(`Unable to mark the mobile user ${isOnline ? 'online' : 'offline'}:`, error);
        });
    };

    const unsubscribeAuth = onAuthStateChanged(firebaseAuth, (user) => {
      const previousUser = currentUser;
      currentUser = user;
      if (previousUser && previousUser.uid !== user?.uid) {
        reportPresence(previousUser, false);
      }
      if (user && appState === 'active') {
        reportPresence(user, true);
      }
    });

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      const wasActive = appState === 'active';
      appState = nextState;
      if (!currentUser) return;
      if (nextState === 'active') {
        reportPresence(currentUser, true);
      } else if (wasActive) {
        reportPresence(currentUser, false);
      }
    });

    return () => {
      unsubscribeAuth();
      appStateSubscription.remove();
      if (currentUser && appState === 'active') {
        reportPresence(currentUser, false);
      }
    };
  }, []);

  return (
    <ThemeProvider value={DefaultTheme}>
      <Stack initialRouteName="index" screenOptions={{ headerShown: false }} />
    </ThemeProvider>
  );
}
