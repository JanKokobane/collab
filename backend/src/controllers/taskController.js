const { randomUUID } = require('node:crypto');
const { query } = require('../config/db');

const allowedStatuses = new Set(['Backlog', 'To do', 'In progress', 'Done']);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isValidDate = value => {
    if (!value) return true;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day;
};

const normalizeTaskInput = body => {
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    const description = typeof body?.description === 'string' ? body.description.trim() : '';
    const category = body?.category === undefined
        ? 'Product'
        : typeof body.category === 'string'
            ? body.category.trim()
            : '';
    const sprintName = typeof body?.sprintName === 'string' ? body.sprintName.trim() : '';
    const assigneeFirebaseUid = typeof body?.assigneeFirebaseUid === 'string'
        ? body.assigneeFirebaseUid.trim()
        : '';
    const status = typeof body?.status === 'string' ? body.status.trim() : 'To do';
    const startDate = body?.startDate || null;
    const dueDate = body?.dueDate || null;

    if (!title || title.length > 255) {
        return { error: 'Task title is required and cannot exceed 255 characters.' };
    }
    if (description.length > 10_000) {
        return { error: 'Task description cannot exceed 10,000 characters.' };
    }
    if (!category || category.length > 100) {
        return { error: 'Choose a valid task category.' };
    }
    if (!sprintName || sprintName.length > 255) {
        return { error: 'Choose a valid project sprint.' };
    }
    if (!assigneeFirebaseUid) {
        return { error: 'Choose an accepted project invitee to assign this task to.' };
    }
    if (!allowedStatuses.has(status)) {
        return { error: 'Choose a valid task status.' };
    }
    if (!isValidDate(startDate) || !isValidDate(dueDate)) {
        return { error: 'Task dates must use YYYY-MM-DD format.' };
    }

    return {
        value: {
            title,
            description,
            category,
            sprintName,
            assigneeFirebaseUid,
            status,
            startDate,
            dueDate
        }
    };
};

const getProjectAndCheckAccess = async (projectId, firebaseUid, ownerOnly = false) => {
    const result = await query(
        `
            SELECT project_id, name, creator_firebase_uid, sprints
            FROM projects p
            WHERE p.project_id = $1
              AND (
                    p.creator_firebase_uid = $2
                    OR (
                        NOT $3
                        AND EXISTS (
                            SELECT 1
                            FROM project_invitations access_invitation
                            WHERE access_invitation.project_id = p.project_id
                              AND access_invitation.invited_firebase_uid = $2
                              AND access_invitation.status = 'accepted'
                        )
                    )
              )
            LIMIT 1
        `,
        [projectId, firebaseUid, ownerOnly]
    );
    return result.rows[0] || null;
};

const validateAssignmentAndSprint = async (project, task, { allowLegacyTaskAssignee = false } = {}) => {
    const sprints = Array.isArray(project.sprints) ? project.sprints : [];
    const sprint = sprints.find(item => item?.name === task.sprintName);
    if (!sprint) {
        return 'Choose a sprint that belongs to this project.';
    }
    if (!sprint.assigneeFirebaseUid && !allowLegacyTaskAssignee) {
        return 'Assign an accepted invitee as the sprint lead before creating tasks in this sprint.';
    }
    if (
        sprint.assigneeFirebaseUid &&
        sprint.assigneeFirebaseUid !== task.assigneeFirebaseUid
    ) {
        return 'Tasks must be assigned to the accepted invitee assigned to their sprint.';
    }

    const assignee = await query(
        `
            SELECT 1
            FROM project_invitations
            WHERE project_id = $1
              AND invited_firebase_uid = $2
              AND status = 'accepted'
            LIMIT 1
        `,
        [project.project_id, task.assigneeFirebaseUid]
    );
    if (!assignee.rowCount) {
        return 'Tasks can only be assigned to users who accepted an invitation to this project.';
    }
    return null;
};

