import { useEffect } from 'react';
import { AppState } from 'react-native';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { firebaseAuth, setUserPresence } from '@/lib/firebase';
import { registerForPushNotificationsAsync } from '@/lib/pushNotifications';
import { MessageCallProvider } from '@/contexts/MessageCallProvider';

export default function AuthLayout() {
  useEffect(() => {
    let currentUser: User | null = null;
    let appState = AppState.currentState;
    let presenceQueue = Promise.resolve();
    let presenceRetryTimer: ReturnType<typeof setTimeout> | null = null;
    let presenceRetryAttempt = 0;

    const reportPresence = (user: User, isOnline: boolean) => {
      presenceQueue = presenceQueue
        .then(async () => {
          await setUserPresence(user, isOnline);
          presenceRetryAttempt = 0;
          if (presenceRetryTimer) clearTimeout(presenceRetryTimer);
          presenceRetryTimer = null;
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          const networkUnavailable = error instanceof TypeError ||
            /fetch failed|network request failed|unable to resolve host|unknownhostexception/i.test(message);
          if (
            networkUnavailable &&
            isOnline &&
            currentUser?.uid === user.uid &&
            appState === 'active' &&
            !presenceRetryTimer
          ) {
            const delay = Math.min(5000 * (2 ** presenceRetryAttempt), 60000);
            presenceRetryAttempt = Math.min(presenceRetryAttempt + 1, 4);
            presenceRetryTimer = setTimeout(() => {
              presenceRetryTimer = null;
              if (currentUser?.uid === user.uid && appState === 'active') {
                reportPresence(user, true);
              }
            }, delay);
            return;
          }
          if (networkUnavailable) return;
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
      if (user) {
        registerForPushNotificationsAsync(user).catch((error) => {
          console.error('Unable to register for push notifications:', error);
        });
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
      if (presenceRetryTimer) clearTimeout(presenceRetryTimer);
      if (currentUser && appState === 'active') {
        reportPresence(currentUser, false);
      }
    };
  }, []);

  return (
    <ThemeProvider value={DefaultTheme}>
      <MessageCallProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </MessageCallProvider>
    </ThemeProvider>
  );
}
