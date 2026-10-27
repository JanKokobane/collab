const { randomUUID } = require('node:crypto');
const { pool, query } = require('../config/db');

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const meetingIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const getAccessibleProject = async (projectId, firebaseUid) => {
    const result = await query(
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

const getMeetingForAttendee = async (projectId, meetingId, firebaseUid) => {
    const result = await query(
        `
            SELECT meeting_id, attendee_firebase_uids
            FROM project_meetings
            WHERE project_id = $1
              AND meeting_id = $2::uuid
              AND attendee_firebase_uids @> $3::jsonb
            LIMIT 1
        `,
        [projectId, meetingId, JSON.stringify([firebaseUid])]
    );
    return result.rows[0] || null;
};

const getMeetingContext = async (projectId, meetingId, firebaseUid) => {
    const result = await query(
        `
            SELECT meeting.meeting_id, meeting.attendee_firebase_uids,
                   project.project_id, project.name AS project_name,
                   project.creator_firebase_uid, project.sprints
            FROM project_meetings meeting
            JOIN projects project ON project.project_id = meeting.project_id
            WHERE meeting.project_id = $1
              AND meeting.meeting_id = $2::uuid
              AND meeting.attendee_firebase_uids @> $3::jsonb
              AND (
                  project.creator_firebase_uid = $4
                  OR EXISTS (
                      SELECT 1 FROM project_invitations invitation
                      WHERE invitation.project_id = project.project_id
                        AND invitation.invited_firebase_uid = $4
                        AND invitation.status = 'accepted'
                  )
              )
            LIMIT 1
        `,
        [projectId, meetingId, JSON.stringify([firebaseUid]), firebaseUid]
    );
    return result.rows[0] || null;
};

const getProjectMeetingLiveStatus = async (req, res) => {
    const { projectId, meetingId } = req.params;
    if (!meetingIdPattern.test(meetingId || '')) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_MEETING_ID',
            message: 'Meeting ID is invalid.'
        });
    }
    try {
        const meeting = await getMeetingContext(projectId, meetingId, req.firebaseUid);
        if (!meeting) return res.status(404).json({
            success: false,
            code: 'MEETING_NOT_FOUND_OR_FORBIDDEN',
            message: 'Meeting not found or you are not invited to it.'
        });
        const result = await query(
            `SELECT meeting.ended_at, meeting.host_firebase_uid,
                    project.creator_firebase_uid,
                    share.firebase_uid AS screen_sharer_firebase_uid,
                    share.participant_session_id AS screen_sharer_session_id,
                    share.lease_expires_at AS screen_share_lease_expires_at
             FROM project_meetings meeting
             JOIN projects project ON project.project_id = meeting.project_id
             LEFT JOIN project_meeting_screen_shares share
               ON share.meeting_id = meeting.meeting_id
              AND share.lease_expires_at > NOW()
             WHERE meeting.project_id = $1
               AND meeting.meeting_id = $2::uuid`,
            [projectId, meetingId]
        );
        const record = result.rows[0];
        return res.status(200).json({
            success: true,
            data: {
                endedAt: record.ended_at,
                canEnd: record.host_firebase_uid === req.firebaseUid ||
                    record.creator_firebase_uid === req.firebaseUid,
                screenShare: record.screen_sharer_firebase_uid
                    ? {
                        firebaseUid: record.screen_sharer_firebase_uid,
                        participantSessionId: record.screen_sharer_session_id,
                        leaseExpiresAt: record.screen_share_lease_expires_at
                    }
                    : null
            }
        });
    } catch (error) {
        console.error('Get project meeting live status error:', error);
        return res.status(500).json({
            success: false,
            code: 'PROJECT_MEETING_STATUS_FAILED',
            message: 'Meeting status could not be retrieved.'
        });
    }
};

