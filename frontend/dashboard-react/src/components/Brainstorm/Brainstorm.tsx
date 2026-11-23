import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getUserInitials, useDashboard } from '../../context/DashboardContext';
import { api } from '../../services/api';
import { firebaseAuth } from '../../services/firebase';
import type { Project, ProjectMember } from '../../types/dashboard';
import { createCx } from '../../utils/cx';
import { SvgIcon } from '../../utils/icons';
import styles from './Brainstorm.module.css';

const cx = createCx(styles);

const IDEA_REACTION_EMOJIS = ['👍', '❤️', '😂', '🎉', '👀', '🙌', '🔥', '✅', '🤔', '😄'];
const AUTO_SAVE_DELAY_MS = 700;

interface StickyNoteReaction {
  emoji: string;
  firebaseUid?: string;
}

interface CanvasStickyNote {
  id: string;
  category: string;
  content: string;
  author: string;
  authorUid: string;
  authorProfileImage?: string;
  color: string;
  reactions: StickyNoteReaction[];
  position: { x: number; y: number };
}

interface CanvasStickyLink {
  id: string;
  from: string;
  to: string;
  type: string;
}

interface ServerBrainstormBoard {
  board_id: string;
  project_id: string;
  project_name?: string;
  title: string;
  created_by_firebase_uid?: string;
  members?: ProjectMember[];
  board_data?: {
    notes?: any[];
    links?: any[];
  };
}

const LINK_STYLES: Record<
  string,
  { label: string; color: string; width: number; dash?: string; markerStart?: boolean; markerEnd?: boolean }
> = {
  related: { label: 'Related', color: '#526675', width: 2, markerStart: true, markerEnd: true },
  'leads-to': { label: 'Leads to', color: '#16806F', width: 2.5, markerEnd: true },
  supports: { label: 'Supports', color: '#47835F', width: 2, dash: '5 4', markerEnd: true },
  sequence: { label: 'Sequence', color: '#4E78A5', width: 2, markerStart: true, markerEnd: true }
};

function getMemberUid(member?: Partial<ProjectMember> | null): string {
  if (!member) return '';
  return String(member.firebaseUid || member.firebase_uid || member.uid || '').trim();
}

function getSafeAuthorName(name?: unknown, email = '', uid = ''): string {
  if (typeof name === 'string' && name.trim() && name.trim() !== uid) return name.trim();
  if (typeof email === 'string' && email.trim() && email.trim() !== uid) return email.trim();
  return '';
}

function defaultMindmapPosition(index: number): { x: number; y: number } {
  const standardPositions = [
    { x: 120, y: 110 },
    { x: 460, y: 90 },
    { x: 120, y: 330 },
    { x: 460, y: 330 }
  ];
  if (standardPositions[index]) return { ...standardPositions[index] };
  const additionalIndex = index - standardPositions.length;
  return {
    x: 145 + (additionalIndex % 4) * 300,
    y: 560 + Math.floor(additionalIndex / 4) * 175
  };
}

interface RenderedConnection {
  id: string;
  type: string;
  pathData: string;
  style: (typeof LINK_STYLES)[string];
}

