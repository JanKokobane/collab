const { randomUUID } = require('node:crypto');
const { query } = require('../config/db');

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SPRINT_ATTACHMENT_BYTES = 100 * 1024 * 1024;
const MAX_SPRINT_ATTACHMENTS = 10;

function isValidDateKey(value) {
    if (value === null || value === undefined || value === '') return true;
    if (typeof value !== 'string' || !DATE_KEY_PATTERN.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day;
}

function serializeSprint(row) {
    return {
        ...(row.details || {}),
        id: row.sprint_id,
        sprintId: row.sprint_id,
        projectId: row.project_id,
        name: row.name,
        description: row.description,
        status: row.status,
        startDate: row.start_date,
        dueDate: row.due_date,
        attachments: row.attachments || []
    };
}

const getProjectSprints = async (req, res) => {
    try {
        const { projectId } = req.params;
        const result = await query(
            `
                SELECT sprint.*
                FROM project_sprints sprint
                JOIN projects project ON project.project_id = sprint.project_id
                WHERE sprint.project_id = $1
                  AND (
                    project.creator_firebase_uid = $2
                    OR EXISTS (
                        SELECT 1
                        FROM project_invitations invitation
                        WHERE invitation.project_id = project.project_id
                          AND invitation.invited_firebase_uid = $2
                          AND invitation.status = 'accepted'
                    )
                  )
                ORDER BY sprint.created_at, sprint.sprint_id
            `,
            [projectId, req.firebaseUid]
        );

        return res.status(200).json({
            success: true,
            data: { sprints: result.rows.map(serializeSprint) }
        });
    } catch (error) {
        console.error('Get project sprints error:', error);
        return res.status(500).json({
            success: false,
            code: 'PROJECT_SPRINTS_FETCH_FAILED',
            message: 'Project sprints could not be retrieved.'
        });
    }
};

const createProjectSprint = async (req, res) => {
    try {
        const { projectId } = req.params;
        const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
        const description =
            typeof req.body?.description === 'string' ? req.body.description.trim() : '';
        const startDate = req.body?.startDate || null;
        const dueDate = req.body?.dueDate || null;
        const attachments = req.body?.attachments ?? [];

        if (!name || name.length > 255) {
            return res.status(400).json({
                success: false,
                code: 'INVALID_SPRINT_NAME',
                message: 'Sprint title is required and must be 255 characters or fewer.'
            });
        }
        if (description.length > 10000) {
            return res.status(400).json({
                success: false,
                code: 'INVALID_SPRINT_DESCRIPTION',
                message: 'Sprint description cannot exceed 10,000 characters.'
            });
        }
        if (!isValidDateKey(startDate) || !isValidDateKey(dueDate) ||
            (startDate && dueDate && dueDate < startDate)) {
            return res.status(400).json({
                success: false,
                code: 'INVALID_SPRINT_DATES',
                message: 'Sprint dates are invalid or the due date is before the start date.'
            });
        }
        if (!Array.isArray(attachments) || attachments.length > MAX_SPRINT_ATTACHMENTS ||
            attachments.some(item => !item || typeof item !== 'object' || Array.isArray(item)) ||
            attachments.reduce((total, item) => total + Math.max(0, Number(item.size) || 0), 0) >
                MAX_SPRINT_ATTACHMENT_BYTES) {
            return res.status(400).json({
                success: false,
                code: 'INVALID_SPRINT_ATTACHMENTS',
                message: `Attach no more than ${MAX_SPRINT_ATTACHMENTS} files totaling 100 MB or less.`
            });
        }

        const projectResult = await query(
            `SELECT project_id, creator_firebase_uid, start_date, due_date
             FROM projects
             WHERE project_id = $1`,
            [projectId]
        );
        const project = projectResult.rows[0];
        if (!project) {
            return res.status(404).json({
                success: false,
                code: 'PROJECT_NOT_FOUND',
                message: 'Project not found.'
            });
        }
        if (project.creator_firebase_uid !== req.firebaseUid) {
            return res.status(403).json({
                success: false,
                code: 'SPRINT_CREATE_FORBIDDEN',
                message: 'Only the project owner can create a sprint.'
            });
        }
        const projectStart = project.start_date?.toISOString?.().slice(0, 10) ||
            (typeof project.start_date === 'string' ? project.start_date.slice(0, 10) : '');
        const projectDue = project.due_date?.toISOString?.().slice(0, 10) ||
            (typeof project.due_date === 'string' ? project.due_date.slice(0, 10) : '');
        if ((startDate && projectStart && startDate < projectStart) ||
            (dueDate && projectDue && dueDate > projectDue)) {
            return res.status(400).json({
                success: false,
                code: 'SPRINT_OUTSIDE_PROJECT_DATES',
                message: 'Sprint dates must fall within the project timeline.'
            });
        }

        const sprintId = randomUUID();
        const details = {
            name,
            description,
            status: 'Active',
            startDate,
            dueDate,
            attachments
        };
        const result = await query(
            `
                INSERT INTO project_sprints (
                    sprint_id, project_id, name, description, status,
                    start_date, due_date, attachments, details, created_by_firebase_uid
                )
                VALUES ($1, $2, $3, $4, 'Active', $5, $6, $7::jsonb, $8::jsonb, $9)
                RETURNING *
            `,
            [
                sprintId,
                projectId,
                name,
                description,
                startDate,
                dueDate,
                JSON.stringify(attachments),
                JSON.stringify(details),
                req.firebaseUid
            ]
        );

        return res.status(201).json({
            success: true,
            data: { sprint: serializeSprint(result.rows[0]) }
        });
    } catch (error) {
        console.error('Create project sprint error:', error);
        return res.status(500).json({
            success: false,
            code: 'PROJECT_SPRINT_CREATE_FAILED',
            message: 'The sprint could not be created.'
        });
    }
};

const deleteProjectSprint = async (req, res) => {
    try {
        const { projectId, sprintId } = req.params;
        const result = await query(
            `
                DELETE FROM project_sprints sprint
                USING projects project
                WHERE sprint.project_id = project.project_id
                  AND sprint.project_id = $1
                  AND sprint.sprint_id = $2
                  AND project.creator_firebase_uid = $3
                RETURNING sprint.sprint_id
            `,
            [projectId, sprintId, req.firebaseUid]
        );
        if (!result.rowCount) {
            return res.status(404).json({
                success: false,
                code: 'PROJECT_SPRINT_NOT_FOUND',
                message: 'Sprint not found or you do not have permission to remove it.'
            });
        }
        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('Delete project sprint error:', error);
        return res.status(500).json({
            success: false,
            code: 'PROJECT_SPRINT_DELETE_FAILED',
            message: 'The sprint could not be removed.'
        });
    }
};

module.exports = {
    createProjectSprint,
    deleteProjectSprint,
    getProjectSprints
};
