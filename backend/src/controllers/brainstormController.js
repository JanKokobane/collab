const { randomUUID } = require('node:crypto');
const { pool } = require('../config/db');

const boardDataIsValid = value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    if (!Array.isArray(value.notes) || !Array.isArray(value.links)) return false;
    if (value.notes.length > 500 || value.links.length > 1000) return false;

    const noteIds = new Set();
    for (const note of value.notes) {
        if (
            !note || typeof note !== 'object' ||
            typeof note.id !== 'string' || !note.id || note.id.length > 100 ||
            noteIds.has(note.id) ||
            !['Ideas', 'Blockers', 'Goals', 'Wins'].includes(note.category) ||
            typeof note.content !== 'string' || !note.content.trim() || note.content.length > 5000 ||
            !['yellow', 'green', 'rose', 'blue'].includes(note.color) ||
            !note.position || !Number.isFinite(note.position.x) || !Number.isFinite(note.position.y) ||
            Math.abs(note.position.x) > 10000 || Math.abs(note.position.y) > 10000
        ) return false;
        if (
            (note.author !== undefined &&
                (typeof note.author !== 'string' || note.author.length > 120)) ||
            (note.authorUid !== undefined &&
                (typeof note.authorUid !== 'string' || !note.authorUid || note.authorUid.length > 128)) ||
            (note.upvotedBy !== undefined &&
                (!Array.isArray(note.upvotedBy) ||
                    note.upvotedBy.length > 1000 ||
                    note.upvotedBy.some(uid => typeof uid !== 'string' || !uid || uid.length > 128) ||
                    new Set(note.upvotedBy).size !== note.upvotedBy.length))
        ) return false;
        noteIds.add(note.id);
    }

    const linkIds = new Set();
    for (const link of value.links) {
        if (
            !link || typeof link !== 'object' ||
            typeof link.id !== 'string' || !link.id || link.id.length > 100 ||
            linkIds.has(link.id) ||
            !noteIds.has(link.from) || !noteIds.has(link.to) || link.from === link.to ||
            !['related', 'leads-to', 'supports', 'sequence'].includes(link.type)
        ) return false;
        linkIds.add(link.id);
    }
    return true;
};

const getAccessibleProject = async (client, projectId, firebaseUid) => {
    const result = await client.query(
        `
            SELECT project_id, name, creator_firebase_uid, creator_name
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

const getProjectBoards = async (req, res) => {
    try {
        const client = await pool.connect();
        try {
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
                        board.board_id,
                        board.project_id,
                        board.title,
                        board.created_by_firebase_uid,
                        board.created_at,
                        board.updated_at,
                        creator.full_name AS creator_name
                    FROM brainstorm_boards board
                    JOIN brainstorm_board_members membership
                      ON membership.board_id = board.board_id
                     AND membership.firebase_uid = $2
                    LEFT JOIN user_profiles creator
                      ON creator.firebase_uid = board.created_by_firebase_uid
                    WHERE board.project_id = $1
                    ORDER BY board.updated_at DESC
                `,
                [project.project_id, req.firebaseUid]
            );
            return res.status(200).json({
                success: true,
                data: { boards: result.rows }
            });
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Get project brainstorm boards error:', error);
        return res.status(500).json({
            success: false,
            code: 'BRAINSTORM_BOARDS_FETCH_FAILED',
            message: 'Brainstorm boards could not be retrieved.'
        });
    }
};

