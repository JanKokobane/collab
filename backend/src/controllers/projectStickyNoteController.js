const { randomUUID } = require('node:crypto');
const { pool } = require('../config/db');

const allowedColors = new Set(['yellow', 'pink', 'blue', 'green']);
const maxContentLength = 2000;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const getAccessibleProject = async (client, projectId, firebaseUid) => {
    const result = await client.query(
        `
            SELECT project_id, name
            FROM projects p
            WHERE p.project_id = $1
              AND (
                    p.creator_firebase_uid = $2
                    OR EXISTS (
                        SELECT 1
                        FROM project_invitations invitation
                        WHERE invitation.project_id = p.project_id
                          AND invitation.invited_firebase_uid = $2
                          AND invitation.status = 'accepted'
                    )
              )
            LIMIT 1
        `,
        [projectId, firebaseUid]
    );
    return result.rows[0] || null;
};

const hasNoteAccess = async (client, projectId, noteId, firebaseUid) => {
    if (!uuidPattern.test(noteId)) return null;
    const result = await client.query(
        `
            SELECT note.note_id, note.project_id, note.created_by_firebase_uid,
                   note.content, note.color, note.position_x, note.position_y
            FROM project_sticky_notes note
            WHERE note.note_id = $1
              AND note.project_id = $2
              AND (
                    note.created_by_firebase_uid = $3
                    OR EXISTS (
                        SELECT 1
                        FROM project_sticky_note_recipients recipient
                        WHERE recipient.note_id = note.note_id
                          AND recipient.firebase_uid = $3
                    )
              )
        `,
        [noteId, projectId, firebaseUid]
    );
    return result.rows[0] || null;
};

const getProjectStickyNotes = async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const project = await getAccessibleProject(client, req.params.projectId, req.firebaseUid);
        if (!project) {
            return res.status(404).json({
                success: false,
                code: 'PROJECT_NOT_FOUND',
                message: 'Project not found.'
            });
        }

        const result = await client.query(
            `
                SELECT
                    note.note_id,
                    note.project_id,
                    note.created_by_firebase_uid,
                    COALESCE(NULLIF(author.full_name, ''), 'Project member') AS author_name,
                    author.profile_image AS author_profile_image,
                    note.content,
                    note.color,
                    note.position_x,
                    note.position_y,
                    note.created_at,
                    note.updated_at,
                    COALESCE(
                        (
                            SELECT json_agg(json_build_object(
                                'firebaseUid', recipient.firebase_uid,
                                'name', COALESCE(NULLIF(profile.full_name, ''), 'Project member'),
                                'profileImage', profile.profile_image
                            ) ORDER BY profile.full_name)
                            FROM project_sticky_note_recipients recipient
                            LEFT JOIN user_profiles profile
                              ON profile.firebase_uid = recipient.firebase_uid
                            WHERE recipient.note_id = note.note_id
                        ),
                        '[]'::json
                    ) AS recipients
                FROM project_sticky_notes note
                LEFT JOIN user_profiles author
                  ON author.firebase_uid = note.created_by_firebase_uid
                WHERE note.project_id = $1
                  AND (
                        note.created_by_firebase_uid = $2
                        OR EXISTS (
                            SELECT 1
                            FROM project_sticky_note_recipients recipient
                            WHERE recipient.note_id = note.note_id
                              AND recipient.firebase_uid = $2
                        )
                  )
                ORDER BY note.created_at
            `,
            [project.project_id, req.firebaseUid]
        );
        return res.status(200).json({
            success: true,
            data: { notes: result.rows }
        });
    } catch (error) {
        console.error('Get project sticky notes error:', error);
        return res.status(500).json({
            success: false,
            code: 'PROJECT_STICKY_NOTES_FETCH_FAILED',
            message: 'Project sticky notes could not be retrieved.'
        });
    } finally {
        client?.release();
    }
};

