import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getAvatarSource, getUserInitials, useDashboard } from '../../context/DashboardContext';
import { api } from '../../services/api';
import type { Project, ProjectStickyNote } from '../../types/dashboard';
import { createCx } from '../../utils/cx';
import { SvgIcon } from '../../utils/icons';
import styles from './ProjectStickyNotes.module.css';

const cx = createCx(styles);

type NoteColor = 'yellow' | 'pink' | 'blue' | 'green';

const COLOR_OPTIONS: Array<[NoteColor, string]> = [
  ['yellow', 'Yellow'],
  ['pink', 'Pink'],
  ['blue', 'Blue'],
  ['green', 'Green']
];

function normalizeStickyNote(note: any): ProjectStickyNote {
  const authorName =
    [note.author_name, note.authorName].find(
      (name) =>
        typeof name === 'string' &&
        name.trim() &&
        !['project member', 'a project member'].includes(name.trim().toLowerCase())
    ) || '';

  return {
    id: note.note_id || note.noteId || note.id || '',
    projectId: note.project_id || note.projectId || '',
    authorUid: note.created_by_firebase_uid || note.createdByFirebaseUid || note.authorUid || '',
    authorName,
    authorProfileImage: note.author_profile_image || note.authorProfileImage || '',
    content: note.content || '',
    color: (note.color || 'yellow') as NoteColor,
    x: Number(note.position_x ?? note.positionX ?? 0.08),
    y: Number(note.position_y ?? note.positionY ?? 0.12),
    recipients: Array.isArray(note.recipients) ? note.recipients : []
  };
}