const createProjectBoard = async (req, res) => {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const requestedMembers = req.body?.memberFirebaseUids;
    if (
        !title || title.length > 160 ||
        !Array.isArray(requestedMembers) ||
        requestedMembers.length > 100 ||
        requestedMembers.some(uid => typeof uid !== 'string' || !uid || uid.length > 128) ||
        requestedMembers.includes(req.firebaseUid) ||
        new Set(requestedMembers).size !== requestedMembers.length
    ) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_BRAINSTORM_BOARD',
            message: 'Provide a board title and valid, unique project member IDs.'
        });
    }

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

        const validMembers = await client.query(
            `
                SELECT invited_firebase_uid
                FROM project_invitations
                WHERE project_id = $1
                  AND status = 'accepted'
                  AND invited_firebase_uid = ANY($2::text[])
            `,
            [project.project_id, requestedMembers]
        );
        const validUids = new Set(validMembers.rows.map(row => row.invited_firebase_uid));
        const invalidUid = requestedMembers.find(uid => uid !== project.creator_firebase_uid && !validUids.has(uid));
        if (invalidUid) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                code: 'INVALID_BRAINSTORM_BOARD_MEMBER',
                message: 'Only accepted members of the selected project can be invited.'
            });
        }

        const boardId = randomUUID();
        const createdBoard = await client.query(
            `
                INSERT INTO brainstorm_boards (board_id, project_id, title, created_by_firebase_uid)
                VALUES ($1, $2, $3, $4)
                RETURNING board_id, project_id, title, created_by_firebase_uid, board_data, created_at, updated_at
            `,
            [boardId, project.project_id, title, req.firebaseUid]
        );
        const memberUids = [...new Set([req.firebaseUid, ...requestedMembers])];
        await client.query(
            `
                INSERT INTO brainstorm_board_members (board_id, firebase_uid, invited_by_firebase_uid)
                SELECT $1, member_uid, $2
                FROM unnest($3::text[]) AS member_uid
            `,
            [boardId, req.firebaseUid, memberUids]
        );
        if (requestedMembers.length) {
            const inviter = await client.query(
                `
                    SELECT COALESCE(NULLIF(full_name, ''), email, 'A project member') AS name
                    FROM user_profiles
                    WHERE firebase_uid = $1
                `,
                [req.firebaseUid]
            );
            await client.query(
                `
                    INSERT INTO notifications (
                        recipient_firebase_uid, project_id, type, title, detail, avatar, tone_class
                    )
                    SELECT
                        member_uid,
                        $1,
                        'brainstorm_board_invitation',
                        'You were invited to a brainstorm board',
                        $2,
                        '💡',
                        'teal-bg'
                    FROM unnest($3::text[]) AS member_uid
                `,
                [
                    project.project_id,
                    `${inviter.rows[0]?.name || 'A project member'} invited you to "${title}" for ${project.name}.`,
                    requestedMembers
                ]
            );
        }
        await client.query('COMMIT');
        return res.status(201).json({
            success: true,
            data: {
                board: {
                    ...createdBoard.rows[0],
                    project_name: project.name,
                    creator_name: req.firebaseUid === project.creator_firebase_uid
                        ? project.creator_name
                        : null
                },
                members: memberUids
            }
        });
    } catch (error) {
        if (client) {
            await client.query('ROLLBACK').catch(rollbackError => {
                console.error('Create brainstorm board rollback error:', rollbackError);
            });
        }
        console.error('Create brainstorm board error:', error);
        return res.status(500).json({
            success: false,
            code: 'BRAINSTORM_BOARD_CREATE_FAILED',
            message: 'The brainstorm board could not be created.'
        });
    } finally {
        client?.release();
    }
};

