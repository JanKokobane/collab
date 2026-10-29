const { randomUUID } = require('node:crypto');
const { pool, query } = require('../config/db');

const allowedStatuses = new Set(['Backlog', 'To do', 'In progress', 'Blocked', 'Done']);
const allowedPriorities = new Set(['low', 'medium', 'high']);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maxTaskAttachmentBytes = 8 * 1024 * 1024;
const attachmentDataUrlPattern = /^data:[^;,]+(?:;codecs=[^;,]+)?;base64,([a-zA-Z0-9+/=]+)$/i;
const validTaskAttachments = attachments => {
    if (!Array.isArray(attachments) || attachments.length > 10) return false;
    let totalBytes = 0;
    for (const item of attachments) {
        if (!item || typeof item.fileName !== 'string' || !item.fileName.trim() ||
            item.fileName.length > 255 || typeof item.mediaType !== 'string' ||
            item.mediaType.length > 128 || typeof item.data !== 'string') return false;
        const encoded = attachmentDataUrlPattern.exec(item.data)?.[1];
        if (!encoded) return false;
        const bytes = Buffer.from(encoded, 'base64').length;
        if (!Number.isSafeInteger(item.size) || item.size !== bytes) return false;
        totalBytes += bytes;
        if (totalBytes > maxTaskAttachmentBytes) return false;
    }
    return true;
};
const withTransaction = async callback => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};
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
    const priority = typeof body?.priority === 'string'
        ? body.priority.trim().toLowerCase()
        : 'medium';
    const startDate = body?.startDate || null;
    const dueDate = body?.dueDate || null;
    const chatMessageId = body?.chatMessageId || null;
    const descriptionAttachments = body?.descriptionAttachments ?? [];

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
        return { error: 'Choose the project owner or an accepted project invitee to assign this task to.' };
    }
    if (!allowedStatuses.has(status)) {
        return { error: 'Choose a valid task status.' };
    }
    if (!allowedPriorities.has(priority)) {
        return { error: 'Choose a valid task priority.' };
    }
    if (chatMessageId !== null && !uuidPattern.test(chatMessageId)) {
        return { error: 'The discussion message reference is invalid.' };
    }
    if (!validTaskAttachments(descriptionAttachments)) {
        return { error: 'Task media must be valid attachments totaling 8 MB or less.' };
    }
    if (!isValidDate(startDate) || !isValidDate(dueDate)) {
        return { error: 'Task dates must use YYYY-MM-DD format.' };
    }
    const today = new Date().toISOString().slice(0, 10);
    if ([startDate, dueDate].some(date => date && date < today)) {
        return { error: 'Task start and due dates cannot be in the past.' };
    }

    return {
        value: {
            title,
            description,
            category,
            sprintName,
            assigneeFirebaseUid,
            status,
            priority,
            startDate,
            dueDate,
            chatMessageId,
            descriptionAttachments
        }
    };
};

const validateChatMessageLink = async (projectId, messageId, firebaseUid) => {
    if (!messageId) return null;
    const result = await query(
        `SELECT 1
         FROM messages msg
         JOIN message_conversations conversation
           ON conversation.conversation_id = msg.conversation_id
         WHERE msg.message_id = $1::uuid
           AND conversation.project_id = $2
           AND EXISTS (
               SELECT 1 FROM message_conversation_members member
               WHERE member.conversation_id = conversation.conversation_id
                 AND member.firebase_uid = $3
           )
                     AND NOT EXISTS (
                             SELECT 1 FROM message_conversation_user_state state
                             WHERE state.conversation_id = conversation.conversation_id
                                 AND state.firebase_uid = $3
                                 AND state.hidden_at IS NOT NULL
                     )
         LIMIT 1`,
        [messageId, projectId, firebaseUid]
    );
    return result.rowCount
        ? null
        : 'The linked message must be in an accessible conversation for this project.';
};

