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
  { label: 'Messages', icon: '▤' },
  { label: 'Team Brainstorm', icon: '◎' },
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
            ? 'Your workspace navigation is ready. Choose a section from the menu to get started.'
            : `${activeSection} is selected. Its mobile workspace tools can be added here next.`}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => setMenuOpen(true)}
          style={({ pressed }) => [styles.openMenuButton, pressed && styles.pressed]}>
          <Text style={styles.openMenuButtonText}>Open navigation</Text>
        </Pressable>
      </ScrollView>

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
              <View style={styles.navGroup}>
                {primaryItems.map((item) => (
                  <MenuItem
                    key={item.label}
                    icon={item.icon}
                    label={item.label}
                    active={activeSection === item.label}
                    onPress={() => selectSection(item.label)}
                  />
                ))}
              </View>

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