const updateProjectMeetingScreenShare = async (req, res) => {
    const { projectId, meetingId } = req.params;
    const action = req.body?.action;
    const participantSessionId = typeof req.body?.participantSessionId === 'string'
        ? req.body.participantSessionId.trim()
        : '';
    if (!meetingIdPattern.test(meetingId || '') ||
        !['claim', 'heartbeat', 'release'].includes(action) ||
        !participantSessionId || participantSessionId.length > 200) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_SCREEN_SHARE_REQUEST',
            message: 'A valid meeting, action, and participant session are required.'
        });
    }
    try {
        const meeting = await getMeetingContext(projectId, meetingId, req.firebaseUid);
        if (!meeting) return res.status(404).json({
            success: false,
            code: 'MEETING_NOT_FOUND_OR_FORBIDDEN',
            message: 'Meeting not found or you are not invited to it.'
        });
        const activeMeeting = await query(
            `SELECT ended_at FROM project_meetings
             WHERE project_id = $1 AND meeting_id = $2::uuid`,
            [projectId, meetingId]
        );
        if (!activeMeeting.rowCount || activeMeeting.rows[0].ended_at) {
            return res.status(410).json({
                success: false,
                code: 'MEETING_ENDED',
                message: 'This meeting has ended.'
            });
        }

        if (action === 'release') {
            await query(
                `DELETE FROM project_meeting_screen_shares
                 WHERE meeting_id = $1::uuid
                   AND firebase_uid = $2
                   AND participant_session_id = $3`,
                [meetingId, req.firebaseUid, participantSessionId]
            );
            return res.status(200).json({ success: true, data: { screenShare: null } });
        }

        const result = await query(
            `INSERT INTO project_meeting_screen_shares (
                 meeting_id, firebase_uid, participant_session_id, lease_expires_at
             )
             VALUES ($1::uuid, $2, $3, NOW() + INTERVAL '15 seconds')
             ON CONFLICT (meeting_id) DO UPDATE
             SET firebase_uid = EXCLUDED.firebase_uid,
                 participant_session_id = EXCLUDED.participant_session_id,
                 lease_expires_at = EXCLUDED.lease_expires_at,
                 updated_at = NOW()
             WHERE project_meeting_screen_shares.lease_expires_at <= NOW()
                OR (
                    project_meeting_screen_shares.firebase_uid = EXCLUDED.firebase_uid
                    AND project_meeting_screen_shares.participant_session_id = EXCLUDED.participant_session_id
                )
             RETURNING firebase_uid, participant_session_id, lease_expires_at`,
            [meetingId, req.firebaseUid, participantSessionId]
        );
        if (!result.rowCount) {
            return res.status(409).json({
                success: false,
                code: 'SCREEN_SHARE_IN_USE',
                message: 'Someone else is already sharing their screen.'
            });
        }
        return res.status(200).json({
            success: true,
            data: {
                screenShare: {
                    firebaseUid: result.rows[0].firebase_uid,
                    participantSessionId: result.rows[0].participant_session_id,
                    leaseExpiresAt: result.rows[0].lease_expires_at
                }
            }
        });
    } catch (error) {
        console.error('Update project meeting screen share error:', error);
        return res.status(500).json({
            success: false,
            code: 'PROJECT_MEETING_SCREEN_SHARE_FAILED',
            message: 'Screen sharing status could not be updated.'
        });
    }
};

const endProjectMeeting = async (req, res) => {
    const { projectId, meetingId } = req.params;
    if (!meetingIdPattern.test(meetingId || '')) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_MEETING_ID',
            message: 'Meeting ID is invalid.'
        });
    }
    try {
        const result = await query(
            `UPDATE project_meetings meeting
             SET ended_at = COALESCE(meeting.ended_at, NOW()),
                 ended_by_firebase_uid = COALESCE(meeting.ended_by_firebase_uid, $3)
             FROM projects project
             WHERE meeting.project_id = $1
               AND meeting.meeting_id = $2::uuid
               AND project.project_id = meeting.project_id
               AND (
                   meeting.host_firebase_uid = $3
                   OR project.creator_firebase_uid = $3
               )
             RETURNING meeting.meeting_id, meeting.ended_at`,
            [projectId, meetingId, req.firebaseUid]
        );
        if (!result.rowCount) return res.status(404).json({
            success: false,
            code: 'MEETING_NOT_FOUND_OR_FORBIDDEN',
            message: 'Only the meeting host or project owner can end this meeting for everyone.'
        });
        await query(
            'DELETE FROM project_meeting_screen_shares WHERE meeting_id = $1::uuid',
            [meetingId]
        );
        return res.status(200).json({
            success: true,
            data: { meetingId: result.rows[0].meeting_id, endedAt: result.rows[0].ended_at }
        });
    } catch (error) {
        console.error('End project meeting error:', error);
        return res.status(500).json({
            success: false,
            code: 'PROJECT_MEETING_END_FAILED',
            message: 'The meeting could not be ended.'
        });
    }
};

const getProjectMeetingNotes = async (req, res) => {
    if (!meetingIdPattern.test(req.params.meetingId)) {
        return res.status(400).json({ success: false, code: 'INVALID_MEETING_ID', message: 'Meeting ID is invalid.' });
    }
    try {
        const meeting = await getMeetingContext(req.params.projectId, req.params.meetingId, req.firebaseUid);
        if (!meeting) return res.status(404).json({
            success: false, code: 'MEETING_NOT_FOUND_OR_FORBIDDEN', message: 'Meeting not found or you are not invited to it.'
        });
        const result = await query(
            `SELECT body, updated_by_firebase_uid, updated_at
             FROM project_meeting_notes WHERE meeting_id = $1::uuid`,
            [meeting.meeting_id]
        );
        return res.status(200).json({
            success: true,
            data: { notes: result.rows[0] || { body: '', updated_by_firebase_uid: null, updated_at: null } }
        });
    } catch (error) {
        console.error('Get project meeting notes error:', error);
        return res.status(500).json({ success: false, code: 'MEETING_NOTES_FETCH_FAILED', message: 'Meeting notes could not be retrieved.' });
    }
};