const inviteBoardMembers = async (req, res) => {
    const requestedMembers = req.body?.memberFirebaseUids;
    if (
        !Array.isArray(requestedMembers) ||
        !requestedMembers.length ||
        requestedMembers.length > 100 ||
        requestedMembers.some(uid => typeof uid !== 'string' || !uid || uid.length > 128) ||
        requestedMembers.includes(req.firebaseUid) ||
        new Set(requestedMembers).size !== requestedMembers.length
    ) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_BRAINSTORM_BOARD_MEMBERS',
            message: 'Select at least one valid project member to invite.'
        });
    }

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        const boardResult = await client.query(
            `
                SELECT
                    board.board_id,
                    board.project_id,
                    board.title,
                    project.name AS project_name,
                    project.creator_firebase_uid AS project_creator_firebase_uid
                FROM brainstorm_boards board
                JOIN projects project ON project.project_id = board.project_id
                WHERE board.board_id = $1
                  AND board.created_by_firebase_uid = $2
                FOR UPDATE OF board
            `,
            [req.params.boardId, req.firebaseUid]
        );
        const board = boardResult.rows[0];
        if (!board) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                code: 'BRAINSTORM_BOARD_NOT_FOUND',
                message: 'Only the board creator can invite members.'
            });
        }

        const validMembers = await client.query(
            `
                SELECT invited_firebase_uid
                FROM project_invitations
                WHERE project_id = $1
                  AND status = 'accepted'
                  AND invited_firebase_uid = ANY($2::text[])
            `,
            [board.project_id, requestedMembers]
        );
        const validUids = new Set(validMembers.rows.map(row => row.invited_firebase_uid));
        if (requestedMembers.some(uid => uid !== board.project_creator_firebase_uid && !validUids.has(uid))) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                code: 'INVALID_BRAINSTORM_BOARD_MEMBER',
                message: 'Only accepted members of the board project can be invited.'
            });
        }

        const newMembers = await client.query(
            `
                INSERT INTO brainstorm_board_members (board_id, firebase_uid, invited_by_firebase_uid)
                SELECT $1, member_uid, $2
                FROM unnest($3::text[]) AS member_uid
                ON CONFLICT (board_id, firebase_uid) DO NOTHING
                RETURNING firebase_uid
            `,
            [board.board_id, req.firebaseUid, requestedMembers]
        );
        const newUids = newMembers.rows.map(row => row.firebase_uid);
        if (newUids.length) {
            const inviter = await client.query(
                `
                    SELECT COALESCE(full_name, email, 'A project member') AS name
                    FROM user_profiles
                    WHERE firebase_uid = $1
                `,
                [req.firebaseUid]
            );
            await client.query(
                `
                    INSERT INTO notifications (
                        recipient_firebase_uid, project_id, type, title, detail, avatar, tone_class
                    )
                    SELECT
                        member_uid,
                        $1,
                        'brainstorm_board_invitation',
                        'You were invited to a brainstorm board',
                        $2,
                        '💡',
                        'teal-bg'
                    FROM unnest($3::text[]) AS member_uid
                `,
                [
                    board.project_id,
                    `${inviter.rows[0]?.name || 'A project member'} invited you to "${board.title}" for ${board.project_name}.`,
                    newUids
                ]
            );
        }
        await client.query('COMMIT');
        return res.status(200).json({
            success: true,
            data: { invitedFirebaseUids: newUids }
        });
    } catch (error) {
        if (client) {
            await client.query('ROLLBACK').catch(rollbackError => {
                console.error('Invite brainstorm board members rollback error:', rollbackError);
            });
        }
        console.error('Invite brainstorm board members error:', error);
        return res.status(500).json({
            success: false,
            code: 'BRAINSTORM_BOARD_INVITE_FAILED',
            message: 'Members could not be invited to the brainstorm board.'
        });
    } finally {
        client?.release();
    }
};

const getBoard = async (req, res) => {
    try {
        const result = await pool.query(
            `
                SELECT
                    board.board_id,
                    board.project_id,
                    project.name AS project_name,
                    board.title,
                    board.created_by_firebase_uid,
                    board.board_data,
                    board.created_at,
                    board.updated_at,
                    COALESCE((
                        SELECT json_agg(json_build_object(
                            'firebaseUid', member.firebase_uid,
                            'name', profile.full_name,
                            'profileImage', profile.profile_image
                        ) ORDER BY profile.full_name NULLS LAST)
                        FROM brainstorm_board_members member
                        LEFT JOIN user_profiles profile
                          ON profile.firebase_uid = member.firebase_uid
                        WHERE member.board_id = board.board_id
                    ), '[]'::json) AS members
                FROM brainstorm_boards board
                JOIN projects project ON project.project_id = board.project_id
                JOIN brainstorm_board_members membership
                  ON membership.board_id = board.board_id
                 AND membership.firebase_uid = $2
                WHERE board.board_id = $1
            `,
            [req.params.boardId, req.firebaseUid]
        );
        if (!result.rowCount) {
            return res.status(404).json({
                success: false,
                code: 'BRAINSTORM_BOARD_NOT_FOUND',
                message: 'Brainstorm board not found.'
            });
        }
        return res.status(200).json({
            success: true,
            data: { board: result.rows[0] }
        });
    } catch (error) {
        console.error('Get brainstorm board error:', error);
        return res.status(500).json({
            success: false,
            code: 'BRAINSTORM_BOARD_FETCH_FAILED',
            message: 'The brainstorm board could not be retrieved.'
        });
    }
};