const createProjectStickyNote = async (req, res) => {
    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
    const color = typeof req.body?.color === 'string' ? req.body.color : 'yellow';
    const position = req.body?.position;
    const requestedRecipients = req.body?.recipientFirebaseUids;
    if (!content || content.length > maxContentLength || !allowedColors.has(color) ||
        !Array.isArray(requestedRecipients) || requestedRecipients.length > 50 ||
        requestedRecipients.some(uid => typeof uid !== 'string' || !uid.trim() || uid.length > 128) ||
        (position !== undefined && (
            !position || !Number.isFinite(position.x) || !Number.isFinite(position.y) ||
            position.x < 0 || position.x > 1 || position.y < 0 || position.y > 1
        ))) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_PROJECT_STICKY_NOTE',
            message: 'Sticky note text, color, or tagged members are invalid.'
        });
    }

    const recipientUids = [...new Set(requestedRecipients.map(uid => uid.trim()))]
        .filter(uid => uid !== req.firebaseUid);
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        const project = await getAccessibleProject(client, req.params.projectId, req.firebaseUid);
        if (!project) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                code: 'PROJECT_NOT_FOUND',
                message: 'Project not found.'
            });
        }

        if (recipientUids.length) {
            const eligible = await client.query(
                `
                    SELECT invited_firebase_uid AS firebase_uid
                    FROM project_invitations
                    WHERE project_id = $1
                      AND status = 'accepted'
                      AND invited_firebase_uid = ANY($2::text[])
                    UNION
                    SELECT creator_firebase_uid
                    FROM projects
                    WHERE project_id = $1
                      AND creator_firebase_uid = ANY($2::text[])
                `,
                [project.project_id, recipientUids]
            );
            const eligibleUids = new Set(eligible.rows.map(row => row.firebase_uid));
            if (recipientUids.some(uid => !eligibleUids.has(uid))) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    success: false,
                    code: 'INVALID_STICKY_NOTE_RECIPIENT',
                    message: 'Tagged members must be accepted members of this project.'
                });
            }
        }

        const noteId = randomUUID();
        const noteResult = await client.query(
            `
                INSERT INTO project_sticky_notes (
                    note_id, project_id, created_by_firebase_uid, content, color, position_x, position_y
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING note_id, project_id, created_by_firebase_uid, content, color,
                          position_x, position_y, created_at, updated_at
            `,
            [
                noteId,
                project.project_id,
                req.firebaseUid,
                content,
                color,
                position?.x ?? 0.08,
                position?.y ?? 0.12
            ]
        );
        const creator = await client.query(
            `
                SELECT
                    COALESCE(NULLIF(full_name, ''), email, 'A project member') AS name,
                    profile_image
                FROM user_profiles
                WHERE firebase_uid = $1
            `,
            [req.firebaseUid]
        );
        if (recipientUids.length) {
            await client.query(
                `
                    INSERT INTO project_sticky_note_recipients (note_id, firebase_uid)
                    SELECT $1, member_uid
                    FROM unnest($2::text[]) AS member_uid
                `,
                [noteId, recipientUids]
            );
            const creatorName = creator.rows[0]?.name || 'A project member'
            await client.query(
                `
                    INSERT INTO notifications (
                        recipient_firebase_uid, project_id, type, title, detail, avatar, tone_class
                    )
                    SELECT
                        member_uid,
                        $1,
                        'project_sticky_note_tagged',
                        'You were tagged in a project note',
                        $2,
                        '📝',
                        'yellow-bg'
                    FROM unnest($3::text[]) AS member_uid
                `,
                [
                    project.project_id,
                    `${creatorName} tagged you in a note in "${project.name}".`,
                    recipientUids
                ]
            );
        }
        await client.query('COMMIT');
        return res.status(201).json({
            success: true,
            data: {
                note: {
                    ...noteResult.rows[0],
                    author_name: 'You',
                    author_profile_image: creator.rows[0]?.profile_image || '',
                    recipients: recipientUids.map(firebaseUid => ({ firebaseUid }))
                }
            }
        });
    } catch (error) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        console.error('Create project sticky note error:', error);
        return res.status(500).json({
            success: false,
            code: 'PROJECT_STICKY_NOTE_CREATE_FAILED',
            message: 'The project sticky note could not be created.'
        });
    } finally {
        client?.release();
    }
};