const saveProjectMeetingNotes = async (req, res) => {
    const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
    if (!meetingIdPattern.test(req.params.meetingId) || body.length > 20000) {
        return res.status(400).json({ success: false, code: 'INVALID_MEETING_NOTES', message: 'Meeting notes cannot exceed 20,000 characters.' });
    }
    try {
        const meeting = await getMeetingContext(req.params.projectId, req.params.meetingId, req.firebaseUid);
        if (!meeting) return res.status(404).json({
            success: false, code: 'MEETING_NOT_FOUND_OR_FORBIDDEN', message: 'Meeting not found or you are not invited to it.'
        });
        const result = await query(
            `INSERT INTO project_meeting_notes (meeting_id, body, updated_by_firebase_uid)
             VALUES ($1::uuid, $2, $3)
             ON CONFLICT (meeting_id) DO UPDATE
             SET body = EXCLUDED.body,
                 updated_by_firebase_uid = EXCLUDED.updated_by_firebase_uid,
                 updated_at = NOW()
             RETURNING body, updated_by_firebase_uid, updated_at`,
            [meeting.meeting_id, body, req.firebaseUid]
        );
        return res.status(200).json({ success: true, data: { notes: result.rows[0] } });
    } catch (error) {
        console.error('Save project meeting notes error:', error);
        return res.status(500).json({ success: false, code: 'MEETING_NOTES_SAVE_FAILED', message: 'Meeting notes could not be saved.' });
    }
};

const getProjectMeetingActionItems = async (req, res) => {
    if (!meetingIdPattern.test(req.params.meetingId)) {
        return res.status(400).json({ success: false, code: 'INVALID_MEETING_ID', message: 'Meeting ID is invalid.' });
    }
    try {
        const meeting = await getMeetingContext(req.params.projectId, req.params.meetingId, req.firebaseUid);
        if (!meeting) return res.status(404).json({
            success: false, code: 'MEETING_NOT_FOUND_OR_FORBIDDEN', message: 'Meeting not found or you are not invited to it.'
        });
        const result = await query(
            `SELECT action.action_item_id, action.content, action.assignee_firebase_uid,
                    action.due_date, action.task_id::text AS task_id, action.created_by_firebase_uid,
                                        action.created_at,
                                        COALESCE(member.invited_name, project.creator_name, 'Project member') AS assignee_name
             FROM project_meeting_action_items action
                         JOIN projects project ON project.project_id = $2
                         LEFT JOIN project_invitations member ON member.project_id = project.project_id
                             AND member.invited_firebase_uid = action.assignee_firebase_uid
             WHERE action.meeting_id = $1::uuid
             ORDER BY action.created_at, action.action_item_id`,
            [meeting.meeting_id, meeting.project_id]
        );
        return res.status(200).json({ success: true, data: { actionItems: result.rows } });
    } catch (error) {
        console.error('Get project meeting action items error:', error);
        return res.status(500).json({ success: false, code: 'MEETING_ACTION_ITEMS_FETCH_FAILED', message: 'Meeting action items could not be retrieved.' });
    }
};

const createProjectMeetingActionItem = async (req, res) => {
    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
    if (!meetingIdPattern.test(req.params.meetingId) || !content || content.length > 500) {
        return res.status(400).json({ success: false, code: 'INVALID_MEETING_ACTION_ITEM', message: 'Enter an action item between 1 and 500 characters.' });
    }
    try {
        const meeting = await getMeetingContext(req.params.projectId, req.params.meetingId, req.firebaseUid);
        if (!meeting) return res.status(404).json({
            success: false, code: 'MEETING_NOT_FOUND_OR_FORBIDDEN', message: 'Meeting not found or you are not invited to it.'
        });
        const result = await query(
            `INSERT INTO project_meeting_action_items (
                 meeting_id, content, assignee_firebase_uid, created_by_firebase_uid
             ) VALUES ($1::uuid, $2, $3, $3)
             RETURNING action_item_id, content, assignee_firebase_uid, due_date,
                       task_id::text AS task_id, created_by_firebase_uid, created_at`,
            [meeting.meeting_id, content, req.firebaseUid]
        );
        return res.status(201).json({ success: true, data: { actionItem: result.rows[0] } });
    } catch (error) {
        console.error('Create project meeting action item error:', error);
        return res.status(500).json({ success: false, code: 'MEETING_ACTION_ITEM_CREATE_FAILED', message: 'The action item could not be saved.' });
    }
};