export const Brainstorm: React.FC = () => {
  const {
    projects,
    currentUser,
    firebaseUser,
    pendingBrainstormBoardId,
    setPendingBrainstormBoardId,
    loadNotificationsFromAPI,
    addAuditLog,
    showDashboardConfirmation,
    showDashboardToast
  } = useDashboard();

  const currentUid = firebaseUser?.uid || firebaseAuth.currentUser?.uid || currentUser?.uid || '';

  const accessibleProjects = useMemo(
    () => projects.filter((p) => Boolean(p.projectId && p.name)),
    [projects]
  );

  const [selectedProjectId, setSelectedProjectId] = useState<string>(() => {
    return localStorage.getItem('collab_active_brainstorm_project') || '';
  });
  const [boards, setBoards] = useState<ServerBrainstormBoard[]>([]);
  const [loadingProjectIds, setLoadingProjectIds] = useState<Record<string, boolean>>({});
  const [activeBoard, setActiveBoard] = useState<ServerBrainstormBoard | null>(null);
  const [activeBoardMembers, setActiveBoardMembers] = useState<ProjectMember[]>([]);
  const [stickyNotes, setStickyNotes] = useState<CanvasStickyNote[]>([]);
  const [stickyLinks, setStickyLinks] = useState<CanvasStickyLink[]>([]);

  const [boardMenuOpen, setBoardMenuOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [autoSaveFailed, setAutoSaveFailed] = useState(false);
  const [saveStatusText, setSaveStatusText] = useState('Saved');
  const [autoSaveEnabled, setAutoSaveEnabled] = useState<boolean>(() => {
    const uid = firebaseAuth.currentUser?.uid;
    return uid ? localStorage.getItem(`collab_brainstorm_auto_save:${uid}`) === 'true' : false;
  });

  const [stickyLinkMode, setStickyLinkMode] = useState(false);
  const [pendingStickyLinkId, setPendingStickyLinkId] = useState<string | null>(null);
  const [selectedStickyLinkId, setSelectedStickyLinkId] = useState<string | null>(null);
  const [openActionMenuNoteId, setOpenActionMenuNoteId] = useState<string | null>(null);
  const [openReactionPickerNoteId, setOpenReactionPickerNoteId] = useState<string | null>(null);
  const [pickerOpensUp, setPickerOpensUp] = useState(false);
  const [movingNoteId, setMovingNoteId] = useState<string | null>(null);
  const [connections, setConnections] = useState<RenderedConnection[]>([]);

  // Internal modals
  const [boardModal, setBoardModal] = useState<{
    mode: 'create' | 'edit';
    board?: ServerBrainstormBoard;
    projectId: string;
    title: string;
    selectedMembers: string[];
    memberSearch: string;
    existingMembers: ProjectMember[];
    submitting: boolean;
  } | null>(null);

  const [noteModal, setNoteModal] = useState<{
    mode: 'create' | 'edit';
    noteId?: string;
    category: string;
    color: string;
    content: string;
  } | null>(null);

  const gridRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const pickerWrapRef = useRef<HTMLDivElement | null>(null);
  const boardMenuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const loadedProjectIdsRef = useRef<Set<string>>(new Set());
  const revisionRef = useRef(0);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  const savingRef = useRef(false);
  savingRef.current = saving;
  const autoSaveTimerRef = useRef<number | null>(null);
  const pendingReactionRef = useRef<Set<string>>(new Set());
  const dragStateRef = useRef<{
    noteId: string;
    pointerId: number;
    startX: number;
    startY: number;
    noteStartX: number;
    noteStartY: number;
  } | null>(null);

  // Sync auto-save pref per user
  useEffect(() => {
    if (!currentUid) {
      setAutoSaveEnabled(false);
      return;
    }
    setAutoSaveEnabled(localStorage.getItem(`collab_brainstorm_auto_save:${currentUid}`) === 'true');
  }, [currentUid]);

  // Listen to cross-tab storage auto-save updates
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (!currentUid || event.key !== `collab_brainstorm_auto_save:${currentUid}`) return;
      setAutoSaveEnabled(event.newValue === 'true');
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [currentUid]);

  // Resolve initial selected project
  useEffect(() => {
    if (!accessibleProjects.length) {
      setSelectedProjectId('');
      setActiveBoard(null);
      setActiveBoardMembers([]);
      setStickyNotes([]);
      setStickyLinks([]);
      return;
    }
    setSelectedProjectId((prev) => {
      if (prev && accessibleProjects.some((p) => p.projectId === prev)) return prev;
      const saved = localStorage.getItem('collab_active_brainstorm_project') || '';
      if (saved && accessibleProjects.some((p) => p.projectId === saved)) return saved;
      return accessibleProjects[0].projectId;
    });
  }, [accessibleProjects]);

  const loadBoardDetails = useCallback(
    async (boardId: string) => {
      if (!boardId) {
        setActiveBoard(null);
        setActiveBoardMembers([]);
        setStickyNotes([]);
        setStickyLinks([]);
        setDirty(false);
        setSaveStatusText(accessibleProjects.length ? '' : 'Create or join a project to get started');
        return;
      }
      const response = await api.get(`/projects/brainstorm-boards/${encodeURIComponent(boardId)}`);
      const board: ServerBrainstormBoard | undefined = response?.data?.board;
      if (!board) throw new Error('The server returned an invalid brainstorm board.');

      const boardMembers: ProjectMember[] = Array.isArray(board.members) ? board.members : [];
      const rawNotes = Array.isArray(board.board_data?.notes) ? board.board_data.notes : [];
      const rawLinks = Array.isArray(board.board_data?.links) ? board.board_data.links : [];

      const normalizedNotes: CanvasStickyNote[] = rawNotes.map((note: any, index: number) => {
        const member = boardMembers.find((m) => getMemberUid(m) === note.authorUid);
        const savedAuthor = getSafeAuthorName(note.author, '', note.authorUid);
        const author =
          savedAuthor ||
          (member
            ? getSafeAuthorName(member.name, '', getMemberUid(member)) ||
              getSafeAuthorName('', member.email, note.authorUid)
            : '');
        const authorProfileImage =
          (member && (member.profileImage || member.profile_image)) ||
          note.authorProfileImage ||
          '';
        return {
          id: String(note.id || `sn_${index}`),
          category: note.category || 'Ideas',
          content: note.content || note.text || '',
          author,
          authorUid: String(note.authorUid || ''),
          authorProfileImage,
          color: note.color || 'yellow',
          reactions: Array.isArray(note.reactions) ? note.reactions : [],
          position: note.position || defaultMindmapPosition(index)
        };
      });

      const normalizedLinks: CanvasStickyLink[] = rawLinks.map((link: any, idx: number) => ({
        id: String(link.id || `link-${idx}`),
        from: String(link.from || link.fromId || ''),
        to: String(link.to || link.toId || ''),
        type: String(link.type || 'related')
      }));

      setActiveBoard(board);
      setSelectedProjectId(board.project_id);
      setActiveBoardMembers(boardMembers);
      setStickyNotes(normalizedNotes);
      setStickyLinks(normalizedLinks);
      setDirty(false);
      setAutoSaveFailed(false);
      setSelectedStickyLinkId(null);
      setPendingStickyLinkId(null);
      setStickyLinkMode(false);
      revisionRef.current += 1;
      localStorage.setItem('collab_active_brainstorm_board', board.board_id);
      localStorage.setItem('collab_active_brainstorm_project', board.project_id);
      setSaveStatusText('Saved');
    },
    [accessibleProjects.length]
  );

  const loadBoardsForProject = useCallback(
    async (projectId: string, { force = false, activate = true } = {}) => {
      if (!projectId) return;
      const project = accessibleProjects.find((p) => p.projectId === projectId);
      if (!project) return;

      if (!force && loadedProjectIdsRef.current.has(projectId)) {
        if (activate) {
          const projectBoards = boards.filter((b) => b.project_id === projectId);
          const savedBoardId = localStorage.getItem('collab_active_brainstorm_board');
          const targetId = projectBoards.some((b) => b.board_id === savedBoardId)
            ? savedBoardId
            : projectBoards[0]?.board_id;
          if (targetId) {
            await loadBoardDetails(targetId);
          } else {
            await loadBoardDetails('');
          }
          localStorage.setItem('collab_active_brainstorm_project', projectId);
        }
        return;
      }

      setLoadingProjectIds((prev) => ({ ...prev, [projectId]: true }));
      try {
        const response = await api.get(
          `/projects/${encodeURIComponent(project.projectId)}/brainstorm-boards`
        );
        if (!Array.isArray(response?.data?.boards)) {
          throw new Error('The server returned an invalid brainstorm boards response.');
        }
        const projectBoards: ServerBrainstormBoard[] = response.data.boards.map((b: any) => ({
          ...b,
          project_name: project.name
        }));
        loadedProjectIdsRef.current.add(projectId);
        setBoards((prev) => [
          ...prev.filter((b) => b.project_id !== projectId),
          ...projectBoards
        ]);

        if (activate) {
          const savedBoardId = localStorage.getItem('collab_active_brainstorm_board');
          const targetId = projectBoards.some((b) => b.board_id === savedBoardId)
            ? savedBoardId
            : projectBoards[0]?.board_id;
          if (targetId) {
            await loadBoardDetails(targetId);
          } else {
            await loadBoardDetails('');
          }
          localStorage.setItem('collab_active_brainstorm_project', projectId);
        }
      } catch (error: any) {
        console.error('Unable to load brainstorm boards:', error);
        showDashboardToast(error?.message || 'Brainstorm boards could not be loaded.', 'error');
      } finally {
        setLoadingProjectIds((prev) => {
          const next = { ...prev };
          delete next[projectId];
          return next;
        });
      }
    },
    [accessibleProjects, boards, loadBoardDetails, showDashboardToast]
  );

  // Load boards when selectedProjectId changes
  useEffect(() => {
    if (!selectedProjectId) return;
    if (pendingBrainstormBoardId) return;
    void loadBoardsForProject(selectedProjectId);
  }, [selectedProjectId, pendingBrainstormBoardId]);

  // Open pending board from notification
  useEffect(() => {
    if (!pendingBrainstormBoardId) return;
    const boardId = pendingBrainstormBoardId;
    setPendingBrainstormBoardId(null);
    if (dirtyRef.current || savingRef.current) {
      showDashboardToast('Save your board changes before opening another board.', 'error');
      return;
    }
    loadBoardDetails(boardId)
      .then(() => {
        setBoards((prev) => {
          if (prev.some((b) => b.board_id === boardId)) return prev;
          return prev;
        });
      })
      .catch((error: any) => {
        showDashboardToast(error?.message || 'The requested brainstorm board could not be opened.', 'error');
      });
  }, [pendingBrainstormBoardId, setPendingBrainstormBoardId, loadBoardDetails, showDashboardToast]);

  const saveBoard = useCallback(
    async ({ automatic = false } = {}): Promise<boolean> => {
      if (!activeBoard) return false;
      if (savingRef.current) return false;
      if (!dirtyRef.current) return true;
      if (autoSaveTimerRef.current) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      setAutoSaveFailed(false);
      const savedRevision = revisionRef.current;
      setSaving(true);
      try {
        const boardData = {
          notes: stickyNotes.map((note) => {
            const { authorProfileImage: _omit, ...rest } = note;
            return {
              ...rest,
              authorUid: note.authorUid,
              position: { ...note.position },
              reactions: Array.isArray(note.reactions)
                ? note.reactions.map((r) => ({ ...r }))
                : []
            };
          }),
          links: stickyLinks.map((l) => ({ ...l }))
        };
        const response = await api.put(
          `/projects/brainstorm-boards/${encodeURIComponent(activeBoard.board_id)}`,
          { boardData }
        );
        if (!response?.data?.board) {
          throw new Error('The server did not confirm saving this board.');
        }
        const stillSameRev = revisionRef.current === savedRevision;
        if (stillSameRev) {
          const savedNotesById = new Map<string, any>(
            (response.data.board.board_data?.notes || []).map((n: any) => [String(n.id), n])
          );
          setStickyNotes((prev) =>
            prev.map((note) => {
              const saved = savedNotesById.get(note.id);
              return saved
                ? {
                    ...note,
                    author: saved.author || note.author,
                    reactions: Array.isArray(saved.reactions) ? saved.reactions : note.reactions
                  }
                : note;
            })
          );
          setDirty(false);
        }
        setActiveBoard((prev) => (prev ? { ...prev, ...response.data.board } : prev));
        setSaveStatusText(stillSameRev ? (automatic ? 'Auto-saved' : 'Saved') : 'Unsaved changes');
        if (!automatic && stillSameRev) {
          showDashboardToast('Brainstorm board saved.', 'success');
        }
        return true;
      } catch (error: any) {
        setAutoSaveFailed(true);
        setSaveStatusText('Save failed');
        showDashboardToast(error?.message || 'The brainstorm board could not be saved.', 'error');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [activeBoard, stickyNotes, stickyLinks, showDashboardToast]
  );

  // Schedule auto-save when dirty & enabled
  useEffect(() => {
    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    if (!autoSaveEnabled || autoSaveFailed || !activeBoard || !dirty || saving) return;
    autoSaveTimerRef.current = window.setTimeout(() => {
      autoSaveTimerRef.current = null;
      void saveBoard({ automatic: true });
    }, AUTO_SAVE_DELAY_MS);
    return () => {
      if (autoSaveTimerRef.current) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [autoSaveEnabled, autoSaveFailed, activeBoard, dirty, saving, stickyNotes, stickyLinks, saveBoard]);

  const markDirty = useCallback(() => {
    setDirty(true);
    setAutoSaveFailed(false);
    revisionRef.current += 1;
    setSaveStatusText(activeBoard ? 'Unsaved changes' : 'Choose a board');
  }, [activeBoard]);

  // Recompute SVG connection paths whenever notes/links/window resize
  const recomputeConnections = useCallback(() => {
    const board = gridRef.current;
    if (!board || !activeBoard) {
      setConnections([]);
      return;
    }
    const boardBounds = board.getBoundingClientRect();
    const cardEls = new Map<string, HTMLElement>();
    board.querySelectorAll<HTMLElement>('[data-note-id]').forEach((el) => {
      if (el.dataset.noteId) cardEls.set(el.dataset.noteId, el);
    });

    const nextConnections: RenderedConnection[] = [];
    stickyLinks.forEach((link) => {
      const from = cardEls.get(link.from);
      const to = cardEls.get(link.to);
      if (!from || !to) return;
      const style = LINK_STYLES[link.type] || LINK_STYLES.related;
      const fromBounds = from.getBoundingClientRect();
      const toBounds = to.getBoundingClientRect();
      const fromCenter = {
        x: fromBounds.left - boardBounds.left + fromBounds.width / 2,
        y: fromBounds.top - boardBounds.top + fromBounds.height / 2
      };
      const toCenter = {
        x: toBounds.left - boardBounds.left + toBounds.width / 2,
        y: toBounds.top - boardBounds.top + toBounds.height / 2
      };
      const delta = { x: toCenter.x - fromCenter.x, y: toCenter.y - fromCenter.y };
      const fromScale = Math.min(
        fromBounds.width / 2 / Math.max(Math.abs(delta.x), 0.01),
        fromBounds.height / 2 / Math.max(Math.abs(delta.y), 0.01)
      );
      const toScale = Math.min(
        toBounds.width / 2 / Math.max(Math.abs(delta.x), 0.01),
        toBounds.height / 2 / Math.max(Math.abs(delta.y), 0.01)
      );
      const start = { x: fromCenter.x + delta.x * fromScale, y: fromCenter.y + delta.y * fromScale };
      const end = { x: toCenter.x - delta.x * toScale, y: toCenter.y - delta.y * toScale };
      const curveOffset = Math.min(
        28,
        Math.max(18, Math.max(Math.abs(delta.x), Math.abs(delta.y)) * 0.08)
      );
      const controlOne =
        Math.abs(delta.x) >= Math.abs(delta.y)
          ? { x: start.x + delta.x * 0.35, y: start.y - curveOffset }
          : { x: start.x + curveOffset, y: start.y + delta.y * 0.35 };
      const controlTwo =
        Math.abs(delta.x) >= Math.abs(delta.y)
          ? { x: end.x - delta.x * 0.35, y: end.y - curveOffset }
          : { x: end.x + curveOffset, y: end.y - delta.y * 0.35 };

      nextConnections.push({
        id: link.id,
        type: link.type || 'related',
        pathData: `M ${start.x} ${start.y} C ${controlOne.x} ${controlOne.y}, ${controlTwo.x} ${controlTwo.y}, ${end.x} ${end.y}`,
        style
      });
    });
    setConnections(nextConnections);
  }, [activeBoard, stickyLinks]);

  useEffect(() => {
    const id = window.requestAnimationFrame(recomputeConnections);
    return () => window.cancelAnimationFrame(id);
  }, [stickyNotes, stickyLinks, activeBoard, recomputeConnections]);

  useEffect(() => {
    const onResize = () => {
      setBoardMenuOpen(false);
      recomputeConnections();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [recomputeConnections]);

  // Position fixed board menu near trigger
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number; width: number }>({
    left: 12,
    top: 100,
    width: 340
  });

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const bounds = trigger.getBoundingClientRect();
    const width = Math.min(370, window.innerWidth - 24);
    const menuHeight = boardMenuRef.current?.offsetHeight || 240;
    setMenuPosition({
      width,
      left: Math.max(12, Math.min(bounds.left, window.innerWidth - width - 12)),
      top: Math.max(12, Math.min(bounds.bottom + 6, window.innerHeight - menuHeight - 12))
    });
  }, []);

  useEffect(() => {
    if (!boardMenuOpen) return;
    updateMenuPosition();
    const onScroll = (event: Event) => {
      if (boardMenuRef.current && !boardMenuRef.current.contains(event.target as Node)) {
        setBoardMenuOpen(false);
      }
    };
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [boardMenuOpen, updateMenuPosition, boards]);

  // Global outside click & escape handlers
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (pickerWrapRef.current && !pickerWrapRef.current.contains(target)) {
        setBoardMenuOpen(false);
      }
      if (!target.closest('[data-note-action-menu]')) {
        setOpenActionMenuNoteId(null);
      }
      if (!target.closest('[data-reaction-picker-wrap]')) {
        setOpenReactionPickerNoteId(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setBoardMenuOpen(false);
        setOpenActionMenuNoteId(null);
        setOpenReactionPickerNoteId(null);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const handleSelectNoteForLink = (noteId: string) => {
    if (!pendingStickyLinkId) {
      setPendingStickyLinkId(noteId);
      showDashboardToast('Choose another idea to connect.', 'info');
      return;
    }
    if (pendingStickyLinkId === noteId) {
      setPendingStickyLinkId(null);
      showDashboardToast('Idea connection cancelled.', 'info');
      return;
    }
    const existing = stickyLinks.find(
      (link) =>
        (link.from === pendingStickyLinkId && link.to === noteId) ||
        (link.from === noteId && link.to === pendingStickyLinkId)
    );
    let targetId = '';
    if (existing) {
      targetId = existing.id;
      setStickyLinks((prev) =>
        prev.map((l) => (l.id === existing.id ? { ...l, type: 'related' } : l))
      );
    } else {
      targetId = `link-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setStickyLinks((prev) => [
        ...prev,
        { id: targetId, from: pendingStickyLinkId, to: noteId, type: 'related' }
      ]);
    }
    setSelectedStickyLinkId(targetId);
    setPendingStickyLinkId(null);
    setStickyLinkMode(false);
    markDirty();
    showDashboardToast('Related link ready. Save board to keep it.', 'success');
  };

  const handleToggleReaction = async (note: CanvasStickyNote, emoji: string) => {
    if (!currentUid) {
      showDashboardToast('Sign in to react to an idea.', 'error');
      return;
    }
    const boardId = activeBoard?.board_id;
    if (!boardId) return;
    const reqKey = `${boardId}:${note.id}:${currentUid}`;
    if (pendingReactionRef.current.has(reqKey)) return;

    pendingReactionRef.current.add(reqKey);
    try {
      if (dirtyRef.current) {
        const saved = await saveBoard();
        if (!saved) return;
      }
      const response = await api.post(
        `/projects/brainstorm-boards/${encodeURIComponent(boardId)}/notes/${encodeURIComponent(note.id)}/reactions`,
        { emoji }
      );
      if (!Array.isArray(response?.data?.note?.reactions)) {
        throw new Error('The server returned an invalid reaction update.');
      }
      setStickyNotes((prev) =>
        prev.map((item) =>
          item.id === note.id ? { ...item, reactions: response.data.note.reactions } : item
        )
      );
      setSaveStatusText('Saved');
    } catch (error: any) {
      showDashboardToast(error?.message || 'The idea reaction could not be updated.', 'error');
    } finally {
      pendingReactionRef.current.delete(reqKey);
    }
  };

  const openCreateBoardModal = () => {
    if (dirty) {
      showDashboardToast('Save your board changes before creating another board.', 'error');
      return;
    }
    if (!accessibleProjects.length) {
      showDashboardToast('Create or join a project before creating a brainstorm board.', 'error');
      return;
    }
    setBoardModal({
      mode: 'create',
      projectId: selectedProjectId || accessibleProjects[0].projectId,
      title: '',
      selectedMembers: [],
      memberSearch: '',
      existingMembers: [],
      submitting: false
    });
  };

  const openEditBoardModal = async (board: ServerBrainstormBoard) => {
    if (board.created_by_firebase_uid !== currentUid) return;
    if (dirty || saving) {
      showDashboardToast('Save your board changes before editing board settings.', 'error');
      return;
    }
    try {
      const response = await api.get(
        `/projects/brainstorm-boards/${encodeURIComponent(board.board_id)}`
      );
      const details: ServerBrainstormBoard | undefined = response?.data?.board;
      if (!details?.board_id || !Array.isArray(details.members)) {
        throw new Error('The server returned invalid brainstorm board details.');
      }
      const initialMembers = details.members
        .map(getMemberUid)
        .filter((uid) => uid && uid !== currentUid);

      setBoardModal({
        mode: 'edit',
        board: details,
        projectId: details.project_id,
        title: details.title,
        selectedMembers: initialMembers,
        memberSearch: '',
        existingMembers: details.members,
        submitting: false
      });
    } catch (error: any) {
      showDashboardToast(error?.message || 'The board settings could not be loaded.', 'error');
    }
  };

  const handleRemoveBoard = async (board: ServerBrainstormBoard) => {
    if (board.created_by_firebase_uid !== currentUid) return;
    if (dirty || saving) {
      showDashboardToast('Save your board changes before removing the board.', 'error');
      return;
    }
    const confirmed = await showDashboardConfirmation({
      title: 'Remove brainstorm board?',
      message: `Remove "${board.title}" and all its ideas and member access? This cannot be undone.`,
      confirmLabel: 'Remove board',
      destructive: true
    });
    if (!confirmed) return;

    try {
      await api.delete(`/projects/brainstorm-boards/${encodeURIComponent(board.board_id)}`);
      const remaining = boards.filter((item) => item.board_id !== board.board_id);
      setBoards(remaining);
      if (activeBoard?.board_id === board.board_id) {
        localStorage.removeItem('collab_active_brainstorm_board');
        const nextBoard = remaining.find((item) => item.project_id === selectedProjectId);
        await loadBoardDetails(nextBoard?.board_id || '');
      }
      showDashboardToast('Brainstorm board removed.', 'success');
    } catch (error: any) {
      showDashboardToast(error?.message || 'The brainstorm board could not be removed.', 'error');
    }
  };

  const handleAddIdeaClick = async () => {
    if (!activeBoard) {
      const existing = boards.find((b) => b.project_id === selectedProjectId);
      if (existing) {
        try {
          await loadBoardDetails(existing.board_id);
        } catch (error: any) {
          showDashboardToast(error?.message || 'A brainstorm board could not be opened.', 'error');
          return;
        }
      } else {
        openCreateBoardModal();
        return;
      }
    }
    setNoteModal({ mode: 'create', category: 'Ideas', color: 'yellow', content: '' });
  };

  const projectBoards = useMemo(
    () => boards.filter((b) => b.project_id === selectedProjectId),
    [boards, selectedProjectId]
  );
  const selectedProject = useMemo(
    () => accessibleProjects.find((p) => p.projectId === selectedProjectId),
    [accessibleProjects, selectedProjectId]
  );
  const isProjectLoading = Boolean(selectedProjectId && loadingProjectIds[selectedProjectId]);
  const selectedBoardSummary = projectBoards.find((b) => b.board_id === activeBoard?.board_id);

  // Member options for board modal
  const boardModalMemberOptions = useMemo(() => {
    if (!boardModal) return [];
    const proj = accessibleProjects.find((p) => p.projectId === boardModal.projectId);
    const map = new Map<string, ProjectMember>();
    (proj?.acceptedMembers || []).forEach((m) => {
      const uid = getMemberUid(m);
      if (uid && uid !== currentUid) map.set(uid, m);
    });
    if (
      proj?.creatorFirebaseUid &&
      proj.creatorFirebaseUid !== currentUid &&
      !map.has(proj.creatorFirebaseUid)
    ) {
      map.set(proj.creatorFirebaseUid, {
        firebaseUid: proj.creatorFirebaseUid,
        name: proj.creatorName || 'Project creator',
        email: proj.creatorEmail || '',
        profileImage: proj.creatorProfileImage || ''
      });
    }
    if (boardModal.mode === 'edit' && boardModal.board?.project_id === boardModal.projectId) {
      boardModal.existingMembers.forEach((m) => {
        const uid = getMemberUid(m);
        if (uid && uid !== currentUid && !map.has(uid)) map.set(uid, m);
      });
    }
    const q = boardModal.memberSearch.trim().toLowerCase();
    return [...map.values()].filter((m) =>
      `${m.name || ''} ${m.email || ''}`.toLowerCase().includes(q)
    );
  }, [boardModal, accessibleProjects, currentUid]);

  return (
    <section
      id="brainstorm-container"
      className={cx('brainstorm-page')}
      aria-labelledby="brainstorm-page-title"
    >
      <header className={cx('brainstorm-page-header')}>
        <div>
          <p className="hub-eyebrow">TEAM IDEAS &amp; RETROSPECTIVES</p>
        </div>
      </header>

      <section className={`hub-card ${cx('brainstorm-board')}`} aria-label="Open brainstorming board">
        <div className={cx('mindmap-toolbar')}>
          <div className={cx('brainstorm-board-controls')}>
            <label className={cx('brainstorm-control-label')} htmlFor="brainstorm-project-select">
              Select Project
            </label>
            <select
              id="brainstorm-project-select"
              className={cx('brainstorm-board-select')}
              aria-label="Brainstorm project"
              disabled={saving}
              value={selectedProjectId}
              onChange={(event) => {
                const nextProjId = event.target.value;
                if (dirty || saving) {
                  showDashboardToast(
                    'Finish saving board changes before switching projects.',
                    'error'
                  );
                  return;
                }
                setActiveBoard(null);
                setActiveBoardMembers([]);
                setStickyNotes([]);
                setStickyLinks([]);
                setDirty(false);
                setSelectedProjectId(nextProjId);
              }}
            >
              {accessibleProjects.map((project) => (
                <option key={project.projectId} value={project.projectId}>
                  {project.name}
                </option>
              ))}
            </select>

            <span className={cx('brainstorm-control-label')}>Board</span>
            <div
              className={cx('brainstorm-board-picker')}
              id="brainstorm-board-picker"
              ref={pickerWrapRef}
            >
              <button
                ref={triggerRef}
                type="button"
                className={cx('brainstorm-board-picker-trigger')}
                id="brainstorm-board-select"
                aria-label={selectedBoardSummary?.title || 'Choose a board'}
                aria-haspopup="menu"
                aria-expanded={boardMenuOpen}
                aria-controls="brainstorm-board-menu"
                disabled={!selectedProjectId || saving}
                onClick={() => {
                  const nextOpen = !boardMenuOpen;
                  setBoardMenuOpen(nextOpen);
                  if (nextOpen && selectedProjectId) {
                    void loadBoardsForProject(selectedProjectId, {
                      force: true,
                      activate: false
                    });
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    setBoardMenuOpen(true);
                  }
                }}
              >
                <span id="brainstorm-board-picker-label">
                  {selectedBoardSummary?.title ||
                    (isProjectLoading ? 'Loading boards…' : 'Choose a board')}
                </span>
                <span aria-hidden="true">⌄</span>
              </button>

              <div
                ref={boardMenuRef}
                className={cx('brainstorm-board-menu')}
                id="brainstorm-board-menu"
                role="menu"
                aria-label="Brainstorm boards"
                hidden={!boardMenuOpen}
                style={{
                  width: `${menuPosition.width}px`,
                  left: `${menuPosition.left}px`,
                  top: `${menuPosition.top}px`
                }}
              >
                <div className={cx('brainstorm-board-menu-header')}>
                  <strong>Brainstorm boards</strong>
                  <span>{selectedProject?.name || ''}</span>
                </div>
                {isProjectLoading ? (
                  <p className={cx('brainstorm-board-menu-empty', 'is-loading')}>
                    Loading boards…
                  </p>
                ) : projectBoards.length === 0 ? (
                  <div className={cx('brainstorm-board-menu-empty-state')}>
                    <strong>No boards yet</strong>
                    <span>Create a board to start collecting ideas.</span>
                  </div>
                ) : (
                  projectBoards.map((board) => {
                    const isSelected = board.board_id === activeBoard?.board_id;
                    const isOwner = board.created_by_firebase_uid === currentUid;
                    return (
                      <div
                        key={board.board_id}
                        className={cx('brainstorm-board-menu-row', isSelected && 'is-selected')}
                      >
                        <button
                          type="button"
                          className={cx('brainstorm-board-menu-select')}
                          role="menuitemradio"
                          aria-checked={isSelected}
                          disabled={isProjectLoading || saving}
                          onClick={() => {
                            setBoardMenuOpen(false);
                            if (dirty || saving) {
                              showDashboardToast(
                                'Finish saving board changes before switching boards.',
                                'error'
                              );
                              return;
                            }
                            void loadBoardDetails(board.board_id).catch((err: any) =>
                              showDashboardToast(
                                err?.message || 'The selected board could not be opened.',
                                'error'
                              )
                            );
                          }}
                        >
                          <span className={cx('brainstorm-board-menu-details')}>
                            <strong className={cx('brainstorm-board-menu-title')}>
                              {board.title}
                            </strong>
                            <span className={cx('brainstorm-board-menu-subtitle')}>
                              {isSelected ? 'Currently open' : 'Open board'}
                            </span>
                          </span>
                          <span
                            className={cx('brainstorm-board-menu-indicator')}
                            aria-hidden="true"
                          >
                            {isSelected ? '✓' : ''}
                          </span>
                        </button>
                        {isOwner && (
                          <div className={cx('brainstorm-board-menu-actions')}>
                            <button
                              type="button"
                              className={cx('brainstorm-board-menu-action')}
                              role="menuitem"
                              disabled={isProjectLoading || saving}
                              aria-label={`Edit ${board.title}`}
                              onClick={() => {
                                setBoardMenuOpen(false);
                                void openEditBoardModal(board);
                              }}
                            >
                              Edit board
                            </button>
                            <button
                              type="button"
                              className={`${cx('brainstorm-board-menu-action')} is-danger`}
                              role="menuitem"
                              disabled={isProjectLoading || saving}
                              aria-label={`Remove ${board.title}`}
                              onClick={() => {
                                setBoardMenuOpen(false);
                                void handleRemoveBoard(board);
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <button
              type="button"
              className={`primary-button gold ${cx('brainstorm-board-action')}`}
              id="brainstorm-create-board-btn"
              disabled={!selectedProjectId || saving}
              onClick={openCreateBoardModal}
            >
              + Create board
            </button>
          </div>

          <div className={cx('brainstorm-edit-controls')}>
            <button
              type="button"
              className={`primary-button ${cx('brainstorm-remove-link')}`}
              id="sticky-delete-link-btn"
              disabled={!activeBoard || !selectedStickyLinkId}
              onClick={() => {
                if (!selectedStickyLinkId) return;
                setStickyLinks((prev) => prev.filter((l) => l.id !== selectedStickyLinkId));
                setSelectedStickyLinkId(null);
                markDirty();
                showDashboardToast('Link removed. Save board to keep the change.', 'info');
              }}
            >
              Remove link
            </button>

            <button
              type="button"
              className={`${cx('brainstorm-connect')}${stickyLinkMode ? ' active' : ''}`}
              id="sticky-connect-btn"
              aria-pressed={stickyLinkMode}
              title="Connect two notes"
              disabled={!activeBoard}
              onClick={() => {
                if (!activeBoard) return;
                const nextMode = !stickyLinkMode;
                setStickyLinkMode(nextMode);
                setPendingStickyLinkId(null);
                setSelectedStickyLinkId(null);
                showDashboardToast(
                  nextMode ? 'Choose the first idea to connect.' : 'Idea connection mode closed.',
                  'info'
                );
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M10 13.5 14 9.5M8.2 15.3l-1.4 1.4a3.2 3.2 0 0 1-4.5-4.5l4-4a3.2 3.2 0 0 1 4.5 0M15.8 8.2l1.4-1.4a3.2 3.2 0 0 1 4.5 4.5l-4 4a3.2 3.2 0 0 1-4.5 0"></path>
              </svg>
              <span>Connect</span>
            </button>

            <span className={cx('brainstorm-local-status')} id="brainstorm-save-status" role="status">
              {saveStatusText}
            </span>

            <button
              type="button"
              className={`primary-button gold ${cx('brainstorm-board-action')}`}
              id="hub-add-sticky-btn"
              disabled={!accessibleProjects.length || isProjectLoading || saving}
              onClick={() => void handleAddIdeaClick()}
            >
              + Add idea
            </button>

            <button
              type="button"
              className={`primary-button gold ${cx('brainstorm-save-btn')}`}
              id="save-brainstorm-btn"
              disabled={!activeBoard || !dirty || saving}
              aria-busy={saving ? 'true' : undefined}
              onClick={() => void saveBoard()}
            >
              <span
                className={`form-submit-spinner ${cx('brainstorm-save-spinner')}`}
                aria-hidden="true"
                hidden={!saving}
              ></span>
              <span id="brainstorm-save-button-label">{saving ? 'Saving…' : 'Save board'}</span>
            </button>

            <label className={cx('brainstorm-autosave-switch')} htmlFor="brainstorm-autosave-toggle">
              <input
                type="checkbox"
                id="brainstorm-autosave-toggle"
                aria-label="Automatically save board changes"
                checked={autoSaveEnabled}
                onChange={(event) => {
                  if (!currentUid) {
                    setAutoSaveEnabled(false);
                    showDashboardToast('Sign in to save your Auto-save preference.', 'error');
                    return;
                  }
                  const checked = event.target.checked;
                  setAutoSaveEnabled(checked);
                  localStorage.setItem(`collab_brainstorm_auto_save:${currentUid}`, String(checked));
                  if (checked) setAutoSaveFailed(false);
                }}
              />
              <span className={cx('brainstorm-autosave-track')} aria-hidden="true"></span>
              <span>Auto-save</span>
            </label>
          </div>
        </div>

        <div className={cx('mindmap-viewport')} id="mindmap-viewport" ref={viewportRef}>
          <div
            ref={gridRef}
            className={cx('mindmap-canvas', stickyLinkMode && 'connecting')}
            id="sticky-notes-grid"
            aria-label="Idea map"
          >
            <svg className={cx('sticky-link-layer')} id="sticky-link-layer" aria-hidden="true">
              <defs>
                {Object.entries(LINK_STYLES).map(([type, st]) => {
                  if (!st.markerStart && !st.markerEnd) return null;
                  return (
                    <marker
                      key={type}
                      id={`sticky-link-arrow-${type}`}
                      viewBox="0 0 10 10"
                      refX={st.markerStart ? '2' : '8'}
                      refY="5"
                      markerWidth="7"
                      markerHeight="7"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 0 L 10 5 L 0 10 z" fill={st.color} />
                    </marker>
                  );
                })}
              </defs>
              {connections.map((conn) => {
                const isSelected = conn.id === selectedStickyLinkId;
                return (
                  <React.Fragment key={conn.id}>
                    <path
                      d={conn.pathData}
                      className={cx('sticky-link-hit-target')}
                      role="button"
                      tabIndex={0}
                      aria-label={`Select ${conn.style.label.toLowerCase()} connection`}
                      aria-pressed={isSelected}
                      onClick={() => {
                        setSelectedStickyLinkId(conn.id);
                        showDashboardToast(`${conn.style.label} link selected.`, 'info');
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          setSelectedStickyLinkId(conn.id);
                        }
                      }}
                    />
                    <path
                      d={conn.pathData}
                      fill="none"
                      stroke={conn.style.color}
                      strokeWidth={conn.style.width}
                      strokeDasharray={conn.style.dash}
                      markerEnd={
                        conn.style.markerEnd
                          ? `url(#sticky-link-arrow-${conn.type || 'related'})`
                          : undefined
                      }
                      markerStart={
                        conn.style.markerStart ? `url(#sticky-link-arrow-${conn.type})` : undefined
                      }
                      className={`${cx('sticky-link-line')}${isSelected ? ' selected' : ''}`}
                    />
                  </React.Fragment>
                );
              })}
            </svg>

            {!activeBoard ? (
              <p className={cx('brainstorm-empty-state')}>
                {accessibleProjects.length
                  ? 'Select a project and board, or create a board to start collaborating.'
                  : 'You are not in a project yet. Create or join a project before starting a brainstorm board.'}
              </p>
            ) : (
              stickyNotes.map((note) => {
                const authorName = getSafeAuthorName(note.author, '', note.authorUid);
                const initials = getUserInitials(authorName || 'CO');
                const canDelete = note.authorUid === currentUid;
                const reactionCounts = new Map<string, number>();
                (note.reactions || []).forEach((r) => {
                  reactionCounts.set(r.emoji, (reactionCounts.get(r.emoji) || 0) + 1);
                });
                const isActionOpen = openActionMenuNoteId === note.id;
                const isPickerOpen = openReactionPickerNoteId === note.id;

                return (
                  <article
                    key={note.id}
                    data-note-id={note.id}
                    tabIndex={0}
                    aria-label={`${note.category} idea by ${authorName}`}
                    className={cx(
                      'sticky-note-card',
                      note.color || 'yellow',
                      pendingStickyLinkId === note.id && 'link-source',
                      movingNoteId === note.id && 'moving'
                    )}
                    style={{ left: `${note.position.x}px`, top: `${note.position.y}px` }}
                    onClick={(event) => {
                      const target = event.target as HTMLElement;
                      if (stickyLinkMode && !target.closest('button')) {
                        handleSelectNoteForLink(note.id);
                      }
                    }}
                    onPointerDown={(event) => {
                      const target = event.target as HTMLElement;
                      if (
                        stickyLinkMode ||
                        target.closest('button') ||
                        (event.pointerType === 'mouse' && event.button !== 0)
                      ) {
                        return;
                      }
                      event.currentTarget.setPointerCapture(event.pointerId);
                      dragStateRef.current = {
                        noteId: note.id,
                        pointerId: event.pointerId,
                        startX: event.clientX,
                        startY: event.clientY,
                        noteStartX: note.position.x,
                        noteStartY: note.position.y
                      };
                      setMovingNoteId(note.id);
                    }}
                    onPointerMove={(event) => {
                      const drag = dragStateRef.current;
                      if (!drag || drag.noteId !== note.id || drag.pointerId !== event.pointerId) {
                        return;
                      }
                      const grid = gridRef.current;
                      if (!grid) return;
                      const maxX = Math.max(0, grid.clientWidth - event.currentTarget.offsetWidth);
                      const maxY = Math.max(0, grid.clientHeight - event.currentTarget.offsetHeight);
                      const nextX = Math.max(
                        0,
                        Math.min(maxX, drag.noteStartX + event.clientX - drag.startX)
                      );
                      const nextY = Math.max(
                        0,
                        Math.min(maxY, drag.noteStartY + event.clientY - drag.startY)
                      );
                      setStickyNotes((prev) =>
                        prev.map((item) =>
                          item.id === note.id
                            ? { ...item, position: { x: nextX, y: nextY } }
                            : item
                        )
                      );
                    }}
                    onPointerUp={(event) => {
                      const drag = dragStateRef.current;
                      if (!drag || drag.noteId !== note.id || drag.pointerId !== event.pointerId) {
                        return;
                      }
                      dragStateRef.current = null;
                      setMovingNoteId(null);
                      if (
                        event.clientX !== drag.startX ||
                        event.clientY !== drag.startY
                      ) {
                        markDirty();
                      }
                    }}
                    onPointerCancel={() => {
                      dragStateRef.current = null;
                      setMovingNoteId(null);
                    }}
                    onKeyDown={(event) => {
                      const step = event.shiftKey ? 24 : 8;
                      const offsets: Record<string, [number, number]> = {
                        ArrowLeft: [-step, 0],
                        ArrowRight: [step, 0],
                        ArrowUp: [0, -step],
                        ArrowDown: [0, step]
                      };
                      const offset = offsets[event.key];
                      if (!offset || !gridRef.current) return;
                      event.preventDefault();
                      const maxX = Math.max(
                        0,
                        gridRef.current.clientWidth - event.currentTarget.offsetWidth
                      );
                      const maxY = Math.max(
                        0,
                        gridRef.current.clientHeight - event.currentTarget.offsetHeight
                      );
                      const nextX = Math.max(0, Math.min(maxX, note.position.x + offset[0]));
                      const nextY = Math.max(0, Math.min(maxY, note.position.y + offset[1]));
                      setStickyNotes((prev) =>
                        prev.map((item) =>
                          item.id === note.id
                            ? { ...item, position: { x: nextX, y: nextY } }
                            : item
                        )
                      );
                      markDirty();
                    }}
                  >
                    <div className={cx('sticky-note-header')}>
                      <span className={cx('sticky-cat-badge')}>{note.category}</span>
                      <div className={cx('sticky-note-actions')}>
                        <div className={cx('sticky-note-action-menu')} data-note-action-menu="true">
                          <button
                            type="button"
                            className={cx('sticky-note-action-menu-trigger')}
                            aria-label={`Idea actions for ${authorName}'s idea`}
                            aria-haspopup="menu"
                            aria-expanded={isActionOpen}
                            onClick={() =>
                              setOpenActionMenuNoteId((prev) =>
                                prev === note.id ? null : note.id
                              )
                            }
                          >
                            ⋯
                          </button>
                          <div
                            className={cx('sticky-note-action-menu-items')}
                            role="menu"
                            hidden={!isActionOpen}
                          >
                            <button
                              type="button"
                              className={cx('sticky-note-action-menu-item')}
                              role="menuitem"
                              onClick={() => {
                                setOpenActionMenuNoteId(null);
                                setNoteModal({
                                  mode: 'edit',
                                  noteId: note.id,
                                  category: note.category,
                                  color: note.color || 'yellow',
                                  content: note.content
                                });
                              }}
                            >
                              Edit idea
                            </button>
                          </div>
                        </div>
                        {canDelete && (
                          <button
                            type="button"
                            className={cx('sticky-delete-btn')}
                            aria-label={`Delete note by ${authorName}`}
                            title="Delete idea"
                            onClick={() => {
                              setStickyNotes((prev) => prev.filter((item) => item.id !== note.id));
                              setStickyLinks((prev) => {
                                const kept = prev.filter(
                                  (link) => link.from !== note.id && link.to !== note.id
                                );
                                if (!kept.some((l) => l.id === selectedStickyLinkId)) {
                                  setSelectedStickyLinkId(null);
                                }
                                return kept;
                              });
                              markDirty();
                            }}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>

                    <p className={cx('sticky-note-text')}>{note.content}</p>

                    <div className={cx('sticky-note-footer')}>
                      <span className={cx('sticky-author')}>
                        <span className={cx('sticky-author-avatar')}>
                          {/^data:image\/(?:jpeg|png|webp);base64,/.test(
                            note.authorProfileImage || ''
                          ) ? (
                            <img
                              src={note.authorProfileImage}
                              alt={`${authorName}'s profile photo`}
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            initials
                          )}
                        </span>
                        <span>{authorName}</span>
                      </span>

                      <div
                        className={cx('sticky-reaction-picker-wrap')}
                        data-reaction-picker-wrap="true"
                      >
                        <button
                          type="button"
                          className={cx('sticky-reaction-picker-trigger')}
                          title="Add a reaction"
                          aria-label="Add a reaction"
                          aria-expanded={isPickerOpen}
                          onClick={(event) => {
                            const nextOpen = !isPickerOpen;
                            setOpenReactionPickerNoteId(nextOpen ? note.id : null);
                            if (nextOpen && gridRef.current) {
                              const canvasBounds = gridRef.current.getBoundingClientRect();
                              const vpBounds = viewportRef.current?.getBoundingClientRect();
                              const visibleTop = Math.max(
                                canvasBounds.top,
                                vpBounds?.top ?? canvasBounds.top
                              );
                              const visibleBottom = Math.min(
                                canvasBounds.bottom,
                                vpBounds?.bottom ?? canvasBounds.bottom
                              );
                              const triggerBounds = event.currentTarget.getBoundingClientRect();
                              const spaceAbove = triggerBounds.top - visibleTop;
                              const spaceBelow = visibleBottom - triggerBounds.bottom;
                              setPickerOpensUp(100 > spaceBelow && spaceAbove > spaceBelow);
                            }
                          }}
                        >
                          ☺
                        </button>
                        <div
                          className={cx('sticky-reaction-picker', pickerOpensUp && 'opens-up')}
                          hidden={!isPickerOpen}
                        >
                          {IDEA_REACTION_EMOJIS.map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              className={cx('sticky-reaction-option')}
                              aria-label={`React with ${emoji}`}
                              onClick={() => {
                                setOpenReactionPickerNoteId(null);
                                void handleToggleReaction(note, emoji);
                              }}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className={cx('sticky-reaction-controls')}>
                        <div className={cx('sticky-reaction-list')}>
                          {IDEA_REACTION_EMOJIS.map((emoji) => {
                            const count = reactionCounts.get(emoji) || 0;
                            if (!count) return null;
                            const userReacted = (note.reactions || []).some(
                              (r) => r.emoji === emoji && r.firebaseUid === currentUid
                            );
                            return (
                              <button
                                key={emoji}
                                type="button"
                                className={`${cx('sticky-reaction-chip')}${
                                  userReacted ? ' active' : ''
                                }`}
                                title={`${emoji} reaction${count === 1 ? '' : 's'}`}
                                aria-pressed={userReacted}
                                onClick={() => void handleToggleReaction(note, emoji)}
                              >
                                <span>{emoji}</span>
                                <span>{count}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>
      </section>

      {/* Create / Edit Brainstorm Board Modal */}
      {boardModal && (
        <div
          className="modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget && !boardModal.submitting) {
              setBoardModal(null);
            }
          }}
        >
          <form
            className="modal"
            onSubmit={async (event) => {
              event.preventDefault();
              if (boardModal.submitting) return;
              const trimmedTitle = boardModal.title.trim();
              if (!trimmedTitle) return;
              setBoardModal((prev) => (prev ? { ...prev, submitting: true } : prev));
              try {
                if (boardModal.mode === 'create') {
                  const res = await api.post(
                    `/projects/${encodeURIComponent(boardModal.projectId)}/brainstorm-boards`,
                    {
                      title: trimmedTitle,
                      memberFirebaseUids: boardModal.selectedMembers
                    }
                  );
                  const created = res?.data?.board;
                  if (!created?.board_id) {
                    throw new Error('The server did not return the created brainstorm board.');
                  }
                  setBoardModal(null);
                  await loadBoardsForProject(boardModal.projectId, {
                    force: true,
                    activate: false
                  });
                  await loadBoardDetails(created.board_id);
                  await loadNotificationsFromAPI().catch(() => {});
                  showDashboardToast('Board created. Invited members have been notified.', 'success');
                } else if (boardModal.board) {
                  const res = await api.patch(
                    `/projects/brainstorm-boards/${encodeURIComponent(boardModal.board.board_id)}`,
                    {
                      title: trimmedTitle,
                      projectId: boardModal.projectId,
                      memberFirebaseUids: boardModal.selectedMembers
                    }
                  );
                  const updatedBoard = res?.data?.board;
                  if (!updatedBoard?.board_id) {
                    throw new Error('The server did not confirm the board update.');
                  }
                  setBoards((prev) =>
                    prev.map((b) =>
                      b.board_id === updatedBoard.board_id ? { ...b, ...updatedBoard } : b
                    )
                  );
                  if (activeBoard?.board_id === updatedBoard.board_id) {
                    await loadBoardDetails(updatedBoard.board_id);
                  }
                  setBoardModal(null);
                  await loadNotificationsFromAPI().catch(() => {});
                  showDashboardToast('Board settings updated.', 'success');
                }
              } catch (error: any) {
                showDashboardToast(
                  error?.message || 'The brainstorm board could not be saved.',
                  'error'
                );
                setBoardModal((prev) => (prev ? { ...prev, submitting: false } : prev));
              }
            }}
          >
            <button
              type="button"
              className="close-modal"
              onClick={() => setBoardModal(null)}
              disabled={boardModal.submitting}
            >
              ×
            </button>
            <h2 className={cx('brainstorm-create-board-title')}>
              {boardModal.mode === 'edit' ? 'Edit brainstorm board' : 'Create brainstorm board'}
            </h2>
            <p className={`modal-copy ${cx('brainstorm-create-board-copy')}`}>
              Only selected project members will be able to see and use this board.
            </p>
            <label className={cx('brainstorm-create-board-field')}>
              Project
              <select
                aria-label="Board project"
                value={boardModal.projectId}
                onChange={(event) => {
                  const nextProjId = event.target.value;
                  setBoardModal((prev) =>
                    prev
                      ? {
                          ...prev,
                          projectId: nextProjId,
                          selectedMembers: []
                        }
                      : prev
                  );
                }}
              >
                {accessibleProjects.map((proj) => (
                  <option key={proj.projectId} value={proj.projectId}>
                    {proj.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={cx('brainstorm-create-board-field')}>
              Board name
              <div className={`input-with-icon ${cx('brainstorm-board-name-input')}`}>
                <span className="input-icon-svg">
                  <SvgIcon name="lightbulb" width={16} height={16} />
                </span>
                <input
                  type="text"
                  maxLength={160}
                  required
                  autoFocus
                  placeholder="e.g. Sprint retrospective"
                  value={boardModal.title}
                  onChange={(event) =>
                    setBoardModal((prev) =>
                      prev ? { ...prev, title: event.target.value } : prev
                    )
                  }
                />
              </div>
            </label>
            <fieldset className={cx('brainstorm-create-board-members')}>
              <legend>Invite accepted project members</legend>
              <label className={cx('brainstorm-create-board-search')}>
                <SvgIcon name="search" width={17} height={17} />
                <input
                  type="search"
                  placeholder="Search name or email"
                  aria-label="Search accepted project members"
                  value={boardModal.memberSearch}
                  onChange={(event) =>
                    setBoardModal((prev) =>
                      prev ? { ...prev, memberSearch: event.target.value } : prev
                    )
                  }
                />
              </label>
              <span className={cx('brainstorm-create-board-selection-count')}>
                {boardModal.selectedMembers.length
                  ? `${boardModal.selectedMembers.length} selected`
                  : ''}
              </span>
              <div className={cx('brainstorm-create-member-list')}>
                {boardModalMemberOptions.length === 0 ? (
                  <p className="messages-forward-empty">
                    {boardModal.memberSearch.trim()
                      ? 'No matching project members.'
                      : 'No additional accepted project members are available to invite.'}
                  </p>
                ) : (
                  boardModalMemberOptions.map((member) => {
                    const uid = getMemberUid(member);
                    const checked = boardModal.selectedMembers.includes(uid);
                    const displayName = getSafeAuthorName(member.name, member.email, uid);
                    const initials = getUserInitials(displayName);
                    return (
                      <label
                        key={uid}
                        className={`${cx('brainstorm-board-member-option')}${
                          checked ? ' selected' : ''
                        }`}
                      >
                        <span className={cx('brainstorm-board-member-avatar')}>
                          {member.profileImage || member.profile_image ? (
                            <img
                              src={member.profileImage || member.profile_image}
                              alt={displayName}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : (
                            initials
                          )}
                        </span>
                        <span className={cx('brainstorm-board-member-details')}>
                          <strong>{displayName}</strong>
                          <small>{member.email || ''}</small>
                        </span>
                        <input
                          type="checkbox"
                          name="brainstorm-board-members"
                          value={uid}
                          checked={checked}
                          onChange={(event) => {
                            const isChecked = event.target.checked;
                            setBoardModal((prev) => {
                              if (!prev) return prev;
                              const nextMembers = isChecked
                                ? [...new Set([...prev.selectedMembers, uid])]
                                : prev.selectedMembers.filter((id) => id !== uid);
                              return { ...prev, selectedMembers: nextMembers };
                            });
                          }}
                        />
                      </label>
                    );
                  })
                )}
              </div>
            </fieldset>
            <button
              type="submit"
              className="primary-button full gold"
              disabled={boardModal.submitting}
              aria-busy={boardModal.submitting ? 'true' : undefined}
            >
              <span
                className="form-submit-spinner"
                aria-hidden="true"
                hidden={!boardModal.submitting}
              ></span>
              <span>
                {boardModal.submitting
                  ? boardModal.mode === 'edit'
                    ? 'Saving…'
                    : 'Creating…'
                  : boardModal.mode === 'edit'
                    ? 'Save changes'
                    : 'Create Board'}
              </span>
            </button>
          </form>
        </div>
      )}

      {/* Add / Edit Idea Modal */}
      {noteModal && (
        <div
          className="modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setNoteModal(null);
          }}
        >
          <form
            className="modal"
            onSubmit={(event) => {
              event.preventDefault();
              const content = noteModal.content.trim();
              if (!content) return;
              if (noteModal.mode === 'edit' && noteModal.noteId) {
                setStickyNotes((prev) =>
                  prev.map((item) =>
                    item.id === noteModal.noteId
                      ? {
                          ...item,
                          category: noteModal.category,
                          color: noteModal.color,
                          content
                        }
                      : item
                  )
                );
              } else {
                const newNote: CanvasStickyNote = {
                  id: `sn_${
                    typeof crypto !== 'undefined' && crypto.randomUUID
                      ? crypto.randomUUID()
                      : Date.now()
                  }`,
                  category: noteModal.category,
                  content,
                  author: currentUser.name,
                  authorUid: currentUid,
                  authorProfileImage: currentUser.profileImage || currentUser.photoURL || '',
                  color: noteModal.color,
                  reactions: [],
                  position: defaultMindmapPosition(stickyNotes.length)
                };
                setStickyNotes((prev) => [newNote, ...prev]);
                addAuditLog(
                  'Sticky Note posted',
                  `${currentUser.name} posted sticky note in ${newNote.category}.`,
                  'sticky'
                );
              }
              markDirty();
              setNoteModal(null);
            }}
          >
            <button type="button" className="close-modal" onClick={() => setNoteModal(null)}>
              ×
            </button>
            <h2>{noteModal.mode === 'edit' ? 'Edit idea' : 'Add an idea'}</h2>
            <p className="modal-copy">
              {noteModal.mode === 'edit'
                ? 'Update this idea type, card color, or content.'
                : 'Capture a thought and place it on the board. You can move and connect it any time.'}
            </p>
            <label>
              Idea type
              <div className="input-with-icon">
                <span className="input-icon-svg">
                  <SvgIcon name="lightbulb" width={16} height={16} />
                </span>
                <select
                  value={noteModal.category}
                  onChange={(event) =>
                    setNoteModal((prev) =>
                      prev ? { ...prev, category: event.target.value } : prev
                    )
                  }
                >
                  {['Ideas', 'Blockers', 'Goals', 'Wins'].map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </label>
            <label>
              Card color
              <select
                value={noteModal.color}
                onChange={(event) =>
                  setNoteModal((prev) => (prev ? { ...prev, color: event.target.value } : prev))
                }
              >
                <option value="yellow">Warm Yellow</option>
                <option value="green">Mint Green</option>
                <option value="rose">Rose Coral</option>
                <option value="blue">Sky Blue</option>
              </select>
            </label>
            <label>
              Note Content
              <textarea
                rows={3}
                required
                autoFocus
                placeholder="What is on your mind?"
                value={noteModal.content}
                onChange={(event) =>
                  setNoteModal((prev) =>
                    prev ? { ...prev, content: event.target.value } : prev
                  )
                }
              />
            </label>
            <button type="submit" className="primary-button full gold">
              {noteModal.mode === 'edit' ? 'Save changes' : 'Add to board'}
            </button>
          </form>
        </div>
      )}
    </section>
  );
};
