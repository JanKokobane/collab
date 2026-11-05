import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { router, useFocusEffect } from 'expo-router';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { firebaseAuth } from '@/lib/firebase';
import { fetchConversations, MessagesApiError } from '@/lib/messagesApi';

const primaryItems = [
  { label: 'Home', icon: '⌂' },
  { label: 'Meetings', icon: '▣' },
  { label: 'Workspace', icon: '▦' },
  { label: 'Team Brainstorm', icon: '◎' },
  { label: 'Notifications', icon: '♧' },
];

const projects = [
  { label: 'Product Launch', color: '#F28B82' },
  { label: 'Website Redesign', color: '#5794EA' },
  { label: 'Marketing Sprint', color: '#10B981' },
];

const secondaryItems = [
  { label: 'Settings', icon: '⚙' },
  { label: 'Notifications', icon: '♧' },
];

export default function WorkspaceScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('Home');
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);

  useEffect(() => onAuthStateChanged(firebaseAuth, (currentUser) => {
    setUser(currentUser);
    setReady(true);
    if (!currentUser) router.replace('/');
  }), []);

  useFocusEffect(useCallback(() => {
    if (!user) {
      setUnreadMessageCount(0);
      return;
    }

    let active = true;
    const loadUnreadMessageCount = async () => {
      try {
        const conversations = await fetchConversations();
        if (active) {
          setUnreadMessageCount(conversations.reduce(
            (total, conversation) => total + Math.max(0, conversation.unreadCount),
            0,
          ));
        }
      } catch (error) {
        if (error instanceof MessagesApiError && error.status === 0) return;
        console.error('Unable to load unread message count:', error);
      }
    };

    void loadUnreadMessageCount();
    const intervalId = setInterval(() => { void loadUnreadMessageCount(); }, 30_000);
    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [user]));

  useEffect(() => {
    if (!user) {
      setProfileImage(null);
      return;
    }

    let active = true;
    setProfileImage(user.photoURL || null);

    async function loadProfileImage() {
      try {
        if (!user) return;
        const baseUrl = (
          process.env.EXPO_PUBLIC_API_BASE_URL || 'https://collab-y7pb.onrender.com'
        ).replace(/\/+$/, '');
        const token = await user.getIdToken();
        const response = await fetch(`${baseUrl}/api/users/profile-image`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(payload?.message || 'The profile photo could not be retrieved.');
        }

        const savedProfileImage = payload?.data?.profileImage;
        if (active && typeof savedProfileImage === 'string' && savedProfileImage) {
          setProfileImage(savedProfileImage);
        }
      } catch (error) {
        console.warn('Unable to refresh the profile photo; keeping the Firebase photo if available.', error);
      }
    }

    void loadProfileImage();
    return () => {
      active = false;
    };
  }, [user]);

  function selectSection(section: string) {
    setActiveSection(section);
    setMenuOpen(false);
    if (section === 'Messages') router.push('/messages');
  }

  async function handleSignOut() {
    try {
      await signOut(firebaseAuth);
      setMenuOpen(false);
      router.replace('/');
    } catch (error) {
      console.error('Unable to sign out:', error);
      Alert.alert('Sign out failed', 'Please try again.');
    }
  }

  if (!ready || !user) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#F5B800" />
      </View>
    );
  }

  const displayName = user.displayName?.trim() || user.email?.split('@')[0] || 'Collab Member';
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.topbar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open navigation menu"
          onPress={() => setMenuOpen(true)}
          style={({ pressed }) => [styles.avatarButton, pressed && styles.pressed]}>
          <ProfileAvatar uri={profileImage} initials={initials} style={styles.avatar} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search workspace"
          onPress={() => setMenuOpen(true)}
          style={({ pressed }) => [styles.searchButton, pressed && styles.pressed]}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Circle
              cx={11.5}
              cy={11.5}
              r={9.5}
              stroke="#71717A"
              strokeWidth={1.5}
              opacity={0.5}
            />
            <Path
              d="M18.2173 18.2178L21.9999 22.0004"
              stroke="#71717A"
              strokeWidth={1.5}
              strokeLinecap="round"
            />
          </Svg>
          <Text style={styles.searchText}>Search</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={unreadMessageCount
            ? `Messages, ${unreadMessageCount} unread`
            : 'Messages'}
          onPress={() => router.push('/messages')}
          style={({ pressed }) => [styles.messageButton, pressed && styles.pressed]}>
          <Svg width={36} height={36} viewBox="0 0 48 48" fill="none">
            <Path
              d="M5.5 38.741v-27.73a4.08 4.08 0 0 1 4.088-4.089h28.824a4.08 4.08 0 0 1 4.088 4.089v21.597a4.08 4.08 0 0 1-4.088 4.089H12.805L9.421 40.08C7.693 41.81 5.5 41.244 5.5 38.741m9.38-22.657h18.24M14.88 21.6h18.24m-18.24 5.517h11.184"
              stroke="#29292D"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
            />
          </Svg>
          {unreadMessageCount > 0 && (
            <View style={styles.messageBadge}>
              <Text style={styles.messageBadgeText}>
                {unreadMessageCount > 99 ? '99+' : unreadMessageCount}
              </Text>
            </View>
          )}
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>COLLAB WORKSPACE</Text>
        <Text style={styles.heading}>
          {activeSection === 'Home' ? `Welcome, ${displayName}` : activeSection}
        </Text>
        <Text style={styles.description}>
          {activeSection === 'Home'
            ? 'Your workspace navigation is ready. Choose a section from the bottom navigation to get started.'
            : `${activeSection} is selected. Its mobile workspace tools can be added here next.`}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => setMenuOpen(true)}
          style={({ pressed }) => [styles.openMenuButton, pressed && styles.pressed]}>
          <Text style={styles.openMenuButtonText}>Open navigation</Text>
        </Pressable>
      </ScrollView>

      <View style={styles.bottomNavigation} accessibilityRole="tablist">
        {primaryItems.map((item) => {
          const selected = activeSection === item.label;
          return (
            <Pressable
              key={item.label}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={item.label}
              onPress={() => selectSection(item.label)}
              style={({ pressed }) => [
                styles.bottomNavigationItem,
                selected && styles.bottomNavigationItemActive,
                selected && styles.bottomNavigationItemSelected,
                pressed && styles.pressed,
              ]}>
              {item.label === 'Home' ? (
                <Svg width={selected ? 30 : 24} height={selected ? 30 : 24} viewBox="0 0 24 24">
                  <Path
                    fill={selected ? '#F5B800' : '#71717A'}
                    d="M6 19h3v-6h6v6h3v-9l-6-4.5L6 10zm-2 2V9l8-6l8 6v12h-7v-6h-2v6zm8-8.75"
                  />
                </Svg>
              ) : item.label === 'Meetings' ? (
                <Svg width={selected ? 30 : 24} height={selected ? 30 : 24} viewBox="0 0 24 24">
                  <Path
                    fill={selected ? '#F5B800' : '#71717A'}
                    d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2m0 14H5.17L4 17.17V4h16zm-6-5.4l3 2.4V7l-3 2.4V7H7v6h7z"
                  />
                </Svg>
              ) : item.label === 'Notifications' ? (
                <Svg width={selected ? 30 : 24} height={selected ? 30 : 24} viewBox="0 0 24 24">
                  <Path
                    fill={selected ? '#F5B800' : '#71717A'}
                    d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22m7-6v-5a7 7 0 0 0-6-6.93V3a1 1 0 0 0-2 0v1.07A7 7 0 0 0 5 11v5l-2 2v1h18v-1z"
                  />
                </Svg>
              ) : item.label === 'Workspace' ? (
                <Svg width={selected ? 30 : 24} height={selected ? 30 : 24} viewBox="0 0 16 16">
                  <Path
                    fill={selected ? '#F5B800' : '#71717A'}
                    d="M4 16s-1 0-1-1s1-4 5-4s5 3 5 4s-1 1-1 1zm4-5.95a2.5 2.5 0 1 0 0-5a2.5 2.5 0 0 0 0 5M2 1a2 2 0 0 0-2 2v9.5A1.5 1.5 0 0 0 1.5 14h.653a5.4 5.4 0 0 1 1.066-2H1V3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v9h-2.219c.554.654.89 1.373 1.066 2h.653a1.5 1.5 0 0 0 1.5-1.5V3a2 2 0 0 0-2-2z"
                  />
                </Svg>
              ) : item.label === 'Team Brainstorm' ? (
                <Svg width={selected ? 30 : 24} height={selected ? 30 : 24} viewBox="0 0 24 24">
                  <Path
                    fill={selected ? '#F5B800' : '#71717A'}
                    d="M20 10c-.74 0-1.38.4-1.72 1H13V9h4c.55 0 1-.45 1-1V5.72c.6-.35 1-.98 1-1.72c0-1.1-.9-2-2-2s-2 .9-2 2c0 .74.4 1.38 1 1.72V7h-3V5c0-1.65-1.35-3-3-3c-1.3 0-2.41.83-2.83 2.01A3.51 3.51 0 0 0 4 7.5c0 .33.05.65.14.96C2.87 9.14 2 10.49 2 12c0 1.08.43 2.09 1.17 2.83c-.11.38-.17.77-.17 1.17c0 1.96 1.41 3.59 3.31 3.93C6.86 21.16 8.11 22 9.5 22c1.93 0 3.5-1.57 3.5-3.5V17h3v1.28c-.6.35-1 .98-1 1.72c0 1.1.9 2 2 2s2-.9 2-2c0-.74-.4-1.38-1-1.72V16c0-.55-.45-1-1-1h-4v-2h5.28c.35.6.98 1 1.72 1c1.1 0 2-.9 2-2s-.9-2-2-2"
                  />
                </Svg>
              ) : (
                <Text style={[
                  styles.bottomNavigationIcon,
                  selected && styles.bottomNavigationIconActive,
                  selected && styles.bottomNavigationIconSelected,
                ]}>
                  {item.icon}
                </Text>
              )}
              <Text
                numberOfLines={2}
                style={[styles.bottomNavigationLabel, selected && styles.bottomNavigationLabelActive]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
        statusBarTranslucent>
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close navigation menu"
            onPress={() => setMenuOpen(false)}
            style={styles.backdrop}
          />
          <SafeAreaView style={styles.drawer} edges={['top', 'bottom', 'left']}>
            <View style={styles.drawerHeader}>
              <View style={styles.brandMark}>
                <View style={styles.brandDot} />
                <View style={styles.brandBars}>
                  <View style={styles.brandSmallBar} />
                  <View style={styles.brandTallBar} />
                </View>
              </View>
              <Text style={styles.brandName}>Collab<Text style={styles.brandPeriod}>.</Text></Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close navigation menu"
                onPress={() => setMenuOpen(false)}
                style={styles.closeButton}>
                <Text style={styles.closeButtonText}>×</Text>
              </Pressable>
            </View>

            <ScrollView style={styles.menuScroll} contentContainerStyle={styles.menuContent}>
              <View style={styles.projectHeading}>
                <Text style={styles.groupLabel}>PROJECTS</Text>
              </View>
              <View style={styles.navGroup}>
                {projects.map((project) => (
                  <Pressable
                    key={project.label}
                    accessibilityRole="button"
                    accessibilityState={{ selected: activeSection === project.label }}
                    onPress={() => selectSection(project.label)}
                    style={({ pressed }) => [
                      styles.navItem,
                      activeSection === project.label && styles.navItemActive,
                      pressed && styles.pressed,
                    ]}>
                    <View style={[styles.projectDot, { backgroundColor: project.color }]} />
                    <Text style={[styles.navLabel, activeSection === project.label && styles.navLabelActive]}>
                      {project.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={[styles.navGroup, styles.secondaryGroup]}>
                {secondaryItems.map((item) => (
                  <MenuItem
                    key={item.label}
                    icon={item.icon}
                    label={item.label}
                    active={activeSection === item.label}
                    onPress={() => selectSection(item.label)}
                  />
                ))}
              </View>
            </ScrollView>

            <View style={styles.accountArea}>
              <View style={styles.accountInfo}>
                <ProfileAvatar uri={profileImage} initials={initials} style={styles.accountAvatar} />
                <View style={styles.accountCopy}>
                  <Text numberOfLines={1} style={styles.accountName}>{displayName}</Text>
                  <Text numberOfLines={1} style={styles.accountEmail}>{user.email}</Text>
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={handleSignOut}
                style={({ pressed }) => [styles.signOutButton, pressed && styles.pressed]}>
                <Text style={styles.signOutText}>Sign out</Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ProfileAvatar({
  uri,
  initials,
  style,
}: {
  uri: string | null;
  initials: string;
  style: StyleProp<ViewStyle>;
}) {
  const [failedUri, setFailedUri] = useState<string | null>(null);

  return (
    <View style={style}>
      {uri && failedUri !== uri ? (
        <Image
          accessibilityLabel="Profile photo"
          source={{ uri }}
          onError={() => setFailedUri(uri)}
          style={styles.avatarImage}
        />
      ) : (
        <Text style={styles.avatarText}>{initials}</Text>
      )}
    </View>
  );
}

function MenuItem({
  icon,
  label,
  active,
  onPress,
}: {
  icon: string;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.navItem,
        active && styles.navItemActive,
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.navIcon, active && styles.navIconActive]}>{icon}</Text>
      <Text style={[styles.navLabel, active && styles.navLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8F8FA' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8F8FA' },
  topbar: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#E4E4E7',
    backgroundColor: '#FFFFFF',
  },
  avatarButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    marginRight: 10,
  },
  searchButton: {
    flex: 1,
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderRadius: 19,
    backgroundColor: '#F4F4F5',
    marginHorizontal: 4,
  },
  searchText: { marginLeft: 8, color: '#71717A', fontSize: 13, fontWeight: '600' },
  messageButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  messageBadge: {
    position: 'absolute',
    top: 0,
    right: -3,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: '#FF4D4F',
  },
  messageBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  avatar: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: '#F7D8D1',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%', borderRadius: 999 },
  avatarText: { color: '#523B36', fontSize: 12, fontWeight: '800' },
  content: { flexGrow: 1, padding: 24, paddingTop: 36 },
  eyebrow: { color: '#A1A1AA', fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  heading: { marginTop: 12, color: '#202024', fontSize: 27, fontWeight: '800' },
  description: { maxWidth: 420, marginTop: 10, color: '#71717A', fontSize: 15, lineHeight: 23 },
  openMenuButton: {
    alignSelf: 'flex-start',
    marginTop: 24,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#212121',
  },
  openMenuButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  bottomNavigation: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingHorizontal: 4,
    paddingTop: 6,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: '#E4E4E7',
    backgroundColor: '#FFFFFF',
  },
  bottomNavigationItem: {
    flex: 1,
    minWidth: 0,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 2,
    borderRadius: 9,
  },
  bottomNavigationItemActive: { backgroundColor: 'transparent' },
  bottomNavigationItemSelected: { transform: [{ scale: 1.2 }] },
  bottomNavigationIcon: { color: '#71717A', fontSize: 18, lineHeight: 21 },
  bottomNavigationIconActive: { color: '#F5B800' },
  bottomNavigationIconSelected: { fontSize: 26, lineHeight: 29 },
  bottomNavigationLabel: {
    color: '#71717A',
    fontSize: 9,
    lineHeight: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  bottomNavigationLabelActive: { color: '#F5B800', fontWeight: '800' },
  modalRoot: { flex: 1, flexDirection: 'row' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(24, 24, 27, 0.42)' },
  drawer: {
    width: '84%',
    maxWidth: 340,
    height: '100%',
    flexDirection: 'column',
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderRightWidth: 1,
    borderRightColor: '#E4E4E7',
  },
  drawerHeader: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F2',
  },
  brandMark: { width: 31, height: 28, justifyContent: 'flex-end' },
  brandDot: { position: 'absolute', top: 0, left: 0, width: 8, height: 8, borderRadius: 4, backgroundColor: '#202020' },
  brandBars: { flexDirection: 'row', alignItems: 'flex-end', marginLeft: 5 },
  brandSmallBar: { width: 10, height: 11, marginRight: 2, backgroundColor: '#FFC400' },
  brandTallBar: { width: 10, height: 23, backgroundColor: '#FFC400' },
  brandName: { color: '#202020', fontSize: 22, fontWeight: '800', letterSpacing: -1 },
  brandPeriod: { color: '#FFC400' },
  closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginLeft: 'auto' },
  closeButtonText: { color: '#71717A', fontSize: 30, lineHeight: 34 },
  menuScroll: { flex: 1 },
  menuContent: { paddingTop: 16, paddingBottom: 20 },
  navGroup: { gap: 4 },
  navItem: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    borderRadius: 9,
  },
  navItemActive: { backgroundColor: '#F5F5F4' },
  navIcon: { width: 22, color: '#71717A', fontSize: 19, textAlign: 'center' },
  navIconActive: { color: '#1C1C1F' },
  navLabel: { flex: 1, color: '#52525B', fontSize: 14, fontWeight: '500' },
  navLabelActive: { color: '#1C1C1F', fontWeight: '700' },
  projectHeading: { marginTop: 22, marginBottom: 8, paddingHorizontal: 12 },
  groupLabel: { color: '#A1A1AA', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  projectDot: { width: 9, height: 9, marginHorizontal: 6, borderRadius: 5 },
  secondaryGroup: { marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#F0F0F2' },
  accountArea: {
    marginTop: 'auto',
    paddingTop: 15,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: '#E4E4E7',
  },
  accountInfo: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 },
  accountAvatar: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: '#F7D8D1',
    overflow: 'hidden',
  },
  accountCopy: { flex: 1, marginLeft: 10 },
  accountName: { color: '#27272A', fontSize: 13, fontWeight: '700' },
  accountEmail: { marginTop: 3, color: '#8A8A91', fontSize: 11 },
  signOutButton: { alignSelf: 'flex-start', marginTop: 12, paddingHorizontal: 5, paddingVertical: 6 },
  signOutText: { color: '#B42318', fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.7 },
});
