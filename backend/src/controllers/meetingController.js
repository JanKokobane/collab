const { randomUUID, createHmac } = require('node:crypto');
const { pool, query } = require('../config/db');

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

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

const createZoomSignature = (sessionName, roleType) => {
    const sdkKey = process.env.ZOOM_SDK_KEY?.trim();
    const sdkSecret = process.env.ZOOM_SDK_SECRET?.trim();
    if (!sdkKey || !sdkSecret) {
        const error = new Error('Zoom Video SDK is not configured.');
        error.code = 'ZOOM_SDK_NOT_CONFIGURED';
        throw error;
    }

    const issuedAt = Math.floor(Date.now() / 1000) - 30;
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const header = encode({ alg: 'HS256', typ: 'JWT' });
    const payload = encode({
        app_key: sdkKey,
        tpc: sessionName,
        role_type: roleType,
        version: 1,
        iat: issuedAt,
        exp: issuedAt + 60 * 60 * 2
    });
    const unsignedToken = `${header}.${payload}`;
    const signature = createHmac('sha256', sdkSecret)
        .update(unsignedToken)
        .digest('base64url');
    return `${unsignedToken}.${signature}`;
};

const getZoomMeetingToken = async (req, res) => {
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
                SELECT meeting_id, host_firebase_uid
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

        const signature = createZoomSignature(
            meeting.meeting_id,
            meeting.host_firebase_uid === req.firebaseUid ? 1 : 0
        );
        return res.status(200).json({
            success: true,
            data: { signature, sessionName: meeting.meeting_id }
        });
    } catch (error) {
        if (error.code === 'ZOOM_SDK_NOT_CONFIGURED') {
            return res.status(503).json({
                success: false,
                code: error.code,
                message: 'Zoom Video SDK is not configured. Set ZOOM_SDK_KEY and ZOOM_SDK_SECRET in the backend environment.'
            });
        }
        console.error('Get Zoom meeting token error:', error);
        return res.status(500).json({
            success: false,
            code: 'ZOOM_MEETING_TOKEN_FAILED',
            message: 'A secure Zoom meeting token could not be generated.'
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
    createMeeting,
    deleteMeeting,
    getZoomMeetingToken,
    getMeetings
};
