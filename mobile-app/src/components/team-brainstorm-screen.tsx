import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { firebaseAuth } from '@/lib/firebase';
import {
  createBrainstormBoard,
  fetchBrainstormBoard,
  fetchBrainstormBoards,
  HomeApiError,
  saveBrainstormBoard,
  toggleBrainstormReaction,
  type BrainstormBoard,
  type BrainstormBoardSummary,
  type BrainstormLink,
  type BrainstormNote,
  type HomeProject,
} from '@/lib/homeApi';

type Category = 'Idea' | 'Goal' | 'Blocker' | 'Win';
type Tone = 'yellow' | 'mint' | 'rose' | 'blue';
type Note = {
  id: string;
  category: Category;
  content: string;
  author: string;
  authorUid: string | null;
  tone: Tone;
  position: { x: number; y: number };
  reactions: BrainstormNote['reactions'];
};
type NoteDraft = Pick<Note, 'category' | 'content' | 'tone'>;

const categories: Category[] = ['Idea', 'Goal', 'Blocker', 'Win'];
const tones: { name: string; value: Tone; color: string }[] = [
  { name: 'Yellow', value: 'yellow', color: '#FFF1B8' },
  { name: 'Mint', value: 'mint', color: '#DDF3E4' },
  { name: 'Rose', value: 'rose', color: '#F9DDE3' },
  { name: 'Blue', value: 'blue', color: '#DCEBFA' },
];
const categoryStyles: Record<Category, { backgroundColor: string }> = {
  Idea: { backgroundColor: '#E9F1ED' },
  Goal: { backgroundColor: '#F8E7A8' },
  Blocker: { backgroundColor: '#F4C9D0' },
  Win: { backgroundColor: '#CBE9D5' },
};
const categoryFromApi: Record<string, Category> = {
  Ideas: 'Idea',
  Goals: 'Goal',
  Blockers: 'Blocker',
  Wins: 'Win',
};
const categoryToApi: Record<Category, string> = {
  Idea: 'Ideas',
  Goal: 'Goals',
  Blocker: 'Blockers',
  Win: 'Wins',
};
const toneFromApi: Record<string, Tone> = {
  yellow: 'yellow',
  green: 'mint',
  rose: 'rose',
  blue: 'blue',
};
const toneToApi: Record<Tone, string> = {
  yellow: 'yellow',
  mint: 'green',
  rose: 'rose',
  blue: 'blue',
};

type TeamBrainstormScreenProps = {
  projects: HomeProject[];
  displayName: string;
};

function initialsFor(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase();
}

function toApiBoardData(notes: Note[], links: BrainstormLink[]) {
  const apiNotes: BrainstormNote[] = notes.map((note) => ({
    id: note.id,
    category: categoryToApi[note.category],
    content: note.content,
    author: note.author,
    ...(note.authorUid ? { authorUid: note.authorUid } : {}),
    color: toneToApi[note.tone],
    position: note.position,
    reactions: note.reactions,
  }));
  return { notes: apiNotes, links };
}

function reactionCounts(reactions: Note['reactions']) {
  return reactions.reduce<Record<string, number>>((counts, reaction) => {
    counts[reaction.emoji] = (counts[reaction.emoji] || 0) + 1;
    return counts;
  }, {});
}

