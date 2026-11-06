import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

const navigationItems = [
  { label: 'Home', icon: 'house' },
  { label: 'Meetings', icon: 'voice-chat' },
  { label: 'Workspace', icon: 'desktop' },
  { label: 'To-do', icon: 'checklist' },
  { label: 'Notifications', icon: 'notification' },
];

type WorkspaceBottomNavigationProps = {
  activeItem: string;
  onSelect: (item: string) => void;
  unreadNotificationCount: number;
};

export default function WorkspaceBottomNavigation({
  activeItem,
  onSelect,
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
            accessibilityState={{ selected }}
            onPress={() => onSelect(item.label)}
            style={({ pressed }) => [
              styles.tab,
              pressed && styles.pressed,
            ]}>
            {item.icon === 'house' ? (
              <Svg
                width={selected ? 35 : 25}
                height={selected ? 35 : 25}
                viewBox="0 0 24 24"
                accessibilityLabel="Home">
                <Path
                  fill="none"
                  stroke={selected ? '#FFC400' : '#77777F'}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M2 10.8473L10.7072 3.4703C11.4532 2.8383 12.5468 2.8383 13.2928 3.4703L22 10.8473M4 9.1528L4 19C4 20.1046 4.8954 21 6 21L18 21C19.1046 21 20 20.1046 20 19L20 9.1528M9 21L9 18C9 16.3431 10.3431 15 12 15C13.6569 15 15 16.3431 15 18L15 21"
                />
              </Svg>
            ) : item.icon === 'voice-chat' ? (
              <Svg
                width={selected ? 35 : 25}
                height={selected ? 35 : 25}
                viewBox="0 0 24 24"
                accessibilityLabel="Meetings">
                <Path
                  fill={selected ? '#FFC400' : '#77777F'}
                  d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2m0 14H5.17L4 17.17V4h16zm-6-5.4l3 2.4V7l-3 2.4V7H7v6h7z"
                />
              </Svg>
            ) : item.icon === 'desktop' ? (
              <Svg
                width={selected ? 35 : 25}
                height={selected ? 35 : 25}
                viewBox="0 0 16 16"
                accessibilityLabel="Workspace">
                <Path
                  fill={selected ? '#FFC400' : '#77777F'}
                  d="M9 3a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H6v1h1.5a.5.5 0 0 1 0 1h-4a.5.5 0 0 1 0-1H5v-1H2a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm-7 7h7V4H2zm12-7a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm-1.5 1a.5.5 0 0 0 0 1h1a.5.5 0 0 0 0-1z"
                />
              </Svg>
            ) : item.icon === 'notification' ? (
              <View
                accessibilityLabel={unreadNotificationCount
                  ? `Notifications, ${unreadNotificationCount} unread`
                  : 'Notifications'}
                style={styles.notificationIcon}>
                <Svg
                  width={selected ? 35 : 25}
                  height={selected ? 35 : 25}
                  viewBox="0 0 32 32">
                  <Path
                    fill={selected ? '#FFC400' : '#77777F'}
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
                width={selected ? 35 : 25}
                height={selected ? 35 : 25}
                viewBox="0 0 24 24"
                accessibilityLabel="To-do">
                <Path
                  fill="none"
                  stroke={selected ? '#FFC400' : '#77777F'}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.75}
                  d="M13 6h8m-8 6h8m-8 6h8M3 6.5l2 2L9 4M4.5 15h3A1.5 1.5 0 0 1 9 16.5v3A1.5 1.5 0 0 1 7.5 21h-3A1.5 1.5 0 0 1 3 19.5v-3A1.5 1.5 0 0 1 4.5 15"
                />
              </Svg>
            ) : (
              <Text style={[
                styles.icon,
                selected && styles.iconSelected,
              ]}>
                {item.icon}
              </Text>
            )}
            <Text
              numberOfLines={1}
              style={[
                styles.label,
                selected && styles.labelSelected,
              ]}>
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
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  icon: {
    color: '#77777F',
    fontSize: 23,
    lineHeight: 28,
    transform: [{ scale: 1 }],
  },
  iconSelected: {
    color: '#FFC400',
    fontSize: 35,
    lineHeight: 37,
    transform: [{ scale: 1.08 }],
  },
  label: {
    maxWidth: '100%',
    color: '#77777F',
    fontSize: 9,
    fontWeight: '700',
  },
  labelSelected: { color: '#FFC400' },
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