const updateProjectStickyNote = async (req, res) => {
    if (!uuidPattern.test(req.params.noteId)) {
        return res.status(404).json({
            success: false,
            code: 'PROJECT_STICKY_NOTE_NOT_FOUND',
            message: 'Sticky note not found.'
        });
    }
    const { content, color, position } = req.body || {};
    const cleanContent = typeof content === 'string' ? content.trim() : undefined;
    if (
        (content !== undefined && (!cleanContent || cleanContent.length > maxContentLength)) ||
        (color !== undefined && !allowedColors.has(color)) ||
        (position !== undefined && (
            !position || !Number.isFinite(position.x) || !Number.isFinite(position.y) ||
            position.x < 0 || position.x > 1 || position.y < 0 || position.y > 1
        )) ||
        (content === undefined && color === undefined && position === undefined)
    ) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_PROJECT_STICKY_NOTE_UPDATE',
            message: 'The sticky note changes are invalid.'
        });
    }

    let client;
    try {
        client = await pool.connect();
        const project = await getAccessibleProject(client, req.params.projectId, req.firebaseUid);
        if (!project) {
            return res.status(404).json({
                success: false,
                code: 'PROJECT_NOT_FOUND',
                message: 'Project not found.'
            });
        }
        const note = await hasNoteAccess(client, project.project_id, req.params.noteId, req.firebaseUid);
        if (!note) {
            return res.status(404).json({
                success: false,
                code: 'PROJECT_STICKY_NOTE_NOT_FOUND',
                message: 'Sticky note not found.'
            });
        }
        if ((content !== undefined || color !== undefined) &&
            note.created_by_firebase_uid !== req.firebaseUid) {
            return res.status(403).json({
                success: false,
                code: 'PROJECT_STICKY_NOTE_EDIT_FORBIDDEN',
                message: 'Only the note creator can edit its text or color.'
            });
        }

        const result = await client.query(
            `
                UPDATE project_sticky_notes
                SET content = COALESCE($1, content),
                    color = COALESCE($2, color),
                    position_x = COALESCE($3, position_x),
                    position_y = COALESCE($4, position_y),
                    updated_at = NOW()
                WHERE note_id = $5
                RETURNING note_id, project_id, created_by_firebase_uid, content, color,
                          position_x, position_y, created_at, updated_at
            `,
            [
                cleanContent ?? null,
                color ?? null,
                position?.x ?? null,
                position?.y ?? null,
                note.note_id
            ]
        );
        return res.status(200).json({
            success: true,
            data: { note: result.rows[0] }
        });
    } catch (error) {
        console.error('Update project sticky note error:', error);
        return res.status(500).json({
            success: false,
            code: 'PROJECT_STICKY_NOTE_UPDATE_FAILED',
            message: 'The project sticky note could not be updated.'
        });
    } finally {
        client?.release();
    }
};

const deleteProjectStickyNote = async (req, res) => {
    if (!uuidPattern.test(req.params.noteId)) {
        return res.status(404).json({
            success: false,
            code: 'PROJECT_STICKY_NOTE_NOT_FOUND',
            message: 'Sticky note not found.'
        });
    }
    let client;
    try {
        client = await pool.connect();
        const project = await getAccessibleProject(client, req.params.projectId, req.firebaseUid);
        if (!project) {
            return res.status(404).json({
                success: false,
                code: 'PROJECT_NOT_FOUND',
                message: 'Project not found.'
            });
        }
        const result = await client.query(
            `
                DELETE FROM project_sticky_notes
                WHERE note_id = $1
                  AND project_id = $2
                  AND created_by_firebase_uid = $3
                RETURNING note_id
            `,
            [req.params.noteId, project.project_id, req.firebaseUid]
        );
        if (!result.rowCount) {
            return res.status(404).json({
                success: false,
                code: 'PROJECT_STICKY_NOTE_NOT_FOUND',
                message: 'Sticky note not found or you are not its creator.'
            });
        }
        return res.status(200).json({ success: true, data: { noteId: result.rows[0].note_id } });
    } catch (error) {
        console.error('Delete project sticky note error:', error);
        return res.status(500).json({
            success: false,
            code: 'PROJECT_STICKY_NOTE_DELETE_FAILED',
            message: 'The project sticky note could not be deleted.'
        });
    } finally {
        client?.release();
    }
};

module.exports = {
    createProjectStickyNote,
    deleteProjectStickyNote,
    getProjectStickyNotes,
    updateProjectStickyNote
};