export default function TeamBrainstormScreen({
  projects,
  displayName,
}: TeamBrainstormScreenProps) {
  const [projectId, setProjectId] = useState(projects[0]?.id || '');
  const [boards, setBoards] = useState<BrainstormBoardSummary[]>([]);
  const [boardId, setBoardId] = useState('');
  const [notes, setNotes] = useState<Note[]>([]);
  const [links, setLinks] = useState<BrainstormLink[]>([]);
  const [picker, setPicker] = useState<'project' | 'board' | null>(null);
  const [loadingBoards, setLoadingBoards] = useState(false);
  const [loadingBoard, setLoadingBoard] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [reloadBoardKey, setReloadBoardKey] = useState(0);
  const [filter, setFilter] = useState<'All' | Category>('All');
  const [connectMode, setConnectMode] = useState(false);
  const [connectStart, setConnectStart] = useState<string | null>(null);
  const [selectedLink, setSelectedLink] = useState<string | null>(null);
  const [autoSave, setAutoSave] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [autoSaveFailed, setAutoSaveFailed] = useState(false);
  const [saveStatus, setSaveStatus] = useState('Saved');
  const [editorVisible, setEditorVisible] = useState(false);
  const [boardEditorVisible, setBoardEditorVisible] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<NoteDraft>({ category: 'Idea', content: '', tone: 'yellow' });
  const selectedProject = projects.find((project) => project.id === projectId);
  const selectedBoard = boards.find((item) => item.id === boardId);
  const visibleNotes = filter === 'All' ? notes : notes.filter((note) => note.category === filter);

  useEffect(() => {
    if (!projects.length) {
      setProjectId('');
      setBoards([]);
      setBoardId('');
      setNotes([]);
      setLinks([]);
      setLoadingBoards(false);
      setLoadingBoard(false);
      setLoadingError(null);
      return;
    }
    if (projects.some((project) => project.id === projectId)) return;
    setProjectId(projects[0].id);
  }, [projectId, projects]);

  useEffect(() => {
    if (!selectedProject) {
      setBoards([]);
      setBoardId('');
      setNotes([]);
      setLinks([]);
      setLoadingBoards(false);
      setLoadingBoard(false);
      setLoadingError(null);
      return;
    }

    let active = true;
    setLoadingBoards(true);
    setLoadingError(null);
    setBoards([]);
    setBoardId('');
    setNotes([]);
    setLinks([]);
    setSelectedLink(null);
    setConnectStart(null);
    setConnectMode(false);
    fetchBrainstormBoards(selectedProject)
      .then((projectBoards) => {
        if (!active) return;
        setBoards(projectBoards);
        setBoardId(projectBoards[0]?.id || '');
      })
      .catch((error: unknown) => {
        console.error('Unable to load brainstorm boards:', error);
        if (!active) return;
        setLoadingError(error instanceof HomeApiError
          ? error.message
          : 'Brainstorm boards could not be loaded. Please try again.');
      })
      .finally(() => {
        if (active) setLoadingBoards(false);
      });

    return () => { active = false; };
  }, [reloadKey, selectedProject]);

  useEffect(() => {
    if (!boardId) {
      setNotes([]);
      setLinks([]);
      setLoadingBoard(false);
      return;
    }
    let active = true;
    setLoadingBoard(true);
    setLoadingError(null);
    setNotes([]);
    setLinks([]);
    setSelectedLink(null);
    setConnectStart(null);
    setConnectMode(false);
    fetchBrainstormBoard(boardId)
      .then((boardData: BrainstormBoard) => {
        if (!active) return;
        setNotes(boardData.notes.map((note) => ({
          ...note,
          authorUid: note.authorUid ?? null,
          category: categoryFromApi[note.category] || 'Idea',
          tone: toneFromApi[note.color] || 'yellow',
        })));
        setLinks(boardData.links);
        setDirty(false);
        setSaveStatus('Saved');
      })
      .catch((error: unknown) => {
        console.error('Unable to load brainstorm board:', error);
        if (!active) return;
        setLoadingError(error instanceof HomeApiError
          ? error.message
          : 'The selected brainstorm board could not be loaded.');
      })
      .finally(() => {
        if (active) setLoadingBoard(false);
      });
    return () => { active = false; };
  }, [boardId, reloadBoardKey]);

  useEffect(() => {
    if (!dirty || !autoSave || autoSaveFailed || !boardId || saving) return undefined;
    setSaveStatus('Unsaved changes');
    const timer = setTimeout(async () => {
      setSaving(true);
      setSaveError(null);
      try {
        await saveBrainstormBoard(boardId, toApiBoardData(notes, links));
        setDirty(false);
        setAutoSaveFailed(false);
        setSaveStatus('Auto-saved');
      } catch (error) {
        console.error('Unable to auto-save brainstorm board:', error);
        setAutoSaveFailed(true);
        setSaveStatus('Save failed');
        setSaveError(error instanceof HomeApiError
          ? error.message
          : 'The brainstorm board could not be saved.');
      } finally {
        setSaving(false);
      }
    }, 900);
    return () => clearTimeout(timer);
  }, [autoSave, autoSaveFailed, boardId, dirty, links, notes, saving]);

  function markChanged() {
    setDirty(true);
    setAutoSaveFailed(false);
    setSaveError(null);
    setSaveStatus('Unsaved changes');
  }

  function openEditor(note?: Note) {
    setEditingId(note?.id || null);
    setDraft(note
      ? { category: note.category, content: note.content, tone: note.tone }
      : { category: 'Idea', content: '', tone: 'yellow' });
    setEditorVisible(true);
  }

  function saveNote() {
    const content = draft.content.trim();
    if (!content) return;
    if (editingId) {
      setNotes((current) => current.map((note) => note.id === editingId
        ? { ...note, ...draft, content }
        : note));
    } else {
      setNotes((current) => [...current, {
        id: `idea-${firebaseAuth.currentUser?.uid || 'member'}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ...draft,
        content,
        author: displayName || 'You',
        authorUid: firebaseAuth.currentUser?.uid || null,
        position: { x: 24 + (current.length % 2) * 295, y: 58 + Math.floor(current.length / 2) * 230 },
        reactions: [],
      }]);
    }
    setEditorVisible(false);
    markChanged();
  }

  function deleteNote() {
    if (!editingId) return;
    if (notes.find((note) => note.id === editingId)?.authorUid !== firebaseAuth.currentUser?.uid) {
      Alert.alert('Cannot delete idea', 'You can only delete ideas you created.');
      return;
    }
    setNotes((current) => current.filter((note) => note.id !== editingId));
    setLinks((current) => current.filter((link) => link.from !== editingId && link.to !== editingId));
    if (selectedLink && links.some((link) => (
      link.id === selectedLink && (link.from === editingId || link.to === editingId)
    ))) setSelectedLink(null);
    setEditorVisible(false);
    markChanged();
  }

  function chooseNote(id: string) {
    if (!connectMode) return;
    if (!connectStart) {
      setConnectStart(id);
      return;
    }
    if (connectStart !== id) {
      const alreadyLinked = links.some((link) => (
        (link.from === connectStart && link.to === id) || (link.from === id && link.to === connectStart)
      ));
      if (!alreadyLinked) {
        setLinks((current) => [...current, {
          id: `link-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          from: connectStart,
          to: id,
          type: 'related',
        }]);
        markChanged();
      }
    }
    setConnectStart(null);
    setConnectMode(false);
  }

  async function reactToNote(noteId: string, emoji: string) {
    if (!boardId || saving) return;
    try {
      const reactions = await toggleBrainstormReaction(boardId, noteId, emoji);
      setNotes((current) => current.map((note) => note.id === noteId
        ? { ...note, reactions }
        : note));
    } catch (error) {
      console.error('Unable to update brainstorm reaction:', error);
      setSaveError(error instanceof HomeApiError
        ? error.message
        : 'The reaction could not be updated. Please try again.');
    }
  }

  async function saveBoard() {
    if (!boardId || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveBrainstormBoard(boardId, toApiBoardData(notes, links));
      setDirty(false);
      setAutoSaveFailed(false);
      setSaveStatus('Saved');
    } catch (error) {
      console.error('Unable to save brainstorm board:', error);
      setAutoSaveFailed(true);
      setSaveStatus('Save failed');
      setSaveError(error instanceof HomeApiError
        ? error.message
        : 'The brainstorm board could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function createBoard() {
    const title = newBoardName.trim();
    if (!selectedProject || !title) return;
    setSaving(true);
    setSaveError(null);
    try {
      const createdBoardId = await createBrainstormBoard(selectedProject, title);
      setBoards((current) => [
        ...current,
        {
          id: createdBoardId,
          projectId: selectedProject.id,
          title,
          updatedAt: new Date().toISOString(),
        },
      ]);
      setBoardId(createdBoardId);
      setDirty(false);
      setBoardEditorVisible(false);
      setNewBoardName('');
    } catch (error) {
      console.error('Unable to create brainstorm board:', error);
      setSaveError(error instanceof HomeApiError
        ? error.message
        : 'The brainstorm board could not be created.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.pageHeading}>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>TEAM IDEAS & RETROSPECTIVES</Text>
          <Text style={styles.title}>Team brainstorm</Text>
          <Text style={styles.description}>
            Shape ideas together, find connections, and turn conversations into direction.
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => Alert.alert('Invite teammates', 'Manage brainstorm board members from the web workspace.')}
          style={({ pressed }) => [styles.inviteButton, pressed && styles.pressed]}>
          <Text style={styles.inviteButtonText}>＋ Invite</Text>
        </Pressable>
      </View>

      <View style={styles.boardShell}>
        <View style={styles.selectors}>
          <View style={styles.selectorGroup}>
            <Text style={styles.selectorLabel}>SELECT PROJECT</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setPicker('project')}
              style={({ pressed }) => [styles.selectorButton, pressed && styles.pressed]}>
              <Text numberOfLines={1} style={styles.selectorValue}>{selectedProject?.name || 'Select a project'}</Text>
              <Text style={styles.chevron}>⌄</Text>
            </Pressable>
          </View>
          <View style={styles.selectorGroup}>
            <Text style={styles.selectorLabel}>BOARD</Text>
            <Pressable
              accessibilityRole="button"
              disabled={loadingBoards}
              onPress={() => setPicker('board')}
              style={({ pressed }) => [styles.selectorButton, loadingBoards && styles.disabled, pressed && styles.pressed]}>
              <Text style={styles.selectorValue}>▦  {selectedBoard?.title || 'Choose a board'}</Text>
              <Text style={styles.chevron}>⌄</Text>
            </Pressable>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {(['All', ...categories] as const).map((category) => {
            const count = category === 'All' ? notes.length : notes.filter((note) => note.category === category).length;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: filter === category }}
                key={category}
                onPress={() => setFilter(category)}
                style={[styles.filterButton, filter === category && styles.filterButtonActive]}>
                <Text style={[styles.filterText, filter === category && styles.filterTextActive]}>
                  {category}{category === 'All' ? '' : ` ${count}`}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            disabled={selectedLink === null || saving}
            onPress={() => {
              if (selectedLink === null) return;
              setLinks((current) => current.filter((link) => link.id !== selectedLink));
              setSelectedLink(null);
              markChanged();
            }}
            style={[styles.toolButton, selectedLink === null && styles.disabled]}>
            <Text style={styles.toolText}>Remove link</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: connectMode }}
            disabled={!selectedBoard || saving}
            onPress={() => {
              setConnectMode((current) => !current);
              setConnectStart(null);
            }}
            style={[
              styles.toolButton,
              connectMode && styles.toolButtonActive,
              (!selectedBoard || saving) && styles.disabled,
            ]}>
            <Text style={[styles.toolText, connectMode && styles.toolTextActive]}>
              {connectMode ? 'Connecting…' : 'Connect'}
            </Text>
          </Pressable>
          <Text style={[styles.saveStatus, dirty && styles.dirtyStatus]}>
            {dirty ? '• ' : '✓ '}{saveStatus}
          </Text>
        </View>

        <View style={styles.primaryActions}>
          <Pressable
            disabled={!selectedBoard || loadingBoard || saving}
            onPress={() => openEditor()}
            style={({ pressed }) => [
              styles.addButton,
              (!selectedBoard || loadingBoard || saving) && styles.disabled,
              pressed && styles.pressed,
            ]}>
            <Text style={styles.addButtonText}>＋ Add idea</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={!dirty || saving}
            onPress={saveBoard}
            style={[styles.toolButton, !dirty && styles.disabled]}>
            <Text style={styles.toolText}>{saving ? 'Saving…' : '▣ Save board'}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: autoSave }}
            onPress={() => setAutoSave((current) => !current)}
            style={styles.autoSave}>
            <View style={[styles.switchTrack, autoSave && styles.switchTrackOn]}>
              <View style={[styles.switchThumb, autoSave && styles.switchThumbOn]} />
            </View>
            <Text style={styles.autoSaveText}>Auto-save</Text>
          </Pressable>
        </View>

        {!!saveError && <Text accessibilityRole="alert" style={styles.errorText}>{saveError}</Text>}
        {loadingBoards || loadingBoard ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color="#31856E" />
            <Text style={styles.emptyCopy}>{loadingBoards ? 'Loading project boards…' : 'Loading board ideas…'}</Text>
          </View>
        ) : loadingError ? (
          <View style={styles.loadingState}>
            <Text style={styles.errorText}>{loadingError}</Text>
            <Pressable
              onPress={() => {
                if (boardId) setReloadBoardKey((key) => key + 1);
                else setReloadKey((key) => key + 1);
              }}
              style={styles.retryButton}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : !projects.length ? (
          <View style={styles.loadingState}>
            <Text style={styles.emptyTitle}>No projects available</Text>
            <Text style={styles.emptyCopy}>Join or create a project to use Team Brainstorm.</Text>
          </View>
        ) : !selectedBoard ? (
          <View style={styles.loadingState}>
            <Text style={styles.emptyTitle}>No brainstorm boards yet</Text>
            <Text style={styles.emptyCopy}>Create a board for {selectedProject?.name || 'this project'} to start collecting ideas.</Text>
            <Pressable
              onPress={() => {
                setNewBoardName('');
                setBoardEditorVisible(true);
              }}
              style={styles.addButton}>
              <Text style={styles.addButtonText}>＋ Create board</Text>
            </Pressable>
          </View>
        ) : null}
        {!!selectedBoard && !loadingBoard && !loadingError && (
        <>
        {connectMode && (
          <Text style={styles.connectHint}>
            {connectStart ? 'Choose another idea to connect.' : 'Tap an idea to start a connection.'}
          </Text>
        )}

        <View style={styles.canvas}>
          <View style={styles.canvasHint}>
            <View style={styles.liveDot} />
            <Text style={styles.canvasHintText}>Ideas on your team board</Text>
          </View>
          <View style={styles.noteGrid}>
            {visibleNotes.map((note) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${note.category} idea by ${note.author}: ${note.content}`}
                key={note.id}
                onPress={() => chooseNote(note.id)}
                style={[
                  styles.noteCard,
                  { backgroundColor: tones.find((tone) => tone.value === note.tone)?.color },
                  connectStart === note.id && styles.noteCardSelected,
                ]}>
                <View style={styles.noteTop}>
                  <Text style={[styles.categoryBadge, categoryStyles[note.category]]}>
                    {note.category}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Edit idea"
                    onPress={() => openEditor(note)}
                    style={styles.moreButton}>
                    <Text style={styles.moreText}>•••</Text>
                  </Pressable>
                </View>
                <Text style={styles.noteContent}>{note.content}</Text>
                <View style={styles.reactions}>
                  {Object.entries(reactionCounts(note.reactions)).map(([emoji, count]) => (
                    <Pressable key={emoji} onPress={() => reactToNote(note.id, emoji)} style={styles.reactionChip}>
                      <Text style={styles.reactionText}>{emoji} {count}</Text>
                    </Pressable>
                  ))}
                  <Pressable onPress={() => reactToNote(note.id, '👍')} style={styles.addReaction}>
                    <Text style={styles.addReactionText}>+</Text>
                  </Pressable>
                </View>
                <View style={styles.noteFooter}>
                  <View style={styles.authorAvatar}>
                    <Text style={styles.authorInitials}>{initialsFor(note.author)}</Text>
                  </View>
                  <Text numberOfLines={1} style={styles.authorName}>{note.author}</Text>
                </View>
              </Pressable>
            ))}
            {!visibleNotes.length && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No {filter.toLowerCase()} ideas yet</Text>
                <Text style={styles.emptyCopy}>Add an idea to start the conversation.</Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.boardFooter}>
          <Text style={styles.footerMetric}>✦ {notes.length} ideas</Text>
          <Text style={styles.footerMetric}>{links.length} connections</Text>
          <Text style={styles.footerHint}>Select Connect, then tap two ideas.</Text>
        </View>
        {!!links.length && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.connectionList}>
            {links.map((link) => {
              const from = notes.find((note) => note.id === link.from)?.content.slice(0, 20) || 'Idea';
              const to = notes.find((note) => note.id === link.to)?.content.slice(0, 20) || 'Idea';
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Connection from ${from} to ${to}`}
                  accessibilityState={{ selected: selectedLink === link.id }}
                  key={link.id}
                  onPress={() => setSelectedLink(link.id)}
                  style={[styles.connectionChip, selectedLink === link.id && styles.connectionChipSelected]}>
                  <Text style={[styles.connectionText, selectedLink === link.id && styles.connectionTextSelected]}>
                    {from} → {to}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
        </>
        )}
      </View>

      <Modal visible={picker !== null} transparent animationType="fade" onRequestClose={() => setPicker(null)}>
        <Pressable style={styles.backdrop} onPress={() => setPicker(null)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{picker === 'project' ? 'Select project' : 'Choose a board'}</Text>
            <ScrollView>
              {(picker === 'project' ? projects : boards).map((item) => {
                const value = picker === 'project'
                  ? ('name' in item ? item.name : '')
                  : ('title' in item ? item.title : '');
                const id = item.id;
                const selected = picker === 'project' ? projectId === id : boardId === id;
                return (
                  <Pressable
                    key={id}
                    onPress={() => {
                      if ((dirty || saving) && (picker === 'project' ? id !== projectId : id !== boardId)) {
                        Alert.alert('Unsaved changes', 'Save the current board before switching.');
                        return;
                      }
                      if (picker === 'project') setProjectId(id);
                      else setBoardId(id);
                      setDirty(false);
                      setPicker(null);
                    }}
                    style={styles.sheetOption}>
                    <Text style={styles.sheetOptionText}>{value}</Text>
                    {selected && <Text style={styles.checkmark}>✓</Text>}
                  </Pressable>
                );
              })}
            </ScrollView>
            {picker === 'board' && (
              <Pressable
                onPress={() => {
                  setPicker(null);
                  setNewBoardName('');
                  setBoardEditorVisible(true);
                }}
                style={styles.createBoard}>
                <Text style={styles.createBoardText}>＋ Create board</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={boardEditorVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setBoardEditorVisible(false)}>
        <View style={styles.backdrop}>
          <View style={styles.editor}>
            <Text style={styles.sheetTitle}>Create board</Text>
            <TextInput
              autoFocus
              maxLength={80}
              onChangeText={setNewBoardName}
              placeholder="Board name"
              style={styles.ideaInput}
              value={newBoardName}
            />
            <View style={styles.editorActions}>
              <View style={styles.actionSpacer} />
              <Pressable onPress={() => setBoardEditorVisible(false)} style={styles.cancelButton}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                disabled={!newBoardName.trim() || saving}
                onPress={() => { void createBoard(); }}
                style={[styles.addButton, (!newBoardName.trim() || saving) && styles.disabled]}>
                <Text style={styles.addButtonText}>{saving ? 'Creating…' : 'Create'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={editorVisible} transparent animationType="fade" onRequestClose={() => setEditorVisible(false)}>
        <View style={styles.backdrop}>
          <View style={styles.editor}>
            <Pressable onPress={() => setEditorVisible(false)} style={styles.closeButton}>
              <Text style={styles.closeText}>×</Text>
            </Pressable>
            <Text style={styles.sheetTitle}>{editingId ? 'Edit idea' : 'Add a new idea'}</Text>
            <Text style={styles.editorDescription}>Capture a thought for your team board.</Text>
            <Text style={styles.fieldLabel}>Your thought</Text>
            <TextInput
              multiline
              maxLength={180}
              onChangeText={(content) => setDraft((current) => ({ ...current, content }))}
              placeholder="What should the team explore?"
              style={styles.ideaInput}
              value={draft.content}
            />
            <Text style={styles.fieldLabel}>Type</Text>
            <View style={styles.categoryOptions}>
              {categories.map((category) => (
                <Pressable
                  key={category}
                  onPress={() => setDraft((current) => ({ ...current, category }))}
                  style={[styles.categoryOption, draft.category === category && styles.categoryOptionSelected]}>
                  <Text style={styles.categoryOptionText}>{category}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.fieldLabel}>Card color</Text>
            <View style={styles.tones}>
              {tones.map((tone) => (
                <Pressable
                  key={tone.value}
                  accessibilityLabel={`${tone.name} card`}
                  onPress={() => setDraft((current) => ({ ...current, tone: tone.value }))}
                  style={[
                    styles.toneOption,
                    { backgroundColor: tone.color },
                    draft.tone === tone.value && styles.toneSelected,
                  ]}>
                  {draft.tone === tone.value && <Text style={styles.checkmark}>✓</Text>}
                </Pressable>
              ))}
            </View>
            <View style={styles.editorActions}>
              {editingId && (
                <Pressable
                  disabled={notes.find((note) => note.id === editingId)?.authorUid !== firebaseAuth.currentUser?.uid}
                  onPress={deleteNote}
                  style={[
                    styles.deleteButton,
                    notes.find((note) => note.id === editingId)?.authorUid !== firebaseAuth.currentUser?.uid && styles.disabled,
                  ]}>
                  <Text style={styles.deleteText}>Delete</Text>
                </Pressable>
              )}
              <View style={styles.actionSpacer} />
              <Pressable onPress={() => setEditorVisible(false)} style={styles.cancelButton}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable disabled={!draft.content.trim()} onPress={saveNote} style={styles.addButton}>
                <Text style={styles.addButtonText}>{editingId ? 'Save changes' : 'Add to board'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, gap: 14, paddingBottom: 8 },
  pageHeading: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  headingCopy: { flex: 1 },
  eyebrow: { marginBottom: 6, color: '#7A8580', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  title: { color: '#17362F', fontSize: 24, lineHeight: 30, fontWeight: '800' },
  description: { marginTop: 5, color: '#71807A', fontSize: 11, lineHeight: 16 },
  inviteButton: { paddingHorizontal: 10, paddingVertical: 9, borderWidth: 1, borderColor: '#CAD3CD', borderRadius: 9, backgroundColor: '#FFFFFF' },
  inviteButtonText: { color: '#31564D', fontSize: 10, fontWeight: '700' },
  boardShell: { overflow: 'hidden', borderWidth: 1, borderColor: '#D9DFD9', borderRadius: 14, backgroundColor: '#FFFFFF' },
  selectors: { gap: 9, padding: 11, borderBottomWidth: 1, borderBottomColor: '#E4E8E3' },
  selectorGroup: { gap: 5 },
  selectorLabel: { color: '#82908A', fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  selectorButton: { minHeight: 37, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: '#D8DED9', borderRadius: 9, backgroundColor: '#FAFBF9' },
  selectorValue: { flex: 1, color: '#2F4540', fontSize: 11, fontWeight: '700' },
  chevron: { color: '#7F8B86', fontSize: 15 },
  filters: { gap: 5, paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#E4E8E3', backgroundColor: '#FAFBF9' },
  filterButton: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 7 },
  filterButtonActive: { backgroundColor: '#244E44' },
  filterText: { color: '#71807A', fontSize: 10, fontWeight: '700' },
  filterTextActive: { color: '#FFFFFF' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingTop: 10 },
  toolButton: { minHeight: 33, justifyContent: 'center', paddingHorizontal: 9, borderWidth: 1, borderColor: '#D7DED9', borderRadius: 8, backgroundColor: '#FFFFFF' },
  toolButtonActive: { borderColor: '#5D8B7E', backgroundColor: '#EDF6F2' },
  toolText: { color: '#53635E', fontSize: 9, fontWeight: '700' },
  toolTextActive: { color: '#245C4E' },
  disabled: { opacity: 0.45 },
  saveStatus: { flex: 1, color: '#6D7D77', fontSize: 8, textAlign: 'right' },
  dirtyStatus: { color: '#B98711' },
  primaryActions: { flexDirection: 'row', alignItems: 'center', gap: 7, padding: 10 },
  addButton: { minHeight: 35, justifyContent: 'center', paddingHorizontal: 11, borderRadius: 8, backgroundColor: '#F2C94C' },
  addButtonText: { color: '#203A33', fontSize: 10, fontWeight: '800' },
  autoSave: { flexDirection: 'row', alignItems: 'center', gap: 5, marginLeft: 'auto' },
  switchTrack: { width: 30, height: 18, justifyContent: 'center', padding: 2, borderRadius: 10, backgroundColor: '#C9CFCB' },
  switchTrackOn: { backgroundColor: '#3D8A75' },
  switchThumb: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#FFFFFF' },
  switchThumbOn: { alignSelf: 'flex-end' },
  autoSaveText: { color: '#66736E', fontSize: 9 },
  connectHint: { paddingHorizontal: 11, paddingBottom: 7, color: '#2E695B', fontSize: 10, fontWeight: '700' },
  canvas: { minHeight: 340, padding: 10, borderTopWidth: 1, borderTopColor: '#E4E8E3', borderBottomWidth: 1, borderBottomColor: '#E4E8E3', backgroundColor: '#F8F9F6' },
  canvasHint: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#3BA77E' },
  canvasHintText: { color: '#71807A', fontSize: 9, fontWeight: '600' },
  noteGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 9 },
  noteCard: { width: '48%', minHeight: 190, padding: 9, borderWidth: 1, borderColor: 'rgba(41,58,51,0.1)', borderRadius: 9, shadowColor: '#1F332E', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 5, elevation: 1 },
  noteCardSelected: { borderWidth: 2, borderColor: '#16806F' },
  noteTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  categoryBadge: { overflow: 'hidden', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 9, color: '#3E5C50', fontSize: 7, fontWeight: '800', textTransform: 'uppercase' },
  moreButton: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.55)' },
  moreText: { marginTop: -7, color: '#61716A', fontSize: 13, fontWeight: '800' },
  noteContent: { minHeight: 64, marginTop: 8, color: '#2A3D37', fontSize: 10, lineHeight: 15, fontWeight: '600' },
  reactions: { minHeight: 25, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 3, marginTop: 4 },
  reactionChip: { paddingHorizontal: 5, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(49,75,65,0.14)', borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.58)' },
  reactionText: { color: '#4C6259', fontSize: 8, fontWeight: '700' },
  addReaction: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(49,75,65,0.18)', borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.6)' },
  addReactionText: { color: '#4C6259', fontSize: 14 },
  noteFooter: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  authorAvatar: { width: 21, height: 21, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.65)' },
  authorInitials: { color: '#385248', fontSize: 7, fontWeight: '800' },
  authorName: { flex: 1, color: '#52635B', fontSize: 8, fontWeight: '700' },
  emptyState: { width: '100%', alignItems: 'center', paddingVertical: 32 },
  emptyTitle: { color: '#40514D', fontSize: 13, fontWeight: '800' },
  emptyCopy: { marginTop: 5, color: '#89938F', fontSize: 10 },
  boardFooter: { minHeight: 37, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10 },
  footerMetric: { color: '#66736E', fontSize: 9, fontWeight: '700' },
  footerHint: { flex: 1, color: '#89938F', fontSize: 8, textAlign: 'right' },
  connectionList: { gap: 6, paddingHorizontal: 10, paddingBottom: 9 },
  connectionChip: { paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: '#D7DED9', borderRadius: 12, backgroundColor: '#FFFFFF' },
  connectionChipSelected: { borderColor: '#3D8A75', backgroundColor: '#EDF6F2' },
  connectionText: { color: '#53635E', fontSize: 8, fontWeight: '700' },
  connectionTextSelected: { color: '#245C4E' },
  loadingState: { minHeight: 125, alignItems: 'center', justifyContent: 'center', gap: 9, padding: 18 },
  errorText: { paddingHorizontal: 12, color: '#A33B35', fontSize: 10, lineHeight: 15 },
  retryButton: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: '#FCE9E7' },
  retryText: { color: '#A33B35', fontSize: 10, fontWeight: '800' },
  backdrop: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(17,24,39,0.46)' },
  sheet: { maxHeight: '75%', padding: 17, borderRadius: 16, backgroundColor: '#FFFFFF' },
  sheetTitle: { color: '#17362F', fontSize: 19, fontWeight: '800' },
  sheetOption: { minHeight: 45, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#EDF0ED' },
  sheetOptionText: { color: '#40514D', fontSize: 12, fontWeight: '600' },
  checkmark: { color: '#31856E', fontSize: 15, fontWeight: '800' },
  createBoard: { minHeight: 42, justifyContent: 'center', marginTop: 6 },
  createBoardText: { color: '#2E695B', fontSize: 12, fontWeight: '800' },
  editor: { padding: 17, borderRadius: 16, backgroundColor: '#FFFFFF' },
  closeButton: { position: 'absolute', zIndex: 1, top: 9, right: 10, width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: '#F3F5F3' },
  closeText: { color: '#66736E', fontSize: 22 },
  editorDescription: { marginTop: 5, color: '#71807A', fontSize: 10 },
  fieldLabel: { marginTop: 13, marginBottom: 6, color: '#40514D', fontSize: 10, fontWeight: '800' },
  ideaInput: { minHeight: 78, padding: 9, borderWidth: 1, borderColor: '#D8DED9', borderRadius: 9, color: '#2F4540', fontSize: 11, textAlignVertical: 'top' },
  categoryOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  categoryOption: { paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: '#D8DED9', borderRadius: 7 },
  categoryOptionSelected: { borderColor: '#3D8A75', backgroundColor: '#EDF6F2' },
  categoryOptionText: { color: '#40514D', fontSize: 9, fontWeight: '700' },
  tones: { flexDirection: 'row', gap: 9 },
  toneOption: { width: 29, height: 29, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', borderRadius: 15 },
  toneSelected: { borderWidth: 2, borderColor: '#315B51' },
  editorActions: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 18 },
  actionSpacer: { flex: 1 },
  deleteButton: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 8 },
  deleteText: { color: '#B54745', fontSize: 10, fontWeight: '800' },
  cancelButton: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 9, borderWidth: 1, borderColor: '#D8DED9', borderRadius: 8 },
  cancelText: { color: '#52635B', fontSize: 9, fontWeight: '700' },
  pressed: { opacity: 0.72 },
});