const dispatchProjectMeetingActionItem = async (req, res) => {
    const { projectId, meetingId, actionItemId } = req.params;
    const assigneeUid = typeof req.body?.assigneeFirebaseUid === 'string'
        ? req.body.assigneeFirebaseUid.trim()
        : '';
    const sprintName = typeof req.body?.sprintName === 'string' ? req.body.sprintName.trim() : '';
    const dueDate = typeof req.body?.dueDate === 'string' ? req.body.dueDate : '';
    if (!meetingIdPattern.test(meetingId) || !meetingIdPattern.test(actionItemId) ||
        !assigneeUid || !sprintName || !datePattern.test(dueDate)) {
        return res.status(400).json({ success: false, code: 'INVALID_ACTION_ITEM_DISPATCH', message: 'Choose an attendee, sprint, and valid due date.' });
    }
    const [year, month, day] = dueDate.split('-').map(Number);
    const parsedDueDate = new Date(Date.UTC(year, month - 1, day));
    if (parsedDueDate.getUTCFullYear() !== year || parsedDueDate.getUTCMonth() !== month - 1 ||
        parsedDueDate.getUTCDate() !== day || dueDate < new Date().toISOString().slice(0, 10)) {
        return res.status(400).json({ success: false, code: 'INVALID_ACTION_ITEM_DUE_DATE', message: 'Choose a valid due date that is today or later.' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const meetingResult = await client.query(
            `SELECT meeting.meeting_id, meeting.attendee_firebase_uids,
                    project.project_id, project.sprints, project.creator_firebase_uid
             FROM project_meetings meeting
             JOIN projects project ON project.project_id = meeting.project_id
             WHERE meeting.project_id = $1 AND meeting.meeting_id = $2::uuid
               AND meeting.attendee_firebase_uids @> $3::jsonb
               AND (project.creator_firebase_uid = $4 OR EXISTS (
                   SELECT 1 FROM project_invitations invitation
                   WHERE invitation.project_id = project.project_id
                     AND invitation.invited_firebase_uid = $4
                     AND invitation.status = 'accepted'
               ))
             FOR UPDATE OF meeting`,
            [projectId, meetingId, JSON.stringify([req.firebaseUid]), req.firebaseUid]
        );
        const meeting = meetingResult.rows[0];
        if (!meeting) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, code: 'MEETING_NOT_FOUND_OR_FORBIDDEN', message: 'Meeting not found or you are not invited to it.' });
        }
        const itemResult = await client.query(
            `SELECT content, task_id FROM project_meeting_action_items
             WHERE meeting_id = $1::uuid AND action_item_id = $2::uuid FOR UPDATE`,
            [meetingId, actionItemId]
        );
        const actionItem = itemResult.rows[0];
        if (!actionItem) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, code: 'MEETING_ACTION_ITEM_NOT_FOUND', message: 'Action item not found.' });
        }
        if (actionItem.task_id) {
            await client.query('ROLLBACK');
            return res.status(409).json({ success: false, code: 'MEETING_ACTION_ITEM_ALREADY_DISPATCHED', message: 'This action item is already on the task board.' });
        }
        const attendees = Array.isArray(meeting.attendee_firebase_uids) ? meeting.attendee_firebase_uids : [];
        const sprint = (Array.isArray(meeting.sprints) ? meeting.sprints : [])
            .find(item => item?.name === sprintName && item.assigneeFirebaseUid === assigneeUid);
        const assigneeIsProjectMember = assigneeUid === meeting.creator_firebase_uid || attendees.includes(assigneeUid);
        const acceptedAssignee = assigneeUid === meeting.creator_firebase_uid
            ? { rowCount: 1 }
            : await client.query(
                `SELECT 1 FROM project_invitations
                 WHERE project_id = $1 AND invited_firebase_uid = $2 AND status = 'accepted'
                 LIMIT 1`,
                [meeting.project_id, assigneeUid]
            );
        if (!sprint || !assigneeIsProjectMember || !attendees.includes(assigneeUid) || !acceptedAssignee.rowCount) {
            await client.query('ROLLBACK');
            return res.status(400).json({ success: false, code: 'INVALID_ACTION_ITEM_ASSIGNEE', message: 'Choose a meeting attendee who leads the selected project sprint.' });
        }
        const taskId = randomUUID();
        const title = actionItem.content.slice(0, 255);
        await client.query(
            `INSERT INTO project_tasks (
                 task_id, project_id, title, description, category, sprint_name,
                 assignee_firebase_uid, status, due_date, created_by_firebase_uid
             ) VALUES ($1::uuid, $2, $3, $4, 'Product', $5, $6, 'To do', $7::date, $8)`,
            [taskId, meeting.project_id, title, actionItem.content, sprintName, assigneeUid, dueDate, req.firebaseUid]
        );
        await client.query(
            `UPDATE project_meeting_action_items
             SET assignee_firebase_uid = $1, due_date = $2::date, task_id = $3::uuid
             WHERE action_item_id = $4::uuid`,
            [assigneeUid, dueDate, taskId, actionItemId]
        );
        await client.query('COMMIT');
        return res.status(201).json({ success: true, data: { taskId } });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Dispatch project meeting action item error:', error);
        return res.status(500).json({ success: false, code: 'MEETING_ACTION_ITEM_DISPATCH_FAILED', message: 'The action item could not be dispatched to the task board.' });
    } finally {
        client.release();
    }
};

