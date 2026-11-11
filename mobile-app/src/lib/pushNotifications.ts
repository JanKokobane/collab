
import * as Application from 'expo-application';
import { isRunningInExpoGo } from 'expo';
import * as Device from 'expo-device';
import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';
import type { User } from 'firebase/auth';

const apiBaseUrl = (
  process.env.EXPO_PUBLIC_API_BASE_URL || 'https://collab-y7pb.onrender.com'
).replace(/\/+$/, '');

export async function sendPushTokenToBackend(token: string, user: User): Promise<void> {
  const send = async (idToken: string) => fetch(`${apiBaseUrl}/api/users/push-token`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token, platform: Platform.OS }),
  });

  let response = await send(await user.getIdToken());
  if (response.status === 401) {
    response = await send(await user.getIdToken(true));
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(payload?.message || 'The device could not be registered for push notifications.');
  }
}

export async function registerForPushNotificationsAsync(user: User): Promise<string | null> {
  if (Platform.OS !== 'android' || !Device.isDevice) return null;
  if (isRunningInExpoGo()) {
    console.warn(
      'FCM push notifications on Android require a custom development build. ' +
      'Run `npx expo run:android` and open the installed app instead of Expo Go.',
    );
    return null;
  }

  const Notifications = await import('expo-notifications');
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  await Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: Notifications.AndroidImportance.HIGH,
  });

  const { status: currentStatus } = await Notifications.getPermissionsAsync();
  const { status } = currentStatus === 'granted'
    ? { status: currentStatus }
    : await Notifications.requestPermissionsAsync();

  if (status !== 'granted') return null;

  const token = (await Notifications.getDevicePushTokenAsync()).data;
  if (__DEV__) {
    console.info('Native FCM device token:', token);
  }
  await sendPushTokenToBackend(token, user);
  return token;
}
