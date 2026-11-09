import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

const navigationItems = [
  { label: 'Home', icon: 'house' },
  { label: 'Meetings', icon: 'voice-chat' },
  { label: 'To-do', icon: 'checklist' },
  { label: 'Messages', icon: 'messages' },
  { label: 'Notifications', icon: 'notification' },
];

type WorkspaceBottomNavigationProps = {
  activeItem: string;
  onSelect: (item: string) => void;
  unreadMessageCount: number;
  unreadNotificationCount: number;
};

export default function WorkspaceBottomNavigation({
  activeItem,
  onSelect,
  unreadMessageCount,
  unreadNotificationCount,
}: WorkspaceBottomNavigationProps) {
  return (
    <View style={styles.container} accessibilityRole="tablist">
      {navigationItems.map((item) => {
        const selected = activeItem === item.label;
        return (
          <Pressable
            key={item.label}
            accessibilityRole="tab"
            accessibilityLabel={item.label === 'Messages' && unreadMessageCount > 0
              ? `Messages, ${unreadMessageCount} unread`
              : item.label}
            accessibilityState={{ selected }}
            onPress={() => onSelect(item.label)}
            style={({ pressed }) => [
              styles.tab,
              pressed && styles.pressed,
            ]}>
            {selected && <View style={styles.activeIndicator} />}
            {item.icon === 'house' ? (
              <Svg
                width={25}
                height={25}
                style={selected && styles.selectedScale}
                viewBox="0 0 24 24"
                accessibilityLabel="Home">
                <Path
                  fill="none"
                  stroke="#77777F"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M2 10.8473L10.7072 3.4703C11.4532 2.8383 12.5468 2.8383 13.2928 3.4703L22 10.8473M4 9.1528L4 19C4 20.1046 4.8954 21 6 21L18 21C19.1046 21 20 20.1046 20 19L20 9.1528M9 21L9 18C9 16.3431 10.3431 15 12 15C13.6569 15 15 16.3431 15 18L15 21"
                />
              </Svg>
            ) : item.icon === 'voice-chat' ? (
              <Svg
                width={25}
                height={25}
                style={selected && styles.selectedScale}
                viewBox="0 0 24 24"
                accessibilityLabel="Meetings">
                <Path
                  fill="#77777F"
                  d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2m0 14H5.17L4 17.17V4h16zm-6-5.4l3 2.4V7l-3 2.4V7H7v6h7z"
                />
              </Svg>
            ) : item.icon === 'messages' ? (
              <View style={[styles.messageIcon, selected && styles.selectedScale]}>
                <Image
                  source={require('../../assets/images/messages-icon.png')}
                  resizeMode="contain"
                  style={styles.messageImage}
                />
                {unreadMessageCount > 0 && (
                  <View style={styles.messageBadge}>
                    <Text style={styles.notificationBadgeText}>
                      {unreadMessageCount > 99 ? '99+' : unreadMessageCount}
                    </Text>
                  </View>
                )}
              </View>
            ) : item.icon === 'notification' ? (
              <View
                accessibilityLabel={unreadNotificationCount
                  ? `Notifications, ${unreadNotificationCount} unread`
                  : 'Notifications'}
                style={styles.notificationIcon}>
                <Svg
                  width={25}
                  height={25}
                  style={selected && styles.selectedScale}
                  viewBox="0 0 32 32">
                  <Path
                    fill="#77777F"
                    d="M28.707 19.293L26 16.586V13a10.014 10.014 0 0 0-9-9.95V1h-2v2.05A10.014 10.014 0 0 0 6 13v3.586l-2.707 2.707A1 1 0 0 0 3 20v3a1 1 0 0 0 1 1h7v.777a5.15 5.15 0 0 0 4.5 5.199A5.006 5.006 0 0 0 21 25v-1h7a1 1 0 0 0 1-1v-3a1 1 0 0 0-.293-.707M19 25a3 3 0 0 1-6 0v-1h6Zm8-3H5v-1.586l2.707-2.707A1 1 0 0 0 8 17v-4a8 8 0 0 1 16 0v4a1 1 0 0 0 .293.707L27 20.414Z"
                  />
                </Svg>
                {unreadNotificationCount > 0 && (
                  <View style={styles.notificationBadge}>
                    <Text style={styles.notificationBadgeText}>
                      {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                    </Text>
                  </View>
                )}
              </View>
            ) : item.icon === 'checklist' ? (
              <Svg
                width={25}
                height={25}
                style={selected && styles.selectedScale}
                viewBox="0 0 24 24"
                accessibilityLabel="To-do">
                <Path
                  fill="none"
                  stroke="#77777F"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.75}
                  d="M13 6h8m-8 6h8m-8 6h8M3 6.5l2 2L9 4M4.5 15h3A1.5 1.5 0 0 1 9 16.5v3A1.5 1.5 0 0 1 7.5 21h-3A1.5 1.5 0 0 1 3 19.5v-3A1.5 1.5 0 0 1 4.5 15"
                />
              </Svg>
            ) : (
              <Text style={[styles.icon, selected && styles.selectedScale]}>
                {item.icon}
              </Text>
            )}
            <Text
              numberOfLines={1}
              style={[styles.label, selected && styles.selectedScale]}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingHorizontal: 5,
    paddingTop: 7,
    paddingBottom: 5,
    borderTopWidth: 1,
    borderTopColor: '#E4E4E7',
    backgroundColor: '#FFFFFF',
  },
  tab: {
    flex: 1,
    minWidth: 0,
    minHeight: 52,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  activeIndicator: {
    position: 'absolute',
    top: -9,
    width: 40,
    height: 3,
    borderRadius: 1,
    backgroundColor: '#FFC400',
    zIndex: 1,
  },
  selectedScale: { transform: [{ scale: 1.1 }] },
  icon: {
    color: '#77777F',
    fontSize: 23,
    lineHeight: 28,
  },
  label: {
    maxWidth: '100%',
    color: '#77777F',
    fontSize: 9,
    fontWeight: '700',
  },
  messageIcon: { position: 'relative', width: 25, height: 25 },
  messageImage: { width: '100%', height: '100%' },
  messageBadge: {
    position: 'absolute',
    top: -3,
    right: -7,
    minWidth: 15,
    height: 15,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: '#E5483D',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  notificationIcon: { position: 'relative' },
  notificationBadge: {
    position: 'absolute',
    top: -3,
    right: -7,
    minWidth: 15,
    height: 15,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: '#E5483D',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  notificationBadgeText: { color: '#FFFFFF', fontSize: 8, lineHeight: 10, fontWeight: '800' },
  pressed: { opacity: 0.7 },
});