const markDependencyWarnings = async (taskId, reason, actorUid, taskTitle) => {
    const updated = await query(
        `UPDATE task_dependencies
         SET warning_reason = CASE
             WHEN $2 = 'blocked_and_due_date_postponed' THEN $2
             WHEN warning_reason = 'blocked_and_due_date_postponed' THEN warning_reason
             WHEN $2 = 'blocked' AND warning_reason = 'due_date_postponed'
                 THEN 'blocked_and_due_date_postponed'
             WHEN $2 = 'due_date_postponed' AND warning_reason = 'blocked'
                 THEN 'blocked_and_due_date_postponed'
             ELSE $2
         END
         WHERE predecessor_task_id = $1::uuid
                     AND (
                           $2 IN ('blocked', 'blocked_and_due_date_postponed')
                             OR warning_reason IS NULL
                             OR ($2 = 'due_date_postponed' AND warning_reason = 'blocked')
                     )
         RETURNING dependent_task_id`,
        [taskId, reason]
    );
    if (!updated.rowCount) return;
    const dependentIds = [...new Set(updated.rows.map(row => row.dependent_task_id))];
    await query(
        `INSERT INTO notifications (
             recipient_firebase_uid, project_id, related_task_id,
             type, title, detail, avatar, tone_class
         )
         SELECT DISTINCT dependent.assignee_firebase_uid,
                dependent.project_id,
                dependent.task_id,
                'task_dependency_warning',
                'Task dependency needs attention',
                $2,
                '!',
                'orange-bg'
         FROM project_tasks dependent
         WHERE dependent.task_id = ANY($1::uuid[])
           AND dependent.assignee_firebase_uid <> $3`,
        [
            dependentIds,
            reason === 'blocked'
                ? `A predecessor task for "${taskTitle}" is now blocked.`
                : reason === 'blocked_and_due_date_postponed'
                    ? `A predecessor task for "${taskTitle}" is blocked and has a later due date.`
                    : `A predecessor task for "${taskTitle}" has a later due date.`,
            actorUid
        ]
    );
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
        return 'Assign a project member as the sprint lead before creating tasks in this sprint.';
    }
    if (
        sprint.assigneeFirebaseUid &&
        sprint.assigneeFirebaseUid !== task.assigneeFirebaseUid
    ) {
        return 'Tasks must be assigned to the project member assigned to their sprint.';
    }

    if (task.assigneeFirebaseUid === project.creator_firebase_uid) {
        return null;
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
        return 'Tasks can only be assigned to the project owner or users who accepted an invitation to this project.';
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
                    t.chat_message_id::text AS chat_message_id,
                    context_message.conversation_id::text AS chat_conversation_id,
                    COALESCE((
                        SELECT jsonb_agg(attachment.value - 'data')
                        FROM jsonb_array_elements(t.description_attachments) AS attachment(value)
                    ), '[]'::jsonb) AS description_attachments,
                    t.assignee_firebase_uid,
                    i.invited_name AS assignee_name,
                    i.invited_email AS assignee_email,
                    up.profile_image AS assignee_profile_image,
                    t.status,
                    t.priority,
                    COALESCE(dependencies.items, '[]'::jsonb) AS dependencies,
                    COALESCE(dependencies.has_warning, FALSE) AS has_dependency_warning,
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
                LEFT JOIN messages context_message
                  ON context_message.message_id = t.chat_message_id
                 AND EXISTS (
                     SELECT 1
                     FROM message_conversation_members member
                     WHERE member.conversation_id = context_message.conversation_id
                       AND member.firebase_uid = $2
                 )
                 AND NOT EXISTS (
                     SELECT 1
                     FROM message_conversation_user_state state
                     WHERE state.conversation_id = context_message.conversation_id
                       AND state.firebase_uid = $2
                       AND state.hidden_at IS NOT NULL
                 )
                LEFT JOIN LATERAL (
                    SELECT
                        jsonb_agg(jsonb_build_object(
                            'task_id', predecessor.task_id,
                            'project_id', predecessor.project_id,
                            'title', predecessor.title,
                            'status', predecessor.status,
                            'warning_reason', dependency.warning_reason
                        ) ORDER BY predecessor.title) AS items,
                        bool_or(dependency.warning_reason IS NOT NULL) AS has_warning
                    FROM task_dependencies dependency
                    JOIN project_tasks predecessor
                      ON predecessor.task_id = dependency.predecessor_task_id
                    WHERE dependency.dependent_task_id = t.task_id
                      AND (
                          EXISTS (
                              SELECT 1 FROM projects own
                              WHERE own.project_id = predecessor.project_id
                                AND own.creator_firebase_uid = $2
                          )
                          OR EXISTS (
                              SELECT 1 FROM project_invitations access
                              WHERE access.project_id = predecessor.project_id
                                AND access.invited_firebase_uid = $2
                                AND access.status = 'accepted'
                          )
                      )
                ) dependencies ON TRUE
                WHERE t.project_id = $1
                ORDER BY t.created_at, t.title
            `,
            [project.project_id, req.firebaseUid]
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

const getProjectTaskDetails = async (req, res) => {
    if (!uuidPattern.test(req.params.taskId || '')) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_TASK_ID',
            message: 'Task ID is invalid.'
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
        const result = await query(
            `SELECT task.task_id, task.project_id, task.title, task.description,
                    task.category, task.sprint_name, task.assignee_firebase_uid,
                    task.status, task.priority, task.start_date, task.due_date,
                    task.chat_message_id::text AS chat_message_id,
                    message.conversation_id::text AS chat_conversation_id,
                    task.description_attachments, task.created_at, task.updated_at
             FROM project_tasks task
                         LEFT JOIN messages message
                             ON message.message_id = task.chat_message_id
                            AND EXISTS (
                                    SELECT 1 FROM message_conversation_members member
                                    WHERE member.conversation_id = message.conversation_id
                                        AND member.firebase_uid = $3
                            )
                            AND NOT EXISTS (
                                    SELECT 1 FROM message_conversation_user_state state
                                    WHERE state.conversation_id = message.conversation_id
                                        AND state.firebase_uid = $3
                                        AND state.hidden_at IS NOT NULL
                            )
             WHERE task.project_id = $1 AND task.task_id = $2::uuid
             LIMIT 1`,
                        [project.project_id, req.params.taskId, req.firebaseUid]
        );
        if (!result.rowCount) {
            return res.status(404).json({
                success: false,
                code: 'TASK_NOT_FOUND',
                message: 'Task not found.'
            });
        }
        return res.status(200).json({ success: true, data: { task: result.rows[0] } });
    } catch (error) {
        console.error('Get project task details error:', error);
        return res.status(500).json({
            success: false,
            code: 'PROJECT_TASK_DETAILS_FETCH_FAILED',
            message: 'Task details could not be retrieved.'
        });
    }
};

const getProjectTaskComments = async (req, res) => {
    if (!uuidPattern.test(req.params.taskId)) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_TASK_ID',
            message: 'Task ID is invalid.'
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

        const task = await query(
            'SELECT 1 FROM project_tasks WHERE project_id = $1 AND task_id = $2::uuid LIMIT 1',
            [project.project_id, req.params.taskId]
        );
        if (!task.rowCount) {
            return res.status(404).json({
                success: false,
                code: 'TASK_NOT_FOUND',
                message: 'Task not found.'
            });
        }

        const result = await query(
            `
                SELECT
                    task_comment.comment_id,
                    task_comment.author_firebase_uid,
                    task_comment.author_name,
                    task_comment.author_email,
                    COALESCE(author_profile.profile_image, '') AS author_profile_image,
                    task_comment.body,
                    task_comment.attachments,
                    task_comment.created_at
                FROM project_task_comments task_comment
                LEFT JOIN user_profiles author_profile
                  ON author_profile.firebase_uid = task_comment.author_firebase_uid
                WHERE task_comment.task_id = $1::uuid
                ORDER BY task_comment.created_at, task_comment.comment_id
            `,
            [req.params.taskId]
        );
        return res.status(200).json({
            success: true,
            data: { comments: result.rows }
        });
    } catch (error) {
        console.error('Get project task comments error:', error);
        return res.status(500).json({
            success: false,
            code: 'PROJECT_TASK_COMMENTS_FETCH_FAILED',
            message: 'Task comments could not be retrieved.'
        });
    }
};

const createProjectTaskComment = async (req, res) => {
    if (!uuidPattern.test(req.params.taskId)) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_TASK_ID',
            message: 'Task ID is invalid.'
        });
    }
    const body = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    const attachments = req.body?.attachments ?? [];
    if ((!body && (!Array.isArray(attachments) || !attachments.length)) ||
        body.length > 5000 || !validTaskAttachments(attachments)) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_TASK_COMMENT',
            message: 'Add comment text or valid media attachments totaling 8 MB or less.'
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

        const authorName =
            req.firebaseUser?.name ||
            req.firebaseUser?.displayName ||
            req.firebaseEmail ||
            'Project member';
        const result = await query(
            `
                INSERT INTO project_task_comments (
                    task_id,
                    author_firebase_uid,
                    author_name,
                    author_email,
                    body,
                    attachments
                )
                SELECT
                    task_id,
                    $3,
                    $4,
                    $5,
                    $6,
                    $7::jsonb
                FROM project_tasks
                WHERE project_id = $1
                  AND task_id = $2::uuid
                RETURNING
                    comment_id,
                    author_firebase_uid,
                    author_name,
                    author_email,
                    body,
                    attachments,
                    created_at
            `,
            [
                project.project_id,
                req.params.taskId,
                req.firebaseUid,
                authorName,
                req.firebaseEmail,
                body,
                JSON.stringify(attachments)
            ]
        );
        if (!result.rowCount) {
            return res.status(404).json({
                success: false,
                code: 'TASK_NOT_FOUND',
                message: 'Task not found.'
            });
        }
        return res.status(201).json({
            success: true,
            data: { comment: result.rows[0] }
        });
    } catch (error) {
        console.error('Create project task comment error:', error);
        return res.status(500).json({
            success: false,
            code: 'PROJECT_TASK_COMMENT_CREATE_FAILED',
            message: 'The comment could not be posted.'
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
        const project = await getProjectAndCheckAccess(req.params.projectId, req.firebaseUid);
        if (!project) {
            return res.status(404).json({
                success: false,
                code: 'PROJECT_NOT_FOUND',
                message: 'Project not found or you are not an accepted project member.'
            });
        }
        if (normalized.value.status !== 'To do') {
            return res.status(400).json({
                success: false,
                code: 'INVALID_TASK_STATUS',
                message: 'New project tasks must start in To do.'
            });
        }
        const messageLinkError = await validateChatMessageLink(
            project.project_id,
            normalized.value.chatMessageId,
            req.firebaseUid
        );
        if (messageLinkError) {
            return res.status(400).json({
                success: false,
                code: 'INVALID_TASK_MESSAGE_LINK',
                message: messageLinkError
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
                    created_by_firebase_uid, chat_message_id, description_attachments,
                    priority
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::uuid, $13::jsonb, $14)
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
                req.firebaseUid,
                normalized.value.chatMessageId,
                JSON.stringify(normalized.value.descriptionAttachments),
                normalized.value.priority
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

        const messageLinkError = await validateChatMessageLink(
            project.project_id,
            normalized.value.chatMessageId,
            req.firebaseUid
        );
        if (messageLinkError) {
            return res.status(400).json({
                success: false,
                code: 'INVALID_TASK_MESSAGE_LINK',
                message: messageLinkError
            });
        }

        const previousTask = await query(
            `SELECT due_date, status, title FROM project_tasks
             WHERE project_id = $1 AND task_id = $2::uuid LIMIT 1`,
            [project.project_id, req.params.taskId]
        );
        if (!previousTask.rowCount) {
            return res.status(404).json({
                success: false,
                code: 'TASK_NOT_FOUND',
                message: 'Task not found.'
            });
        }
        if (
            previousTask.rows[0].status === 'In progress' &&
            normalized.value.status !== previousTask.rows[0].status
        ) {
            const sprints = Array.isArray(project.sprints) ? project.sprints : [];
            if (!sprints.length || sprints.some(sprint => sprint.status !== 'Completed')) {
                return res.status(409).json({
                    success: false,
                    code: 'PROJECT_SPRINTS_INCOMPLETE',
                    message: 'This in-progress task cannot be moved until every project sprint is complete.'
                });
            }
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
                    priority = $7,
                    start_date = $8,
                    due_date = $9,
                    deadline_warning_sent_at = CASE
                        WHEN due_date IS DISTINCT FROM $9::date THEN NULL
                        ELSE deadline_warning_sent_at
                    END,
                    deadline_blocked_at = CASE
                        WHEN due_date IS DISTINCT FROM $9::date THEN NULL
                        ELSE deadline_blocked_at
                    END,
                    chat_message_id = $10::uuid,
                    description_attachments = $11::jsonb,
                    updated_at = NOW()
                                WHERE project_id = $12
                                    AND task_id = $13::uuid
                RETURNING task_id
            `,
            [
                normalized.value.title,
                normalized.value.description,
                normalized.value.category,
                normalized.value.sprintName,
                normalized.value.assigneeFirebaseUid,
                normalized.value.status,
                normalized.value.priority,
                normalized.value.startDate,
                normalized.value.dueDate,
                normalized.value.chatMessageId,
                JSON.stringify(normalized.value.descriptionAttachments),
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
        const previousDueDate = previousTask.rows[0].due_date
            ? new Date(previousTask.rows[0].due_date).toISOString().slice(0, 10)
            : null;
        const newlyBlocked = normalized.value.status === 'Blocked' &&
            previousTask.rows[0].status !== 'Blocked';
        const dueDatePostponed = Boolean(normalized.value.dueDate && previousDueDate &&
            normalized.value.dueDate > previousDueDate);
        if (!dueDatePostponed && previousDueDate &&
            (!normalized.value.dueDate || normalized.value.dueDate <= previousDueDate)) {
            await query(
                `UPDATE task_dependencies
                 SET warning_reason = CASE
                     WHEN warning_reason = 'blocked_and_due_date_postponed' THEN 'blocked'
                     ELSE NULL
                 END
                 WHERE predecessor_task_id = $1::uuid
                   AND warning_reason IN ('due_date_postponed', 'blocked_and_due_date_postponed')`,
                [req.params.taskId]
            );
        }
        if (newlyBlocked || dueDatePostponed) {
            await markDependencyWarnings(
                req.params.taskId,
                newlyBlocked && dueDatePostponed
                    ? 'blocked_and_due_date_postponed'
                    : newlyBlocked ? 'blocked' : 'due_date_postponed',
                req.firebaseUid,
                previousTask.rows[0].title
            );
        }
        if (previousTask.rows[0].status === 'Blocked' && normalized.value.status !== 'Blocked') {
            await query(
                `UPDATE task_dependencies
                 SET warning_reason = CASE
                     WHEN warning_reason = 'blocked_and_due_date_postponed' THEN 'due_date_postponed'
                     ELSE NULL
                 END
                 WHERE predecessor_task_id = $1::uuid
                   AND warning_reason IN ('blocked', 'blocked_and_due_date_postponed')`,
                [req.params.taskId]
            );
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

        const existingTask = await query(
            `
                SELECT task_id, assignee_firebase_uid, status, title
                FROM project_tasks
                WHERE project_id = $1
                  AND task_id = $2::uuid
                LIMIT 1
            `,
            [project.project_id, req.params.taskId]
        );
        if (!existingTask.rowCount) {
            return res.status(404).json({
                success: false,
                code: 'TASK_NOT_FOUND',
                message: 'Task not found.'
            });
        }
        const isProjectOwner = project.creator_firebase_uid === req.firebaseUid;
        const isAssignee = existingTask.rows[0].assignee_firebase_uid === req.firebaseUid;
        if (!isProjectOwner && !isAssignee) {
            return res.status(403).json({
                success: false,
                code: 'TASK_STATUS_UPDATE_FORBIDDEN',
                message: 'Only the project owner or assigned user can move this task.'
            });
        }

        if (
            existingTask.rows[0].status === 'In progress' &&
            status !== existingTask.rows[0].status
        ) {
            const sprints = Array.isArray(project.sprints) ? project.sprints : [];
            if (!sprints.length || sprints.some(sprint => sprint.status !== 'Completed')) {
                return res.status(409).json({
                    success: false,
                    code: 'PROJECT_SPRINTS_INCOMPLETE',
                    message: 'This in-progress task cannot be moved until every project sprint is complete.'
                });
            }
        }

        const result = await query(
            `
                UPDATE project_tasks
                SET status = $1, updated_at = NOW()
                WHERE project_id = $2
                  AND task_id = $3::uuid
                RETURNING task_id
            `,
            [status, project.project_id, req.params.taskId]
        );
        if (!result.rowCount) {
            return res.status(404).json({
                success: false,
                code: 'TASK_NOT_FOUND',
                message: 'Task not found.'
            });
        }
        if (status === 'Blocked' && existingTask.rows[0].status !== 'Blocked') {
            await markDependencyWarnings(
                req.params.taskId,
                'blocked',
                req.firebaseUid,
                existingTask.rows[0].title
            );
        } else if (status !== 'Blocked' && existingTask.rows[0].status === 'Blocked') {
            await query(
                                `UPDATE task_dependencies
                                 SET warning_reason = CASE
                                         WHEN warning_reason = 'blocked_and_due_date_postponed' THEN 'due_date_postponed'
                                         ELSE NULL
                                 END
                                 WHERE predecessor_task_id = $1::uuid
                                     AND warning_reason IN ('blocked', 'blocked_and_due_date_postponed')`,
                [req.params.taskId]
            );
        }
        return res.status(200).json({
            success: true,
            data: { taskId: result.rows[0].task_id, status }
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

const getProjectTaskDependencies = async (req, res) => {
    if (!uuidPattern.test(req.params.taskId || '')) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_TASK_ID',
            message: 'Task ID is invalid.'
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
        const result = await query(
            `SELECT predecessor.task_id, predecessor.project_id, predecessor.title,
                    predecessor.status, predecessor.due_date, dependency.warning_reason
             FROM task_dependencies dependency
             JOIN project_tasks dependent
               ON dependent.task_id = dependency.dependent_task_id
             JOIN project_tasks predecessor
               ON predecessor.task_id = dependency.predecessor_task_id
             WHERE dependent.project_id = $1
               AND dependent.task_id = $2::uuid
               AND (
                   EXISTS (SELECT 1 FROM projects own
                           WHERE own.project_id = predecessor.project_id
                             AND own.creator_firebase_uid = $3)
                   OR EXISTS (SELECT 1 FROM project_invitations access
                              WHERE access.project_id = predecessor.project_id
                                AND access.invited_firebase_uid = $3
                                AND access.status = 'accepted')
               )
             ORDER BY predecessor.title`,
            [project.project_id, req.params.taskId, req.firebaseUid]
        );
        return res.status(200).json({ success: true, data: { dependencies: result.rows } });
    } catch (error) {
        console.error('Get task dependencies error:', error);
        return res.status(500).json({
            success: false,
            code: 'TASK_DEPENDENCIES_FETCH_FAILED',
            message: 'Task dependencies could not be retrieved.'
        });
    }
};

const updateProjectTaskDependencies = async (req, res) => {
    if (!uuidPattern.test(req.params.taskId || '')) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_TASK_ID',
            message: 'Task ID is invalid.'
        });
    }
    const requested = Array.isArray(req.body?.predecessorTaskIds)
        ? [...new Set(req.body.predecessorTaskIds)]
        : null;
    if (!requested || requested.length > 50 ||
        requested.some(taskId => !uuidPattern.test(taskId || '')) ||
        requested.includes(req.params.taskId)) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_TASK_DEPENDENCIES',
            message: 'Choose up to 50 valid predecessor tasks other than this task.'
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
        const dependent = await query(
            'SELECT task_id FROM project_tasks WHERE project_id = $1 AND task_id = $2::uuid LIMIT 1',
            [project.project_id, req.params.taskId]
        );
        if (!dependent.rowCount) {
            return res.status(404).json({
                success: false,
                code: 'TASK_NOT_FOUND',
                message: 'Task not found.'
            });
        }
        const accessiblePredecessors = requested.length
            ? await query(
                `SELECT task.task_id
                 FROM project_tasks task
                 WHERE task.task_id = ANY($1::uuid[])
                   AND (
                       EXISTS (SELECT 1 FROM projects own
                               WHERE own.project_id = task.project_id
                                 AND own.creator_firebase_uid = $2)
                       OR EXISTS (SELECT 1 FROM project_invitations access
                                  WHERE access.project_id = task.project_id
                                    AND access.invited_firebase_uid = $2
                                    AND access.status = 'accepted')
                   )`,
                [requested, req.firebaseUid]
            )
            : { rows: [] };
        if (accessiblePredecessors.rowCount !== requested.length) {
            return res.status(403).json({
                success: false,
                code: 'TASK_DEPENDENCY_ACCESS_DENIED',
                message: 'Every predecessor must be a task in a project you can access.'
            });
        }
        if (requested.length) {
            const cycle = await query(
                `WITH RECURSIVE downstream(task_id) AS (
                     SELECT dependent_task_id
                     FROM task_dependencies
                     WHERE predecessor_task_id = $1::uuid
                     UNION
                     SELECT dependency.dependent_task_id
                     FROM task_dependencies dependency
                     JOIN downstream path ON dependency.predecessor_task_id = path.task_id
                 )
                 SELECT EXISTS (
                     SELECT 1 FROM downstream WHERE task_id = ANY($2::uuid[])
                 ) AS creates_cycle`,
                [req.params.taskId, requested]
            );
            if (cycle.rows[0]?.creates_cycle) {
                return res.status(400).json({
                    success: false,
                    code: 'TASK_DEPENDENCY_CYCLE',
                    message: 'This dependency would create a task cycle.'
                });
            }
        }

        await withTransaction(async client => {
            await client.query(
                'DELETE FROM task_dependencies WHERE dependent_task_id = $1::uuid',
                [req.params.taskId]
            );
            if (requested.length) {
                await client.query(
                    `INSERT INTO task_dependencies (
                         predecessor_task_id, dependent_task_id, created_by_firebase_uid
                     )
                     SELECT predecessor_id, $2::uuid, $3
                     FROM unnest($1::uuid[]) AS ids(predecessor_id)`,
                    [requested, req.params.taskId, req.firebaseUid]
                );
            }
        });
        return res.status(200).json({ success: true, data: { predecessorTaskIds: requested } });
    } catch (error) {
        console.error('Update task dependencies error:', error);
        return res.status(500).json({
            success: false,
            code: 'TASK_DEPENDENCIES_UPDATE_FAILED',
            message: 'Task dependencies could not be saved.'
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
    createProjectTaskComment,
    deleteProjectTask,
    getProjectTaskDependencies,
    getProjectTaskComments,
    getProjectTaskDetails,
    getProjectTasks,
    updateProjectTaskDependencies,
    updateProjectTask,
    updateProjectTaskStatus
};