const getMeetingChatMessages = async (req, res) => {
    if (!meetingIdPattern.test(req.params.meetingId)) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_MEETING_ID',
            message: 'Provide a valid meeting ID.'
        });
    }

    try {
        const project = await getAccessibleProject(req.params.projectId, req.firebaseUid);
        if (!project || !await getMeetingForAttendee(
            project.project_id,
            req.params.meetingId,
            req.firebaseUid
        )) {
            return res.status(404).json({
                success: false,
                code: 'MEETING_NOT_FOUND_OR_FORBIDDEN',
                message: 'Meeting not found or you are not invited to it.'
            });
        }

        const result = await query(
            `
                SELECT message_id, sender_firebase_uid, sender_name, content, created_at
                FROM project_meeting_messages
                WHERE meeting_id = $1::uuid
                ORDER BY created_at DESC, message_id DESC
                LIMIT 100
            `,
            [req.params.meetingId]
        );
        return res.status(200).json({
            success: true,
            data: { messages: result.rows.reverse() }
        });
    } catch (error) {
        console.error('Get project meeting chat error:', error);
        return res.status(500).json({
            success: false,
            code: 'PROJECT_MEETING_CHAT_FETCH_FAILED',
            message: 'Meeting messages could not be retrieved.'
        });
    }
};

const createMeetingChatMessage = async (req, res) => {
    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
    if (!meetingIdPattern.test(req.params.meetingId) || !content || content.length > 1000) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_MEETING_MESSAGE',
            message: 'Enter a message between 1 and 1000 characters.'
        });
    }

    try {
        const project = await getAccessibleProject(req.params.projectId, req.firebaseUid);
        if (!project || !await getMeetingForAttendee(
            project.project_id,
            req.params.meetingId,
            req.firebaseUid
        )) {
            return res.status(404).json({
                success: false,
                code: 'MEETING_NOT_FOUND_OR_FORBIDDEN',
                message: 'Meeting not found or you are not invited to it.'
            });
        }

        const senderName = req.firebaseUser?.name ||
            req.firebaseUser?.displayName ||
            req.firebaseEmail ||
            'Project member';
        const result = await query(
            `
                INSERT INTO project_meeting_messages (
                    meeting_id, sender_firebase_uid, sender_name, content
                )
                SELECT meeting.meeting_id, $2, $3, $4
                FROM project_meetings meeting
                WHERE meeting.project_id = $5
                  AND meeting.meeting_id = $1::uuid
                  AND meeting.ended_at IS NULL
                RETURNING message_id, sender_firebase_uid, sender_name, content, created_at
            `,
            [req.params.meetingId, req.firebaseUid, senderName, content, project.project_id]
        );
        if (!result.rowCount) {
            return res.status(410).json({
                success: false,
                code: 'MEETING_ENDED',
                message: 'This meeting has ended.'
            });
        }
        return res.status(201).json({
            success: true,
            data: { message: result.rows[0] }
        });
    } catch (error) {
        console.error('Create project meeting chat message error:', error);
        return res.status(500).json({
            success: false,
            code: 'PROJECT_MEETING_CHAT_SEND_FAILED',
            message: 'The meeting message could not be sent.'
        });
    }
};

const getMeetings = async (req, res) => {
    try {
        const project = await getAccessibleProject(req.params.projectId, req.firebaseUid);
        if (!project) {
            return res.status(404).json({
                success: false,
                code: 'PROJECT_NOT_FOUND',
                message: 'Project not found.'
            });
        }

        const result = await query(
            `
                SELECT
                    meeting_id,
                    project_id,
                    $2::text AS project_name,
                    title,
                    meeting_date,
                    start_time,
                    end_time,
                    pinned,
                    location,
                    meeting_url,
                    notes,
                    host_firebase_uid,
                    host_name,
                    attendee_firebase_uids,
                    ended_at,
                    created_at,
                    updated_at
                FROM project_meetings
                WHERE project_id = $1
                ORDER BY meeting_date, start_time, created_at
            `,
            [project.project_id, project.name]
        );
        return res.status(200).json({
            success: true,
            data: { meetings: result.rows }
        });
    } catch (error) {
        console.error('Get project meetings error:', error);
        return res.status(500).json({
            success: false,
            code: 'PROJECT_MEETINGS_FETCH_FAILED',
            message: 'Project meetings could not be retrieved.'
        });
    }
};