export const ProjectStickyNotes: React.FC = () => {
  const { activeView, currentUser, projects, stickyNotesRevision, showDashboardToast } =
    useDashboard();

  const uidKey = currentUser?.uid || 'anonymous';
  const hiddenStorageKey = `collab-hidden-sticky-notes:${uidKey}`;
  const lastViewedStorageKey = `collab-sticky-notes-project:${uidKey}`;

  const [lastViewedProjectId, setLastViewedProjectId] = useState<string>(() => {
    try {
      return localStorage.getItem(lastViewedStorageKey) || '';
    } catch {
      return '';
    }
  });

  const [hiddenNoteIds, setHiddenNoteIds] = useState<Set<string>>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(hiddenStorageKey) || '[]');
      return new Set(Array.isArray(stored) ? stored.filter((id) => typeof id === 'string') : []);
    } catch {
      return new Set();
    }
  });

  const [notes, setNotes] = useState<ProjectStickyNote[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragPixels, setDragPixels] = useState<Record<string, { left: number; top: number }>>({});
  const [layerSize, setLayerSize] = useState<{ width: number; height: number }>({
    width: 1200,
    height: 800
  });

  // Create / Edit Sticky Note Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<ProjectStickyNote | null>(null);
  const [noteContent, setNoteContent] = useState('');
  const [noteColor, setNoteColor] = useState<NoteColor>('yellow');
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const layerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const loadVersionRef = useRef(0);
  const dragRef = useRef<{
    note: ProjectStickyNote;
    card: HTMLElement;
    pointerId: number;
    offsetX: number;
    offsetY: number;
    left: number;
    top: number;
  } | null>(null);

  // Re-load stored hidden prefs when user changes
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(hiddenStorageKey) || '[]');
      setHiddenNoteIds(
        new Set(Array.isArray(stored) ? stored.filter((id) => typeof id === 'string') : [])
      );
      setLastViewedProjectId(localStorage.getItem(lastViewedStorageKey) || '');
    } catch {
      setHiddenNoteIds(new Set());
    }
  }, [hiddenStorageKey, lastViewedStorageKey]);

  const activeStickyProject: Project | null = useMemo(() => {
    const viewProject = projects.find((p) => p.name === activeView && p.projectId);
    if (viewProject) return viewProject;
    return projects.find((p) => p.projectId === lastViewedProjectId) || projects[0] || null;
  }, [projects, activeView, lastViewedProjectId]);

  const activeProjectId = activeStickyProject?.projectId || '';

  useEffect(() => {
    if (activeProjectId) {
      setLastViewedProjectId(activeProjectId);
      try {
        localStorage.setItem(lastViewedStorageKey, activeProjectId);
      } catch {
        // ignore storage errors
      }
    }
  }, [activeProjectId, lastViewedStorageKey]);

  // Observe viewport size to clamp floating sticky notes
  useEffect(() => {
    const updateSize = () => {
      if (layerRef.current) {
        setLayerSize({
          width: layerRef.current.clientWidth || window.innerWidth,
          height: layerRef.current.clientHeight || window.innerHeight
        });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [activeProjectId]);

  const fetchNotes = useCallback(
    async (projectId: string, silent = false) => {
      if (!projectId) {
        setNotes([]);
        return;
      }
      const reqVersion = ++loadVersionRef.current;
      try {
        const response = await api.get(`/projects/${encodeURIComponent(projectId)}/sticky-notes`);
        if (reqVersion !== loadVersionRef.current) return;
        const rawNotes = response?.data?.notes;
        if (!Array.isArray(rawNotes)) {
          throw new Error('The server returned an invalid sticky notes response.');
        }
        setNotes(rawNotes.map(normalizeStickyNote));
      } catch (error: any) {
        if (!silent && reqVersion === loadVersionRef.current) {
          console.error('Unable to load project sticky notes:', error);
          showDashboardToast(
            error?.message || 'Project sticky notes could not be loaded.',
            'error'
          );
        }
      }
    },
    [showDashboardToast]
  );

  useEffect(() => {
    if (!activeProjectId) {
      setNotes([]);
      return;
    }
    setNotes([]);
    fetchNotes(activeProjectId, false);
  }, [activeProjectId, stickyNotesRevision, fetchNotes]);

  useEffect(() => {
    if (!activeProjectId) return;
    const timer = window.setInterval(() => {
      if (document.hidden || dragRef.current) return;
      fetchNotes(activeProjectId, true);
    }, 10000);
    return () => window.clearInterval(timer);
  }, [activeProjectId, fetchNotes]);

  const openModalForNote = useCallback((noteToEdit: ProjectStickyNote | null = null) => {
    setEditingNote(noteToEdit);
    setNoteContent(noteToEdit?.content || '');
    setNoteColor((noteToEdit?.color as NoteColor) || 'yellow');
    setSelectedRecipients([]);
    setSubmitting(false);
    setModalOpen(true);
    window.setTimeout(() => {
      textareaRef.current?.focus();
    }, 20);
  }, []);

  useEffect(() => {
    const handleOpenEvent = () => {
      if (activeStickyProject) {
        openModalForNote(null);
      }
    };
    window.addEventListener('collab-open-project-sticky-note', handleOpenEvent);
    return () => window.removeEventListener('collab-open-project-sticky-note', handleOpenEvent);
  }, [activeStickyProject, openModalForNote]);

  const getNoteAuthorName = (note: ProjectStickyNote): string => {
    if (note.authorName && !note.authorName.includes('@')) return note.authorName;
    if (note.authorUid === currentUser?.uid && currentUser?.name) return currentUser.name;
    const project = projects.find((item) => item.projectId === note.projectId);
    const allMembers = project
      ? [
          {
            firebaseUid: project.creatorFirebaseUid || undefined,
            name: project.creatorName,
            email: project.creatorEmail
          },
          ...(Array.isArray(project.acceptedMembers) ? project.acceptedMembers : [])
        ]
      : [];
    const author = allMembers.find(
      (member) => (member.firebaseUid || (member as any).firebase_uid) === note.authorUid
    );
    return author?.name || author?.email || note.authorName || 'Project member';
  };

  const projectRecipients = useMemo(() => {
    if (!activeStickyProject) return [];
    const people = [
      {
        firebaseUid: activeStickyProject.creatorFirebaseUid || '',
        name: activeStickyProject.creatorName || 'Project creator',
        initials: activeStickyProject.creatorInitials,
        profileImage: activeStickyProject.creatorProfileImage
      },
      ...(Array.isArray(activeStickyProject.acceptedMembers)
        ? activeStickyProject.acceptedMembers
        : [])
    ];
    const byUid = new Map<
      string,
      { firebaseUid: string; name: string; initials?: string; profileImage?: string }
    >();
    people.forEach((person) => {
      const uid = String(person.firebaseUid || (person as any).firebase_uid || '').trim();
      if (uid && uid !== currentUser?.uid) {
        byUid.set(uid, {
          firebaseUid: uid,
          name: person.name || (person as any).email || 'Project member',
          initials: person.initials,
          profileImage: person.profileImage || (person as any).profile_image || ''
        });
      }
    });
    return [...byUid.values()];
  }, [activeStickyProject, currentUser?.uid]);

  const hideNoteLocally = (noteId: string) => {
    setHiddenNoteIds((prev) => {
      const next = new Set(prev);
      next.add(noteId);
      try {
        localStorage.setItem(hiddenStorageKey, JSON.stringify([...next]));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const handlePointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    note: ProjectStickyNote
  ) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
    const card = (event.currentTarget as HTMLElement).closest('article');
    if (!card || !layerRef.current) return;
    const bounds = card.getBoundingClientRect();
    dragRef.current = {
      note,
      card,
      pointerId: event.pointerId,
      offsetX: event.clientX - bounds.left,
      offsetY: event.clientY - bounds.top,
      left: card.offsetLeft,
      top: card.offsetTop
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingId(note.id);
    event.preventDefault();
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !layerRef.current) return;
    const layerBounds = layerRef.current.getBoundingClientRect();
    const nextX = event.clientX - layerBounds.left - drag.offsetX;
    const nextY = event.clientY - layerBounds.top - drag.offsetY;
    const clampedLeft = Math.max(
      0,
      Math.min(layerRef.current.clientWidth - drag.card.offsetWidth, nextX)
    );
    const clampedTop = Math.max(
      0,
      Math.min(layerRef.current.clientHeight - drag.card.offsetHeight, nextY)
    );
    drag.left = clampedLeft;
    drag.top = clampedTop;
    setDragPixels((prev) => ({
      ...prev,
      [drag.note.id]: { left: clampedLeft, top: clampedTop }
    }));
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !layerRef.current) return;
    dragRef.current = null;
    setDraggingId(null);

    const width = Math.max(1, layerRef.current.clientWidth);
    const height = Math.max(1, layerRef.current.clientHeight);
    const normX = Math.min(1, Math.max(0, drag.left / width));
    const normY = Math.min(1, Math.max(0, drag.top / height));

    setNotes((prev) =>
      prev.map((item) => (item.id === drag.note.id ? { ...item, x: normX, y: normY } : item))
    );
    setDragPixels((prev) => {
      const next = { ...prev };
      delete next[drag.note.id];
      return next;
    });

    api
      .put(
        `/projects/${encodeURIComponent(drag.note.projectId)}/sticky-notes/${encodeURIComponent(drag.note.id)}`,
        { position: { x: normX, y: normY } }
      )
      .catch((error: any) => {
        console.error('Unable to save sticky note position:', error);
        showDashboardToast(
          error?.message || 'The sticky note position could not be saved.',
          'error'
        );
      });
  };

  const handleSubmitNote = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeStickyProject || !noteContent.trim()) return;
    setSubmitting(true);
    try {
      const basePath = `/projects/${encodeURIComponent(activeStickyProject.projectId)}/sticky-notes`;
      const response = editingNote
        ? await api.put(`${basePath}/${encodeURIComponent(editingNote.id)}`, {
            content: noteContent.trim(),
            color: noteColor
          })
        : await api.post(basePath, {
            content: noteContent.trim(),
            color: noteColor,
            recipientFirebaseUids: selectedRecipients,
            position: {
              x: Math.min(0.72, 0.06 + (notes.length % 3) * 0.22),
              y: Math.min(0.76, 0.08 + Math.floor(notes.length / 3) * 0.2)
            }
          });
      if (!response?.data?.note) {
        throw new Error('The server did not return the saved sticky note.');
      }

      if (editingNote) {
        setNotes((prev) =>
          prev.map((n) =>
            n.id === editingNote.id
              ? {
                  ...n,
                  content: response.data.note.content,
                  color: response.data.note.color
                }
              : n
          )
        );
      } else {
        const normalized = normalizeStickyNote({
          ...response.data.note,
          author_name: response.data.note.author_name || currentUser?.name || 'You',
          author_profile_image: currentUser?.profileImage || currentUser?.photoURL || '',
          recipients: selectedRecipients.map((firebaseUid) => ({
            firebaseUid,
            name:
              projectRecipients.find((m) => m.firebaseUid === firebaseUid)?.name ||
              'Project member'
          }))
        });
        setNotes((prev) => [...prev, normalized]);
      }

      setModalOpen(false);
      showDashboardToast(
        editingNote
          ? 'Sticky note updated.'
          : selectedRecipients.length
            ? 'Sticky note shared with project members.'
            : 'Private sticky note created.',
        'success'
      );
    } catch (error: any) {
      showDashboardToast(
        error?.message || `The sticky note could not be ${editingNote ? 'updated' : 'created'}.`,
        'error'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const visibleNotes = notes.filter((note) => !hiddenNoteIds.has(note.id));

  return (
    <>
      <div
        ref={layerRef}
        id="project-sticky-note-layer"
        className={cx('project-sticky-note-layer')}
        hidden={!activeStickyProject}
      >
        {visibleNotes.map((note) => {
          const authorName = getNoteAuthorName(note);
          const authorAvatarSrc = String(note.authorProfileImage || '');
          const estimatedCardW = Math.min(260, Math.max(180, layerSize.width - 24));
          const estimatedCardH = 155;
          const maxXRatio = Math.max(0, layerSize.width - estimatedCardW) / Math.max(1, layerSize.width);
          const maxYRatio = Math.max(0, layerSize.height - estimatedCardH) / Math.max(1, layerSize.height);
          const pxPos = dragPixels[note.id];
          const leftPx = pxPos ? pxPos.left : Math.min(Number(note.x) || 0, maxXRatio) * layerSize.width;
          const topPx = pxPos ? pxPos.top : Math.min(Number(note.y) || 0, maxYRatio) * layerSize.height;

          return (
            <article
              key={note.id}
              data-note-id={note.id}
              aria-label={`Sticky note by ${authorName}`}
              className={cx('project-sticky-note', note.color, {
                'is-dragging': draggingId === note.id
              })}
              style={{ left: `${leftPx}px`, top: `${topPx}px` }}
            >
              <div
                className={cx('project-sticky-note-handle')}
                onPointerDown={(e) => handlePointerDown(e, note)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerEnd}
                onPointerCancel={handlePointerEnd}
              >
                <span className={cx('project-sticky-note-author-avatar')}>
                  {authorAvatarSrc ? (
                    <img
                      src={authorAvatarSrc}
                      alt={authorName}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        borderRadius: '50%'
                      }}
                    />
                  ) : (
                    <span className="avatar coral-bg" style={{ width: '100%', height: '100%' }}>
                      {getUserInitials(authorName)}
                    </span>
                  )}
                </span>
                <span className={cx('project-sticky-note-grip')}>
                  <SvgIcon name="dots" width={15} height={15} />
                </span>
                <span>{authorName}</span>

                {note.authorUid === currentUser?.uid && (
                  <button
                    type="button"
                    className={cx('project-sticky-note-edit')}
                    onClick={() => openModalForNote(note)}
                  >
                    Edit
                  </button>
                )}

                <button
                  type="button"
                  className={cx('project-sticky-note-delete')}
                  aria-label="Delete sticky note from your view"
                  title="Delete this note from your view only"
                  onClick={() => hideNoteLocally(note.id)}
                >
                  ×
                </button>
              </div>
              <p className={cx('project-sticky-note-content')}>{note.content}</p>
            </article>
          );
        })}
      </div>

      {modalOpen && activeStickyProject && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
        >
          <form
            className={`modal messages-create-modal ${cx('project-sticky-note-modal')}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="project-sticky-note-title"
            onSubmit={handleSubmitNote}
          >
            <header className="messages-create-header">
              <span className="messages-create-eyebrow">PROJECT NOTES</span>
              <h2 id="project-sticky-note-title">
                {editingNote ? 'Edit Sticky Note' : 'New Sticky Note'}
              </h2>
              <p className="modal-copy">
                {editingNote
                  ? 'Update this note on the project board.'
                  : 'Place a movable note on this project’s board.'}
              </p>
              <button
                type="button"
                className="close-modal"
                aria-label="Close dialog"
                onClick={() => setModalOpen(false)}
              >
                ×
              </button>
            </header>

            <p className={cx('project-sticky-note-project')}>{activeStickyProject.name}</p>

            <label className="messages-create-label">
              Note
              <textarea
                ref={textareaRef}
                rows={5}
                maxLength={2000}
                required
                className="no-input-icon"
                placeholder="Write a reminder, checklist, or quick note…"
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
              />
            </label>

            <label className="messages-create-label">
              Color
              <div className={cx('project-sticky-color-picker')}>
                {COLOR_OPTIONS.map(([color, label]) => (
                  <button
                    key={color}
                    type="button"
                    className={cx('project-sticky-color-option', color, {
                      selected: noteColor === color
                    })}
                    aria-label={`${label} note`}
                    aria-pressed={noteColor === color}
                    onClick={() => setNoteColor(color)}
                  />
                ))}
              </div>
            </label>

            {!editingNote && (
              <div className={cx('project-sticky-sharing')}>
                <p className="messages-create-label">Share with project members</p>
                <p className={cx('project-sticky-share-help')}>
                  Leave everyone unchecked to keep this note private to you. Tagged members will
                  be notified.
                </p>
                <div className={`messages-member-list ${cx('project-sticky-recipient-list')}`}>
                  {!projectRecipients.length ? (
                    <p className="messages-list-empty">
                      No other accepted project members are available.
                    </p>
                  ) : (
                    projectRecipients.map((member) => {
                      const isChecked = selectedRecipients.includes(member.firebaseUid);
                      const avatarSrc = getAvatarSource(member);
                      return (
                        <label
                          key={member.firebaseUid}
                          className={`messages-member-option project-sticky-recipient${
                            isChecked ? ' selected' : ''
                          }`}
                        >
                          <input
                            type="checkbox"
                            value={member.firebaseUid}
                            checked={isChecked}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setSelectedRecipients((prev) =>
                                checked
                                  ? [...prev, member.firebaseUid]
                                  : prev.filter((id) => id !== member.firebaseUid)
                              );
                            }}
                          />
                          <span className="messages-create-avatar">
                            {avatarSrc ? (
                              <img
                                src={avatarSrc}
                                alt={member.name}
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  objectFit: 'cover',
                                  borderRadius: '50%'
                                }}
                              />
                            ) : (
                              member.initials || getUserInitials(member.name)
                            )}
                          </span>
                          <span>{member.name}</span>
                          <small>Project member</small>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="primary-button full gold messages-create-submit"
            >
              {submitting
                ? editingNote
                  ? 'Saving…'
                  : 'Creating…'
                : editingNote
                  ? 'Save Changes'
                  : 'Create Sticky Note'}
            </button>
          </form>
        </div>
      )}
    </>
  );
};
