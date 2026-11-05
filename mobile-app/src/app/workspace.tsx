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
  TextInput,
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
import {
  fetchHomeMeetings,
  fetchHomeMembers,
  fetchHomeNotifications,
  fetchHomeProjects,
  fetchHomeResources,
  fetchHomeScratchpad,
  fetchHomeTasks,
  HomeApiError,
  saveHomeScratchpad,
  type HomeMeeting,
  type HomeMember,
  type HomeNotification,
  type HomeProject,
  type HomeResource,
  type HomeTask,
} from '@/lib/homeApi';
import HomeDashboard from '@/components/home-dashboard';
import WorkspaceBottomNavigation from '@/components/workspace-bottom-navigation';

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
  const [homeNotes, setHomeNotes] = useState('');
  const [homeNotesSaved, setHomeNotesSaved] = useState(true);
  const [homeNotesLoading, setHomeNotesLoading] = useState(false);
  const [homeNotesLoaded, setHomeNotesLoaded] = useState(false);
  const [homeLoading, setHomeLoading] = useState(true);
  const [homeRefreshKey, setHomeRefreshKey] = useState(0);
  const [homeError, setHomeError] = useState<string | null>(null);
  const [homePartialErrors, setHomePartialErrors] = useState<string[]>([]);
  const [homeProjects, setHomeProjects] = useState<HomeProject[]>([]);
  const [homeTasks, setHomeTasks] = useState<HomeTask[]>([]);
  const [homeMeetings, setHomeMeetings] = useState<HomeMeeting[]>([]);
  const [homeMembers, setHomeMembers] = useState<HomeMember[]>([]);
  const [homeNotifications, setHomeNotifications] = useState<HomeNotification[]>([]);
  const [homeResources, setHomeResources] = useState<HomeResource[]>([]);
  const [homeProjectId, setHomeProjectId] = useState('');
  const [homeNotesSaving, setHomeNotesSaving] = useState(false);
  const [menuSearch, setMenuSearch] = useState('');

  useEffect(() => onAuthStateChanged(firebaseAuth, (currentUser) => {
    setUser(currentUser);
    setReady(true);
    if (!currentUser) router.replace('/');
  }), []);

  useFocusEffect(useCallback(() => {
    if (!user || activeSection !== 'Home') return;

    let active = true;
    async function loadHome() {
      setHomeLoading(true);
      setHomeError(null);
      setHomePartialErrors([]);
      try {
        const [projectsResult, membersResult, notificationsResult] = await Promise.all([
          fetchHomeProjects(),
          fetchHomeMembers().then(
            (value) => ({ status: 'fulfilled' as const, value }),
            (reason: unknown) => ({ status: 'rejected' as const, reason }),
          ),
          fetchHomeNotifications().then(
            (value) => ({ status: 'fulfilled' as const, value }),
            (reason: unknown) => ({ status: 'rejected' as const, reason }),
          ),
        ]);
        if (!active) return;

        setHomeProjects(projectsResult);
        const partialErrors: string[] = [];
        if (membersResult.status === 'fulfilled') setHomeMembers(membersResult.value);
        else {
          setHomeMembers([]);
          partialErrors.push('Team members could not be loaded.');
        }
        if (notificationsResult.status === 'fulfilled') {
          setHomeNotifications(notificationsResult.value);
        } else {
          setHomeNotifications([]);
          partialErrors.push('Notifications could not be loaded.');
        }

        const selectedProjectId = projectsResult[0]?.id || '';
        setHomeProjectId((current) => (
          projectsResult.some((project) => project.id === current)
            ? current
            : selectedProjectId
        ));

        const projectRequests = await Promise.all(projectsResult.map(async (project) => {
          const [tasksResult, meetingsResult, resourcesResult] = await Promise.allSettled([
            fetchHomeTasks(project),
            fetchHomeMeetings(project),
            fetchHomeResources(project),
          ]);
          return { project, tasksResult, meetingsResult, resourcesResult };
        }));
        if (!active) return;

        const taskRows: HomeTask[] = [];
        const meetingRows: HomeMeeting[] = [];
        const resourceRows: HomeResource[] = [];
        for (const result of projectRequests) {
          if (result.tasksResult.status === 'fulfilled') taskRows.push(...result.tasksResult.value);
          else partialErrors.push(`Tasks for ${result.project.name} could not be loaded.`);
          if (result.meetingsResult.status === 'fulfilled') meetingRows.push(...result.meetingsResult.value);
          else partialErrors.push(`Meetings for ${result.project.name} could not be loaded.`);
          if (result.resourcesResult.status === 'fulfilled') resourceRows.push(...result.resourcesResult.value);
          else partialErrors.push(`Resources for ${result.project.name} could not be loaded.`);
        }

        setHomeTasks(taskRows);
        setHomeMeetings(meetingRows);
        setHomeResources(resourceRows);

        if (active) setHomePartialErrors(partialErrors);
      } catch (error) {
        if (active) {
          setHomeError(error instanceof HomeApiError
            ? error.message
            : 'Home data could not be loaded. Please try again.');
        }
      } finally {
        if (active) setHomeLoading(false);
      }
    }

    void loadHome();
    return () => { active = false; };
  }, [activeSection, homeRefreshKey, user]));

  useFocusEffect(useCallback(() => {
    const project = homeProjects.find((item) => item.id === homeProjectId);
    if (!user || activeSection !== 'Home' || !project) {
      if (activeSection === 'Home' && homeProjects.length === 0) {
        setHomeNotes('');
        setHomeNotesSaved(true);
        setHomeNotesLoading(false);
        setHomeNotesLoaded(false);
      }
      return;
    }

    let active = true;
    setHomeNotesLoading(true);
    setHomeNotesLoaded(false);
    fetchHomeScratchpad(project)
      .then((scratchpad) => {
        if (active) {
          setHomeNotes(scratchpad.content);
          setHomeNotesSaved(true);
          setHomeNotesLoaded(true);
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        const message = error instanceof HomeApiError
          ? error.message
          : 'The project scratchpad could not be loaded.';
        setHomePartialErrors((current) => (
          current.includes(message) ? current : [...current, message]
        ));
      })
      .finally(() => {
        if (active) setHomeNotesLoading(false);
      });

    return () => { active = false; };
  }, [activeSection, homeProjectId, homeProjects, user]));

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

  async function handleSaveHomeNotes() {
    const project = homeProjects.find((item) => item.id === homeProjectId);
    if (!project) {
      Alert.alert('No project selected', 'Create or join a project before saving shared notes.');
      return;
    }
    setHomeNotesSaving(true);
    try {
      const saved = await saveHomeScratchpad(project, homeNotes);
      setHomeNotes(saved.content);
      setHomeNotesSaved(true);
    } catch (error) {
      console.error('Unable to save project scratchpad:', error);
      Alert.alert(
        'Could not save notes',
        error instanceof HomeApiError ? error.message : 'Please try again.',
      );
    } finally {
      setHomeNotesSaving(false);
    }
  }

  function handleHomeProjectSelect(projectId: string) {
    if (projectId === homeProjectId) return;
    setHomeProjectId(projectId);
    setHomeNotes('');
    setHomeNotesSaved(true);
    setHomeNotesLoading(true);
    setHomeNotesLoaded(false);
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
  const searchTerm = menuSearch.trim().toLowerCase();
  const filteredProjects = projects.filter((project) => project.label.toLowerCase().includes(searchTerm));
  const filteredSecondaryItems = secondaryItems.filter((item) => item.label.toLowerCase().includes(searchTerm));

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        style={styles.mainScroll}
        contentContainerStyle={styles.scrollContent}>
        <View style={styles.topbar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open menu"
            onPress={() => setMenuOpen(true)}
            style={({ pressed }) => [styles.menuButton, pressed && styles.pressed]}>
            <Svg width={30} height={30} viewBox="0 0 24 24" fill="none">
              <Path
                d="M3.75 6h16.5M3.75 18h16.5m-16.5-6h10.5"
                stroke="#29292D"
                strokeWidth={1.5}
                strokeLinecap="square"
                strokeMiterlimit={2}
              />
            </Svg>
          </Pressable>
          <Image
            source={require('../../assets/images/logo.png')}
            resizeMode="contain"
            style={styles.headerLogo}
            accessibilityLabel="Collab"
          />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={unreadMessageCount
              ? `Messages, ${unreadMessageCount} unread`
              : 'Messages'}
            onPress={() => router.push('/messages')}
            style={({ pressed }) => [styles.messageButton, pressed && styles.pressed]}>
            <Image
              source={require('../../assets/images/messages-icon.png')}
              resizeMode="contain"
              style={styles.messageIcon}
              accessibilityLabel="Messages"
            />
            {unreadMessageCount > 0 && (
              <View style={styles.messageBadge}>
                <Text style={styles.messageBadgeText}>
                  {unreadMessageCount > 99 ? '99+' : unreadMessageCount}
                </Text>
              </View>
            )}
          </Pressable>

          <View accessibilityLabel="Profile" accessible style={styles.avatarButton}>
            <ProfileAvatar uri={profileImage} initials={initials} style={styles.avatar} />
          </View>
        </View>
        {activeSection === 'Home' ? (
          <View style={styles.homeContent}>
            <HomeDashboard
              displayName={displayName}
              notes={homeNotes}
              notesSaved={homeNotesSaved}
              notesSaving={homeNotesSaving}
              notesLoading={homeNotesLoading}
              notesLoaded={homeNotesLoaded}
              loading={homeLoading}
              error={homeError}
              partialErrors={homePartialErrors}
              projects={homeProjects}
              selectedProjectId={homeProjectId}
              tasks={homeTasks}
              meetings={homeMeetings}
              members={homeMembers}
              notifications={homeNotifications}
              resources={homeResources}
              onProjectSelect={handleHomeProjectSelect}
              onNotesChange={(value) => {
                setHomeNotes(value);
                setHomeNotesSaved(false);
              }}
              onSaveNotes={() => { void handleSaveHomeNotes(); }}
              onRetry={() => setHomeRefreshKey((key) => key + 1)}
            />
          </View>
        ) : (
          <View style={styles.content}>
            <Text style={styles.eyebrow}>COLLAB WORKSPACE</Text>
            <Text style={styles.heading}>{activeSection}</Text>
            <Text style={styles.description}>
              {`${activeSection} is selected. Its mobile workspace tools can be added here next.`}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setMenuOpen(true)}
              style={({ pressed }) => [styles.openMenuButton, pressed && styles.pressed]}>
              <Text style={styles.openMenuButtonText}>Open navigation</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      <WorkspaceBottomNavigation
        activeItem={activeSection}
        onSelect={selectSection}
      />

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
              <Image
                source={require('../../assets/images/logo.png')}
                resizeMode="contain"
                style={styles.drawerLogo}
                accessibilityLabel="Collab"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close navigation menu"
                onPress={() => setMenuOpen(false)}
                style={styles.closeButton}>
                <Image
                  source={require('../../assets/images/drawer-close-icon.png')}
                  resizeMode="contain"
                  style={styles.closeIcon}
                  accessibilityLabel="Close"
                />
              </Pressable>
            </View>

            <ScrollView style={styles.menuScroll} contentContainerStyle={styles.menuContent}>
              <View style={styles.menuSearch}>
                <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
                  <Circle cx={11.5} cy={11.5} r={8.5} stroke="#71717A" strokeWidth={1.7} />
                  <Path
                    d="m18 18 4 4"
                    stroke="#71717A"
                    strokeWidth={1.7}
                    strokeLinecap="round"
                  />
                </Svg>
                <TextInput
                  accessibilityLabel="Search menu"
                  placeholder="Search"
                  placeholderTextColor="#8A8A91"
                  returnKeyType="search"
                  value={menuSearch}
                  onChangeText={setMenuSearch}
                  style={styles.menuSearchInput}
                />
              </View>
              <View style={styles.projectHeading}>
                <Text style={styles.groupLabel}>PROJECTS</Text>
              </View>
              <View style={styles.navGroup}>
                {filteredProjects.map((project) => (
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
                {filteredSecondaryItems.map((item) => (
                  <MenuItem
                    key={item.label}
                    icon={item.icon}
                    label={item.label}
                    active={activeSection === item.label}
                    onPress={() => selectSection(item.label)}
                  />
                ))}
              </View>
              {filteredProjects.length === 0 && filteredSecondaryItems.length === 0 && (
                <Text style={styles.noSearchResults}>No matching sections.</Text>
              )}
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
    backgroundColor: '#F8F8FA',
  },
  menuButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 2,
    borderRadius: 10,
    zIndex: 2,
  },
  headerLogo: {
    width: 116,
    height: 35,
    marginLeft: -18,
    marginTop: -2,
    zIndex: 1,
  },
  avatarButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    marginLeft: 8,
  },
  menuSearch: {
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    borderRadius: 21,
    backgroundColor: '#F8F8FA',
  },
  menuSearchInput: {
    flex: 1,
    paddingVertical: 0,
    color: '#27272A',
    fontSize: 14,
  },
  noSearchResults: {
    paddingHorizontal: 12,
    paddingVertical: 14,
    color: '#71717A',
    fontSize: 13,
  },
  messageButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginLeft: 'auto',
  },
  messageIcon: { width: 28, height: 28 },
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
  mainScroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  homeContent: { flexGrow: 1, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 24 },
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
    width: '100%',
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
  drawerLogo: { width: 116, height: 42 },
  closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginLeft: 'auto' },
  closeIcon: { width: 24, height: 24 },
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