const getMeteredApiConfig = () => {
    const appName = process.env.METERED_APP_NAME?.trim()
        ?.replace(/^https?:\/\//i, '')
        .replace(/\.metered\.live\/?$/i, '');
    const secretKey = (
        process.env.METERED_VIDEO_SECRET_KEY ||
        process.env.METERED_API_KEY
    )?.trim();
    if (!appName || !/^[a-z0-9-]+$/i.test(appName) || !secretKey) {
        const error = new Error('Metered Video is not configured.');
        error.code = 'METERED_VIDEO_NOT_CONFIGURED';
        throw error;
    }
    return { appName, secretKey };
};

const requestMetered = async (config, path, method = 'GET', body) => {
    const endpoint = new URL(
        `https://${config.appName}.metered.live/api/v1/${path}`
    );
    endpoint.searchParams.set('secretKey', config.secretKey);
    const response = await fetch(endpoint, {
        method,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(8000)
    });
    let payload;
    try {
        payload = await response.json();
    } catch (error) {
        if (response.ok) throw error;
    }
    if (!response.ok) {
        const detail = typeof payload?.message === 'string'
            ? payload.message
            : typeof payload?.reason === 'string'
                ? payload.reason
                : '';
        const error = new Error(
            `Metered API returned HTTP ${response.status}${detail ? `: ${detail}` : '.'}`
        );
        error.code = 'METERED_API_REQUEST_FAILED';
        error.status = response.status;
        error.detail = detail;
        throw error;
    }
    return payload;
};

const getOrCreateMeteredRoom = async (config, roomName) => {
    let room;
    try {
        room = await requestMetered(
            config,
            `room/${encodeURIComponent(roomName)}`
        );
    } catch (error) {
        // Metered's room lookup can report a missing room as HTTP 400.
        const roomNotFound = error.status === 400 || error.status === 404;
        if (!roomNotFound) throw error;
    }

    if (!room) {
        try {
            room = await requestMetered(config, 'room', 'POST', {
                roomName,
                privacy: 'private',
                enableRequestToJoin: false,
                enableChat: true,
                enableScreenSharing: true
            });
        } catch (createError) {
            // Another attendee may have provisioned the room at the same time.
            try {
                room = await requestMetered(
                    config,
                    `room/${encodeURIComponent(roomName)}`
                );
            } catch {
                throw createError;
            }
        }
    }

    if (room?.privacy !== 'private') {
        const error = new Error('The Metered room is not private.');
        error.code = 'METERED_ROOM_NOT_PRIVATE';
        throw error;
    }
};

const getMeteredMeetingToken = async (req, res) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.meetingId)) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_MEETING_ID',
            message: 'Provide a valid meeting ID.'
        });
    }

    try {
        const project = await getAccessibleProject(req.params.projectId, req.firebaseUid);
        if (!project) {
            return res.status(404).json({
                success: false,
                code: 'PROJECT_NOT_FOUND',
                message: 'Project not found.'
            });
        }

        const result = await query(
            `
                SELECT meeting_id, host_firebase_uid, ended_at
                FROM project_meetings
                WHERE project_id = $1
                  AND meeting_id = $2::uuid
                  AND attendee_firebase_uids @> $3::jsonb
                LIMIT 1
            `,
            [project.project_id, req.params.meetingId, JSON.stringify([req.firebaseUid])]
        );
        const meeting = result.rows[0];
        if (!meeting) {
            return res.status(404).json({
                success: false,
                code: 'MEETING_NOT_FOUND_OR_FORBIDDEN',
                message: 'Meeting not found or you are not invited to it.'
            });
        }
        if (meeting.ended_at) {
            return res.status(410).json({
                success: false,
                code: 'MEETING_ENDED',
                message: 'This meeting has ended.'
            });
        }

        const config = getMeteredApiConfig();
        await getOrCreateMeteredRoom(config, meeting.meeting_id);
        const tokenResponse = await requestMetered(config, 'token', 'POST', {
            roomName: meeting.meeting_id,
            isAdmin: false,
            name: req.firebaseUser?.name ||
                req.firebaseUser?.displayName ||
                req.firebaseEmail ||
                'Project member',
            email: req.firebaseEmail,
            externalUserId: req.firebaseUid,
            expireUnixSec: Math.floor(Date.now() / 1000) + 6 * 60 * 60
        });
        if (typeof tokenResponse?.token !== 'string' || !tokenResponse.token) {
            throw new Error('Metered did not return a meeting access token.');
        }
        return res.status(200).json({
            success: true,
            data: {
                accessToken: tokenResponse.token,
                roomName: meeting.meeting_id,
                roomURL: `${config.appName}.metered.live/${meeting.meeting_id}`
            }
        });
    } catch (error) {
        if (error.code === 'METERED_VIDEO_NOT_CONFIGURED') {
            return res.status(503).json({
                success: false,
                code: error.code,
                message: 'Metered Video is not configured. Set METERED_APP_NAME and METERED_VIDEO_SECRET_KEY in the backend environment.'
            });
        }
        if (error.code === 'METERED_ROOM_NOT_PRIVATE') {
            return res.status(503).json({
                success: false,
                code: error.code,
                message: 'The Metered room is not private and cannot be joined safely.'
            });
        }
        if (error.code === 'METERED_API_REQUEST_FAILED') {
            console.error('Metered meeting setup error:', {
                status: error.status,
                detail: error.detail || error.message
            });
            return res.status(502).json({
                success: false,
                code: error.code,
                message: error.status === 401 || error.status === 403
                    ? 'Metered rejected the Video API credentials. Verify METERED_APP_NAME and METERED_VIDEO_SECRET_KEY in the backend environment.'
                    : 'Metered could not prepare the meeting room or access token. Check the backend logs for the Metered response.'
            });
        }
        console.error('Get Metered meeting token error:', error);
        return res.status(500).json({
            success: false,
            code: 'METERED_MEETING_TOKEN_FAILED',
            message: 'A secure Metered meeting token could not be generated.'
        });
    }
};

