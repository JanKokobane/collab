import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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
  onAcceptInvitation: (notification: HomeNotification) => Promise<void>;
  onDeclineInvitation: (notification: HomeNotification) => Promise<void>;
};

export default function NotificationsScreen({
  notifications, loading, error, onRetry, onMarkAllRead, onMarkRead,
  onAcceptInvitation, onDeclineInvitation,
}: NotificationsScreenProps) {
  const [decliningInvitation, setDecliningInvitation] = useState<HomeNotification | null>(null);
  const [respondingInvitationId, setRespondingInvitationId] = useState<string | null>(null);
  const [declineError, setDeclineError] = useState<string | null>(null);

  const acceptInvitation = async (notification: HomeNotification) => {
    if (!notification.invitationId) return;
    setRespondingInvitationId(notification.invitationId);
    try {
      await onAcceptInvitation(notification);
    } catch (actionError) {
      Alert.alert(
        'Could not accept invitation',
        actionError instanceof Error ? actionError.message : 'Please try again.',
      );
    } finally {
      setRespondingInvitationId(null);
    }
  };

  const confirmDeclineInvitation = async () => {
    if (!decliningInvitation?.invitationId) return;
    setRespondingInvitationId(decliningInvitation.invitationId);
    setDeclineError(null);
    try {
      await onDeclineInvitation(decliningInvitation);
      setDecliningInvitation(null);
    } catch (actionError) {
      setDeclineError(actionError instanceof Error ? actionError.message : 'Please try again.');
    } finally {
      setRespondingInvitationId(null);
    }
  };
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
            const invitationExpiresAt = notification.invitationExpiresAt
              ? new Date(notification.invitationExpiresAt).getTime()
              : null;
            const canRespondToInvitation = notification.type === 'project_invitation'
              && Boolean(notification.invitationId)
              && notification.invitationStatus?.toLowerCase() === 'pending'
              && (invitationExpiresAt === null || invitationExpiresAt > Date.now());
            const isResponding = notification.invitationId === respondingInvitationId;

            return (
              <View key={notification.id} style={styles.notification}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${notification.isRead ? '' : 'Unread: '}${notification.title}. ${notification.detail}`}
                  accessibilityState={{ selected: !notification.isRead }}
                  onPress={() => {
                    if (!notification.isRead) onMarkRead(notification);
                  }}
                  style={({ pressed }) => [
                    styles.notificationContent,
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
                {canRespondToInvitation && (
                  <View style={styles.invitationActions}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={isResponding}
                      onPress={() => { void acceptInvitation(notification); }}
                      style={({ pressed }) => [
                        styles.invitationButton,
                        styles.acceptInvitationButton,
                        (pressed || isResponding) && styles.pressed,
                      ]}>
                      <Text style={styles.acceptInvitationText}>
                        {isResponding ? 'Please wait…' : 'Accept'}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      disabled={isResponding}
                      onPress={() => {
                        setDeclineError(null);
                        setDecliningInvitation(notification);
                      }}
                      style={({ pressed }) => [
                        styles.invitationButton,
                        styles.declineInvitationButton,
                        (pressed || isResponding) && styles.pressed,
                      ]}>
                      <Text style={styles.declineInvitationText}>Decline</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
      <Modal
        visible={Boolean(decliningInvitation)}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!respondingInvitationId) setDecliningInvitation(null);
        }}>
        <View style={styles.confirmationBackdrop}>
          <View
            accessibilityViewIsModal
            accessibilityRole="alert"
            style={styles.confirmationCard}>
            <View style={styles.confirmationHeading}>
              <View style={styles.confirmationIcon}>
                <Text style={styles.confirmationIconText}>!</Text>
              </View>
              <Text style={styles.confirmationTitle}>Decline this invitation?</Text>
            </View>
            <Text style={styles.confirmationMessage}>
              {decliningInvitation
                ? `This will decline your invitation to ${decliningInvitation.detail || 'this project'}.`
                : 'This project invitation will be declined.'}
            </Text>
            {declineError && <Text style={styles.confirmationError}>{declineError}</Text>}
            <View style={styles.confirmationActions}>
              <Pressable
                accessibilityRole="button"
                disabled={Boolean(respondingInvitationId)}
                onPress={() => setDecliningInvitation(null)}
                style={({ pressed }) => [
                  styles.confirmationButton,
                  styles.cancelConfirmationButton,
                  pressed && styles.pressed,
                ]}>
                <Text style={styles.cancelConfirmationText}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={Boolean(respondingInvitationId)}
                onPress={() => { void confirmDeclineInvitation(); }}
                style={({ pressed }) => [
                  styles.confirmationButton,
                  styles.confirmDeclineButton,
                  (pressed || Boolean(respondingInvitationId)) && styles.pressed,
                ]}>
                <Text style={styles.confirmDeclineText}>
                  {respondingInvitationId ? 'Declining…' : 'Decline'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  notification: { gap: 10, padding: 12, borderBottomWidth: 1, borderBottomColor: '#D1D1D1' },
  notificationContent: { minHeight: 48, flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  invitationActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 9, paddingLeft: 45, marginTop: -10 },
  invitationButton: { minWidth: 60, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderRadius: 7 },
  acceptInvitationButton: { borderColor: '#EAB308', backgroundColor: '#EAB308' },
  acceptInvitationText: { color: '#F3F0E8', fontSize: 9, fontWeight: '800' },
  declineInvitationButton: { borderColor: '#E5483D', backgroundColor: '#E5483D' },
  declineInvitationText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800' },
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
  confirmationBackdrop: { flex: 1, justifyContent: 'center', padding: 24 },
  confirmationCard: { gap: 10, padding: 20, borderWidth: 1, borderColor: '#E4E4E7', borderRadius: 18, backgroundColor: '#FFFFFF', shadowColor: '#000000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.16, shadowRadius: 18, elevation: 8 },
  confirmationHeading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  confirmationIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: '#E5483D' },
  confirmationIconText: { color: '#FFFFFF', fontSize: 22, fontWeight: '800' },
  confirmationTitle: { color: '#202020', fontSize: 16, fontWeight: '800' },
  confirmationMessage: { color: '#55545D', fontSize: 12, lineHeight: 18 },
  confirmationError: { color: '#B42318', fontSize: 11, lineHeight: 16 },
  confirmationActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 8 },
  confirmationButton: { minWidth: 86, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderRadius: 10 },
  cancelConfirmationButton: { borderColor: '#D0D5DD', backgroundColor: '#FFFFFF' },
  cancelConfirmationText: { color: '#344054', fontSize: 12, fontWeight: '700' },
  confirmDeclineButton: { borderColor: '#E5483D', backgroundColor: '#E5483D' },
  confirmDeclineText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  pressed: { opacity: 0.72 },
});
