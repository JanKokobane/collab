import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { HomeNotification } from '@/lib/homeApi';

const avatarColors = [
  { backgroundColor: '#FFF0B3', iconColor: '#9A7700' },
  { backgroundColor: '#DCEBFF', iconColor: '#426D9B' },
  { backgroundColor: '#DDF5E8', iconColor: '#3F8060' },
  { backgroundColor: '#FCE1E8', iconColor: '#A8566C' },
  { backgroundColor: '#EFE4FF', iconColor: '#7759A5' },
  { backgroundColor: '#FFE6D5', iconColor: '#A2673A' },
];

function NotificationAvatar({ avatar }: { avatar: string }) {
  const [imageFailed, setImageFailed] = useState(false);
  const avatarValue = avatar.trim();
  const imageUrl = /^https?:\/\//i.test(avatarValue) ? avatarValue : null;
  const colorKey = (imageUrl || avatarValue).toLowerCase();
  const colorHash = Array.from(colorKey).reduce(
    (hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0,
    0,
  );
  const color = avatarColors[colorHash % avatarColors.length];

  return (
    <View style={[styles.marker, { backgroundColor: color.backgroundColor }]}>
      {imageUrl && !imageFailed ? (
        <Image
          source={{ uri: imageUrl }}
          style={styles.avatarImage}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <Svg width={19} height={19} viewBox="0 0 24 24">
          <Path
            fill={color.iconColor}
            d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z"
          />
        </Svg>
      )}
    </View>
  );
}

function formatNotificationDate(value: string) {
  const createdAt = new Date(value);
  if (Number.isNaN(createdAt.getTime())) return '';

  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / 60_000));
  if (elapsedMinutes < 1) return 'Just now';
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h ago`;
  if (elapsedHours < 48) return 'Yesterday';
  return createdAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

type NotificationsScreenProps = {
  notifications: HomeNotification[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onMarkAllRead: () => void;
  onMarkRead: (notification: HomeNotification) => void;
};

export default function NotificationsScreen({
  notifications,
  loading,
  error,
  onRetry,
  onMarkAllRead,
  onMarkRead,
}: NotificationsScreenProps) {
  const unreadCount = notifications.filter((notification) => !notification.isRead).length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.subtitle}>
            {unreadCount === 0 ? 'You’re all caught up.' : `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`}
          </Text>
        </View>
        {unreadCount > 0 && (
          <Pressable
            accessibilityRole="button"
            onPress={onMarkAllRead}
            style={({ pressed }) => [styles.markAllButton, pressed && styles.pressed]}>
            <Text style={styles.markAllText}>Mark all as read</Text>
          </Pressable>
        )}
      </View>

      {loading ? (
        <View style={styles.stateCard}>
          <ActivityIndicator color="#A47E00" />
          <Text style={styles.stateText}>Loading your notifications…</Text>
        </View>
      ) : error ? (
        <View style={styles.stateCard}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={onRetry}
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.stateCard}>
          <Text style={styles.emptyTitle}>No notifications yet</Text>
          <Text style={styles.stateText}>Updates for your account will appear here.</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {notifications.map((notification) => {
            return (
              <Pressable
                key={notification.id}
                accessibilityRole="button"
                accessibilityLabel={`${notification.isRead ? '' : 'Unread: '}${notification.title}. ${notification.detail}`}
                accessibilityState={{ selected: !notification.isRead }}
                onPress={() => {
                  if (!notification.isRead) onMarkRead(notification);
                }}
                style={({ pressed }) => [
                  styles.notification,
                  pressed && styles.pressed,
                ]}>
                <NotificationAvatar avatar={notification.avatar} />
                <View style={styles.copy}>
                  <View style={styles.titleLine}>
                    <Text numberOfLines={2} style={styles.notificationTitle}>{notification.title}</Text>
                    <Text style={styles.timestamp}>{formatNotificationDate(notification.createdAt)}</Text>
                  </View>
                  {!!notification.detail && (
                    <Text style={styles.detail}>{notification.detail}</Text>
                  )}
                  {!!notification.type && (
                    <Text style={styles.type}>{notification.type.replace(/[_-]+/g, ' ')}</Text>
                  )}
                </View>
                {!notification.isRead && <View style={styles.unreadDot} />}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  eyebrow: { color: '#8C8B84', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  title: { marginTop: 4, color: '#202020', fontSize: 25, lineHeight: 30, fontWeight: '800' },
  subtitle: { marginTop: 3, color: '#77766F', fontSize: 11 },
  markAllButton: { paddingHorizontal: 10, paddingVertical: 8 },
  markAllText: { color: '#000000', fontSize: 12, fontWeight: '800' },
  list: { gap: 9 },
  notification: { minHeight: 72, flexDirection: 'row', alignItems: 'flex-start', gap: 11, padding: 12, borderBottomWidth: 1, borderBottomColor: '#D1D1D1' },
  marker: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17 },
  avatarImage: { width: '100%', height: '100%', borderRadius: 17 },
  copy: { flex: 1, minWidth: 0 },
  titleLine: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  notificationTitle: { flex: 1, color: '#252521', fontSize: 12, lineHeight: 17, fontWeight: '800' },
  timestamp: { color: '#8C8B84', fontSize: 9 },
  detail: { marginTop: 4, color: '#66655F', fontSize: 10, lineHeight: 15 },
  type: { marginTop: 6, color: '#8C8B84', fontSize: 8, fontWeight: '700', textTransform: 'capitalize' },
  unreadDot: { width: 7, height: 7, marginTop: 5, borderRadius: 4, backgroundColor: '#E5483D' },
  stateCard: { minHeight: 105, alignItems: 'center', justifyContent: 'center', gap: 9, padding: 18, borderWidth: 1, borderColor: '#E8E8E5', borderRadius: 14, backgroundColor: '#FFFFFF' },
  stateText: { color: '#77766F', fontSize: 11, textAlign: 'center' },
  emptyTitle: { color: '#252521', fontSize: 13, fontWeight: '800' },
  errorText: { color: '#9F2D25', fontSize: 11, textAlign: 'center' },
  retryButton: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: '#FFF0EF' },
  retryText: { color: '#9F2D25', fontSize: 10, fontWeight: '800' },
  pressed: { opacity: 0.72 },
});