const createMeeting = async (req, res) => {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const date = typeof req.body?.date === 'string' ? req.body.date : '';
    const startTime = typeof req.body?.startTime === 'string' ? req.body.startTime : '';
    const endTime = typeof req.body?.endTime === 'string' ? req.body.endTime : '';
    const location = typeof req.body?.location === 'string' ? req.body.location.trim() : '';
    const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : '';
    const pinned = req.body?.pinned === undefined ? true : req.body.pinned;
    const attendeeUids = Array.isArray(req.body?.attendeeFirebaseUids)
        ? [...new Set(req.body.attendeeFirebaseUids.filter(uid => typeof uid === 'string' && uid.trim()).map(uid => uid.trim()))]
        : [];

    if (!title || title.length > 255 || !datePattern.test(date) ||
        !timePattern.test(startTime) || !timePattern.test(endTime) ||
        endTime <= startTime || location.length > 2048 || notes.length > 10000 ||
        typeof pinned !== 'boolean' || attendeeUids.length > 100 ||
        (Array.isArray(req.body?.attendeeFirebaseUids) &&
            attendeeUids.length !== req.body.attendeeFirebaseUids.length)) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_MEETING',
            message: 'Provide a valid title, date, time range, location, attendees, and notes.'
        });
    }
    const [year, month, day] = date.split('-').map(Number);
    const parsedDate = new Date(Date.UTC(year, month - 1, day));
    if (
        parsedDate.getUTCFullYear() !== year ||
        parsedDate.getUTCMonth() !== month - 1 ||
        parsedDate.getUTCDate() !== day
    ) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_MEETING_DATE',
            message: 'Choose a valid meeting date.'
        });
    }
    if (date < new Date().toISOString().slice(0, 10)) {
        return res.status(400).json({
            success: false,
            code: 'MEETING_DATE_IN_PAST',
            message: 'Meeting dates cannot be in the past.'
        });
    }

    try {
        const project = await getAccessibleProject(req.params.projectId, req.firebaseUid);
        if (!project) {
            return res.status(404).json({
                success: false,
                code: 'PROJECT_NOT_FOUND',
                message: 'Project not found.'
            });
        }

        const memberResult = await query(
            `
                SELECT invited_firebase_uid
                FROM project_invitations
                WHERE project_id = $1
                  AND status = 'accepted'
                  AND invited_firebase_uid = ANY($2::text[])
            `,
            [project.project_id, attendeeUids]
        );
        const allowedUids = new Set([
            project.creator_firebase_uid,
            ...memberResult.rows.map(member => member.invited_firebase_uid)
        ]);
        if (attendeeUids.some(uid => !allowedUids.has(uid))) {
            return res.status(400).json({
                success: false,
                code: 'INVALID_MEETING_ATTENDEES',
                message: 'Meeting attendees must be the project creator or accepted project members.'
            });
        }

        const attendees = [...new Set([req.firebaseUid, ...attendeeUids])];
        const meetingId = randomUUID();
        const hostName = req.firebaseUser?.name ||
            req.firebaseUser?.displayName ||
            req.firebaseEmail ||
            'Project member';
        const hostInitials = hostName
            .trim()
            .split(/\s+/)
            .map(part => part[0])
            .join('')
            .slice(0, 2)
            .toUpperCase() || '📅';
        const client = await pool.connect();
        let result;
        try {
            await client.query('BEGIN');
            result = await client.query(
                `
                    INSERT INTO project_meetings (
                        meeting_id,
                        project_id,
                        title,
                        meeting_date,
                        start_time,
                        end_time,
                        pinned,
                        location,
                        meeting_url,
                        notes,
                        host_firebase_uid,
                        host_name,
                        attendee_firebase_uids
                    )
                    VALUES ($1, $2, $3, $4::date, $5::time, $6::time, $7, $8, $9, $10, $11, $12, $13::jsonb)
                    RETURNING
                        meeting_id,
                        project_id,
                        title,
                        meeting_date,
                        start_time,
                        end_time,
                        pinned,
                        location,
                        meeting_url,
                        notes,
                        host_firebase_uid,
                        host_name,
                        attendee_firebase_uids,
                        created_at,
                        updated_at
                `,
                [
                    meetingId,
                    project.project_id,
                    title,
                    date,
                    startTime,
                    endTime,
                    pinned,
                    location,
                    '',
                    notes,
                    req.firebaseUid,
                    hostName,
                    JSON.stringify(attendees)
                ]
            );
            const notificationRecipients = attendees.filter(uid => uid !== req.firebaseUid);
            if (notificationRecipients.length > 0) {
                await client.query(
                    `
                        INSERT INTO notifications (
                            recipient_firebase_uid,
                            project_id,
                            type,
                            title,
                            detail,
                            avatar,
                            tone_class
                        )
                        SELECT
                            recipient_uid,
                            $2,
                            'meeting_invitation',
                            'You are invited to a project meeting',
                            $3,
                            $4,
                            'blue-bg'
                        FROM unnest($1::text[]) AS recipient_uid
                    `,
                    [
                        notificationRecipients,
                        project.project_id,
                        `${hostName} invited you to "${title}" for ${date}, ${startTime}–${endTime} in ${project.name}.`,
                        hostInitials
                    ]
                );
            }
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK').catch(rollbackError => {
                console.error('Create meeting rollback error:', rollbackError);
            });
            throw error;
        } finally {
            client.release();
        }

        return res.status(201).json({
            success: true,
            data: {
                meeting: {
                    ...result.rows[0],
                    project_name: project.name
                }
            }
        });
    } catch (error) {
        console.error('Create project meeting error:', {
            code: error.code || null,
            message: error.message
        });
        return res.status(500).json({
            success: false,
            code: 'PROJECT_MEETING_CREATE_FAILED',
            message: 'The project meeting could not be created.'
        });
    }
};

