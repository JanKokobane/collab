import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

const navigationItems = [
  { label: 'Home', icon: 'house' },
  { label: 'Meetings', icon: 'voice-chat' },
  { label: 'Workspace', icon: 'desktop' },
  { label: 'Team Brainstorm', icon: 'brain-circuit' },
  { label: 'Notifications', icon: 'notification' },
];

type WorkspaceBottomNavigationProps = {
  activeItem: string;
  onSelect: (item: string) => void;
};

export default function WorkspaceBottomNavigation({
  activeItem,
  onSelect,
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
              <Svg
                width={selected ? 35 : 25}
                height={selected ? 35 : 25}
                viewBox="0 0 32 32"
                accessibilityLabel="Notifications">
                <Path
                  fill={selected ? '#FFC400' : '#77777F'}
                  d="M28.707 19.293L26 16.586V13a10.014 10.014 0 0 0-9-9.95V1h-2v2.05A10.014 10.014 0 0 0 6 13v3.586l-2.707 2.707A1 1 0 0 0 3 20v3a1 1 0 0 0 1 1h7v.777a5.15 5.15 0 0 0 4.5 5.199A5.006 5.006 0 0 0 21 25v-1h7a1 1 0 0 0 1-1v-3a1 1 0 0 0-.293-.707M19 25a3 3 0 0 1-6 0v-1h6Zm8-3H5v-1.586l2.707-2.707A1 1 0 0 0 8 17v-4a8 8 0 0 1 16 0v4a1 1 0 0 0 .293.707L27 20.414Z"
                />
              </Svg>
            ) : item.icon === 'brain-circuit' ? (
              <Svg
                width={selected ? 35 : 25}
                height={selected ? 35 : 25}
                viewBox="0 0 24 24"
                accessibilityLabel="Brainstorm">
                <Path
                  fill={selected ? '#FFC400' : '#77777F'}
                  d="M20 10c-.74 0-1.38.4-1.72 1H13V9h4c.55 0 1-.45 1-1V5.72c.6-.35 1-.98 1-1.72c0-1.1-.9-2-2-2s-2 .9-2 2c0 .74.4 1.38 1 1.72V7h-3V5c0-1.65-1.35-3-3-3c-1.3 0-2.41.83-2.83 2.01A3.51 3.51 0 0 0 4 7.5c0 .33.05.65.14.96C2.87 9.14 2 10.49 2 12c0 1.08.43 2.09 1.17 2.83c-.11.38-.17.77-.17 1.17c0 1.96 1.41 3.59 3.31 3.93C6.86 21.16 8.11 22 9.5 22c1.93 0 3.5-1.57 3.5-3.5V17h3v1.28c-.6.35-1 .98-1 1.72c0 1.1.9 2 2 2s2-.9 2-2c0-.74-.4-1.38-1-1.72V16c0-.55-.45-1-1-1h-4v-2h5.28c.35.6.98 1 1.72 1c1.1 0 2-.9 2-2s-.9-2-2-2m-9 8.5c0 .83-.67 1.5-1.5 1.5c-.71 0-1.33-.5-1.47-1.2l-.21-.8H7c-1.1 0-2-.9-2-2c0-.35.08-.68.25-.98l.46-.82l-.78-.51C4.35 13.31 4 12.68 4 12c0-.98.72-1.82 1.68-1.97l1.69-.26l-1.06-1.35c-.2-.26-.32-.59-.32-.92c0-.83.67-1.5 1.5-1.5c.11 0 .21.01.31.03l1.19.17V4.99c0-.55.45-1 1-1s1 .45 1 1v13.5Z"
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
  pressed: { opacity: 0.7 },
});