const getProjectTasks = async (req, res) => {
    try {
        const project = await getProjectAndCheckAccess(req.params.projectId, req.firebaseUid);
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
                    t.task_id,
                    t.project_id,
                    p.name AS project_name,
                    t.title,
                    t.description,
                    t.category,
                    t.sprint_name,
                    t.assignee_firebase_uid,
                    i.invited_name AS assignee_name,
                    i.invited_email AS assignee_email,
                    up.profile_image AS assignee_profile_image,
                    t.status,
                    t.start_date,
                    t.due_date,
                    t.created_at,
                    t.updated_at
                FROM project_tasks t
                JOIN projects p ON p.project_id = t.project_id
                LEFT JOIN LATERAL (
                    SELECT invited_name, invited_email
                    FROM project_invitations
                    WHERE project_id = t.project_id
                      AND invited_firebase_uid = t.assignee_firebase_uid
                    ORDER BY created_at DESC
                    LIMIT 1
                ) i ON TRUE
                LEFT JOIN user_profiles up
                  ON up.firebase_uid = t.assignee_firebase_uid
                WHERE t.project_id = $1
                ORDER BY t.created_at, t.title
            `,
            [project.project_id]
        );
        return res.status(200).json({
            success: true,
            data: { tasks: result.rows }
        });
    } catch (error) {
        console.error('Get project tasks error:', error);
        return res.status(500).json({
            success: false,
            code: 'PROJECT_TASKS_FETCH_FAILED',
            message: 'Project tasks could not be retrieved.'
        });
    }
};

const createProjectTask = async (req, res) => {
    const normalized = normalizeTaskInput(req.body);
    if (normalized.error) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_TASK',
            message: normalized.error
        });
    }

    try {
        const project = await getProjectAndCheckAccess(req.params.projectId, req.firebaseUid, true);
        if (!project) {
            return res.status(404).json({
                success: false,
                code: 'PROJECT_NOT_FOUND',
                message: 'Project not found or you are not its creator.'
            });
        }
        const assignmentError = await validateAssignmentAndSprint(project, normalized.value);
        if (assignmentError) {
            return res.status(400).json({
                success: false,
                code: 'INVALID_TASK_ASSIGNMENT',
                message: assignmentError
            });
        }

        const taskId = randomUUID();
        const result = await query(
            `
                INSERT INTO project_tasks (
                    task_id, project_id, title, description, category, sprint_name,
                    assignee_firebase_uid, status, start_date, due_date,
                    created_by_firebase_uid
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                RETURNING task_id
            `,
            [
                taskId,
                project.project_id,
                normalized.value.title,
                normalized.value.description,
                normalized.value.category,
                normalized.value.sprintName,
                normalized.value.assigneeFirebaseUid,
                normalized.value.status,
                normalized.value.startDate,
                normalized.value.dueDate,
                req.firebaseUid
            ]
        );

        return res.status(201).json({
            success: true,
            data: { taskId: result.rows[0].task_id }
        });
    } catch (error) {
        console.error('Create project task error:', error);
        return res.status(500).json({
            success: false,
            code: 'PROJECT_TASK_CREATE_FAILED',
            message: 'The project task could not be created.'
        });
    }
};

const updateProjectTask = async (req, res) => {
    if (!uuidPattern.test(req.params.taskId)) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_TASK_ID',
            message: 'Task ID is invalid.'
        });
    }
    const normalized = normalizeTaskInput(req.body);
    if (normalized.error) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_TASK',
            message: normalized.error
        });
    }

    try {
        const project = await getProjectAndCheckAccess(req.params.projectId, req.firebaseUid, true);
        if (!project) {
            return res.status(404).json({
                success: false,
                code: 'PROJECT_NOT_FOUND',
                message: 'Project not found or you are not its creator.'
            });
        }
        const assignmentError = await validateAssignmentAndSprint(project, normalized.value, {
            allowLegacyTaskAssignee: true
        });
        if (assignmentError) {
            return res.status(400).json({
                success: false,
                code: 'INVALID_TASK_ASSIGNMENT',
                message: assignmentError
            });
        }

        const result = await query(
            `
                UPDATE project_tasks
                SET title = $1,
                    description = $2,
                    category = $3,
                    sprint_name = $4,
                    assignee_firebase_uid = $5,
                    status = $6,
                    start_date = $7,
                    due_date = $8,
                    updated_at = NOW()
                WHERE project_id = $9
                  AND task_id = $10::uuid
                RETURNING task_id
            `,
            [
                normalized.value.title,
                normalized.value.description,
                normalized.value.category,
                normalized.value.sprintName,
                normalized.value.assigneeFirebaseUid,
                normalized.value.status,
                normalized.value.startDate,
                normalized.value.dueDate,
                project.project_id,
                req.params.taskId
            ]
        );
        if (!result.rowCount) {
            return res.status(404).json({
                success: false,
                code: 'TASK_NOT_FOUND',
                message: 'Task not found.'
            });
        }
        return res.status(200).json({
            success: true,
            data: { taskId: result.rows[0].task_id }
        });
    } catch (error) {
        console.error('Update project task error:', error);
        return res.status(500).json({
            success: false,
            code: 'PROJECT_TASK_UPDATE_FAILED',
            message: 'The project task could not be updated.'
        });
    }
};

const updateProjectTaskStatus = async (req, res) => {
    if (!uuidPattern.test(req.params.taskId)) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_TASK_ID',
            message: 'Task ID is invalid.'
        });
    }
    const status = typeof req.body?.status === 'string' ? req.body.status.trim() : '';
    if (!allowedStatuses.has(status)) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_TASK_STATUS',
            message: 'Choose a valid task status.'
        });
    }

    try {
        const project = await getProjectAndCheckAccess(req.params.projectId, req.firebaseUid);
        if (!project) {
            return res.status(404).json({
                success: false,
                code: 'PROJECT_NOT_FOUND',
                message: 'Project not found.'
            });
        }

        const taskResult = await query(
            `
                SELECT assignee_firebase_uid
                FROM project_tasks
                WHERE project_id = $1
                  AND task_id = $2::uuid
                LIMIT 1
            `,
            [project.project_id, req.params.taskId]
        );
        if (!taskResult.rowCount) {
            return res.status(404).json({
                success: false,
                code: 'TASK_NOT_FOUND',
                message: 'Task not found.'
            });
        }
        if (
            project.creator_firebase_uid !== req.firebaseUid &&
            taskResult.rows[0].assignee_firebase_uid !== req.firebaseUid
        ) {
            return res.status(403).json({
                success: false,
                code: 'TASK_UPDATE_FORBIDDEN',
                message: 'Only the project creator or assigned invitee can update this task status.'
            });
        }

        await query(
            `
                UPDATE project_tasks
                SET status = $1, updated_at = NOW()
                WHERE project_id = $2
                  AND task_id = $3::uuid
            `,
            [status, project.project_id, req.params.taskId]
        );
        return res.status(200).json({
            success: true,
            data: { taskId: req.params.taskId, status }
        });
    } catch (error) {
        console.error('Update project task status error:', error);
        return res.status(500).json({
            success: false,
            code: 'PROJECT_TASK_STATUS_UPDATE_FAILED',
            message: 'The project task status could not be updated.'
        });
    }
};

const deleteProjectTask = async (req, res) => {
    if (!uuidPattern.test(req.params.taskId)) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_TASK_ID',
            message: 'Task ID is invalid.'
        });
    }
    try {
        const project = await getProjectAndCheckAccess(req.params.projectId, req.firebaseUid, true);
        if (!project) {
            return res.status(404).json({
                success: false,
                code: 'PROJECT_NOT_FOUND',
                message: 'Project not found or you are not its creator.'
            });
        }
        const result = await query(
            `
                DELETE FROM project_tasks
                WHERE project_id = $1
                  AND task_id = $2::uuid
                RETURNING task_id
            `,
            [project.project_id, req.params.taskId]
        );
        if (!result.rowCount) {
            return res.status(404).json({
                success: false,
                code: 'TASK_NOT_FOUND',
                message: 'Task not found.'
            });
        }
        return res.status(200).json({
            success: true,
            data: { taskId: result.rows[0].task_id }
        });
    } catch (error) {
        console.error('Delete project task error:', error);
        return res.status(500).json({
            success: false,
            code: 'PROJECT_TASK_DELETE_FAILED',
            message: 'The project task could not be deleted.'
        });
    }
};

module.exports = {
    createProjectTask,
    deleteProjectTask,
    getProjectTasks,
    updateProjectTask,
    updateProjectTaskStatus
};