const deleteMeeting = async (req, res) => {
    try {
        const project = await getAccessibleProject(req.params.projectId, req.firebaseUid);
        if (!project) {
            return res.status(404).json({
                success: false,
                code: 'PROJECT_NOT_FOUND',
                message: 'Project not found.'
            });
        }

        const result = await query(
            `
                DELETE FROM project_meetings
                WHERE project_id = $1
                  AND meeting_id = $2::uuid
                  AND (
                    host_firebase_uid = $3
                    OR $4 = $3
                  )
                RETURNING meeting_id
            `,
            [
                project.project_id,
                req.params.meetingId,
                req.firebaseUid,
                project.creator_firebase_uid
            ]
        );
        if (!result.rowCount) {
            return res.status(404).json({
                success: false,
                code: 'MEETING_NOT_FOUND_OR_FORBIDDEN',
                message: 'Meeting not found or you do not have permission to cancel it.'
            });
        }
        return res.status(200).json({
            success: true,
            data: { meetingId: result.rows[0].meeting_id }
        });
    } catch (error) {
        console.error('Delete project meeting error:', error);
        return res.status(500).json({
            success: false,
            code: 'PROJECT_MEETING_DELETE_FAILED',
            message: 'The project meeting could not be canceled.'
        });
    }
};

module.exports = {
    createProjectMeetingActionItem,
    createMeetingChatMessage,
    createMeeting,
    dispatchProjectMeetingActionItem,
    deleteMeeting,
    endProjectMeeting,
    getProjectMeetingActionItems,
    getProjectMeetingLiveStatus,
    getProjectMeetingNotes,
    getMeetingChatMessages,
    getMeteredMeetingToken,
    saveProjectMeetingNotes,
    updateProjectMeetingScreenShare,
    getMeetings
};
