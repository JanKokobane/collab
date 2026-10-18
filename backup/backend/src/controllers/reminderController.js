const { randomUUID } = require('node:crypto');
const { query } = require('../config/db');

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const allowedPriorities = new Set(['Normal', 'High', 'Urgent']);

const getAccessibleProject = async (projectId, firebaseUid) => {
    const result = await query(
        `
            SELECT project_id, name, creator_firebase_uid
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

const isValidDate = value => {
    if (typeof value !== 'string' || !datePattern.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day;
};

const getProjectReminders = async (req, res) => {
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
                    reminder_id,
                    project_id,
                    $2::text AS project_name,
                    title,
                    reminder_date,
                    reminder_time,
                    priority,
                    created_by_firebase_uid,
                    created_by_name,
                    created_at,
                    updated_at
                FROM project_reminders
                WHERE project_id = $1
                ORDER BY reminder_date, reminder_time, created_at
            `,
            [project.project_id, project.name]
        );
        return res.status(200).json({
            success: true,
            data: { reminders: result.rows }
        });
    } catch (error) {
        console.error('Get project reminders error:', error);
        return res.status(500).json({
            success: false,
            code: 'PROJECT_REMINDERS_FETCH_FAILED',
            message: 'Project reminders could not be retrieved.'
        });
    }
};

const createProjectReminder = async (req, res) => {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const date = req.body?.date;
    const time = req.body?.time;
    const priority = req.body?.priority;

    if (!title || title.length > 255 || !isValidDate(date) ||
        typeof time !== 'string' || !timePattern.test(time) ||
        !allowedPriorities.has(priority)) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_REMINDER',
            message: 'Provide a valid title, date, time, and priority.'
        });
    }
    if (date < new Date().toISOString().slice(0, 10)) {
        return res.status(400).json({
            success: false,
            code: 'REMINDER_DATE_IN_PAST',
            message: 'Reminder dates cannot be in the past.'
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

        const createdByName = req.firebaseUser?.name ||
            req.firebaseUser?.displayName ||
            req.firebaseEmail ||
            'Project member';
        const result = await query(
            `
                INSERT INTO project_reminders (
                    reminder_id,
                    project_id,
                    title,
                    reminder_date,
                    reminder_time,
                    priority,
                    created_by_firebase_uid,
                    created_by_name
                )
                VALUES ($1, $2, $3, $4::date, $5::time, $6, $7, $8)
                RETURNING
                    reminder_id,
                    project_id,
                    title,
                    reminder_date,
                    reminder_time,
                    priority,
                    created_by_firebase_uid,
                    created_by_name,
                    created_at,
                    updated_at
            `,
            [
                randomUUID(),
                project.project_id,
                title,
                date,
                time,
                priority,
                req.firebaseUid,
                createdByName
            ]
        );
        return res.status(201).json({
            success: true,
            data: {
                reminder: {
                    ...result.rows[0],
                    project_name: project.name
                }
            }
        });
    } catch (error) {
        console.error('Create project reminder error:', error);
        return res.status(500).json({
            success: false,
            code: 'PROJECT_REMINDER_CREATE_FAILED',
            message: 'The project reminder could not be created.'
        });
    }
};

module.exports = {
    createProjectReminder,
    getProjectReminders
};