const updateBoardTitle = async (req, res) => {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    if (!title || title.length > 160) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_BRAINSTORM_BOARD_TITLE',
            message: 'Provide a board title of 1 to 160 characters.'
        });
    }

    try {
        const result = await pool.query(
            `
                UPDATE brainstorm_boards
                SET title = $3, updated_at = NOW()
                WHERE board_id = $1
                  AND created_by_firebase_uid = $2
                RETURNING board_id, project_id, title, created_by_firebase_uid, updated_at
            `,
            [req.params.boardId, req.firebaseUid, title]
        );
        if (!result.rowCount) {
            return res.status(404).json({
                success: false,
                code: 'BRAINSTORM_BOARD_NOT_FOUND',
                message: 'The board was not found or you are not its creator.'
            });
        }
        return res.status(200).json({
            success: true,
            data: { board: result.rows[0] }
        });
    } catch (error) {
        console.error('Update brainstorm board title error:', error);
        return res.status(500).json({
            success: false,
            code: 'BRAINSTORM_BOARD_UPDATE_FAILED',
            message: 'The brainstorm board title could not be updated.'
        });
    }
};

const deleteBoard = async (req, res) => {
    try {
        const result = await pool.query(
            `
                DELETE FROM brainstorm_boards
                WHERE board_id = $1
                  AND created_by_firebase_uid = $2
                RETURNING board_id, project_id
            `,
            [req.params.boardId, req.firebaseUid]
        );
        if (!result.rowCount) {
            return res.status(404).json({
                success: false,
                code: 'BRAINSTORM_BOARD_NOT_FOUND',
                message: 'The board was not found or you are not its creator.'
            });
        }
        return res.status(200).json({
            success: true,
            data: { board: result.rows[0] }
        });
    } catch (error) {
        console.error('Delete brainstorm board error:', error);
        return res.status(500).json({
            success: false,
            code: 'BRAINSTORM_BOARD_DELETE_FAILED',
            message: 'The brainstorm board could not be removed.'
        });
    }
};

const saveBoard = async (req, res) => {
    const boardData = req.body?.boardData;
    if (!boardDataIsValid(boardData)) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_BRAINSTORM_BOARD_DATA',
            message: 'The board content is invalid or exceeds the supported size.'
        });
    }
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        const result = await client.query(
            `
                UPDATE brainstorm_boards board
                SET board_data = $3::jsonb,
                    updated_at = NOW()
                WHERE board.board_id = $1
                  AND EXISTS (
                      SELECT 1
                      FROM brainstorm_board_members membership
                      WHERE membership.board_id = board.board_id
                        AND membership.firebase_uid = $2
                  )
                RETURNING board_id, project_id, title, created_by_firebase_uid, board_data, updated_at
            `,
            [req.params.boardId, req.firebaseUid, JSON.stringify(boardData)]
        );
        if (!result.rowCount) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                code: 'BRAINSTORM_BOARD_NOT_FOUND',
                message: 'Brainstorm board not found.'
            });
        }
        const profile = await client.query(
            `
                SELECT COALESCE(NULLIF(full_name, ''), email, 'A project member') AS name
                FROM user_profiles
                WHERE firebase_uid = $1
            `,
            [req.firebaseUid]
        );
        await client.query(
            `
                INSERT INTO notifications (
                    recipient_firebase_uid, project_id, type, title, detail, avatar, tone_class
                )
                SELECT
                    membership.firebase_uid,
                    $1,
                    'brainstorm_board_updated',
                    'A brainstorm board was updated',
                    $2,
                    '💡',
                    'teal-bg'
                FROM brainstorm_board_members membership
                WHERE membership.board_id = $3
                  AND membership.firebase_uid <> $4
            `,
            [
                result.rows[0].project_id,
                `${profile.rows[0]?.name || 'A project member'} updated "${result.rows[0].title}".`,
                result.rows[0].board_id,
                req.firebaseUid
            ]
        );
        await client.query('COMMIT');
        return res.status(200).json({
            success: true,
            data: { board: result.rows[0] }
        });
    } catch (error) {
        if (client) {
            await client.query('ROLLBACK').catch(rollbackError => {
                console.error('Save brainstorm board rollback error:', rollbackError);
            });
        }
        console.error('Save brainstorm board error:', error);
        return res.status(500).json({
            success: false,
            code: 'BRAINSTORM_BOARD_SAVE_FAILED',
            message: 'The brainstorm board could not be saved.'
        });
    } finally {
        client?.release();
    }
};

module.exports = {
    createProjectBoard,
    deleteBoard,
    getBoard,
    getProjectBoards,
    inviteBoardMembers,
    updateBoardTitle,
    saveBoard
};
