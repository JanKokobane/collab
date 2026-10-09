const { pool, query } = require('../config/db');

/**
 * Create a project
 * POST /api/projects
 */
const createProject = async (req, res) => {
    let client;
    try {
        const creatorFirebaseUid = req.firebaseUid;

        if (!creatorFirebaseUid) {
            return res.status(401).json({
                success: false,
                code: 'AUTHENTICATION_REQUIRED',
                message: 'Authenticated user information is missing.'
            });
        }

        const {
            project_id,
            name,
            project_type,
            time_span,
            description,
            color,
            invited_members,
            sprints
        } = req.body;

        if (
            typeof name !== 'string' ||
            !name.trim()
        ) {
            return res.status(400).json({
                success: false,
                code: 'PROJECT_NAME_REQUIRED',
                message: 'Project name is required.'
            });
        }

        const cleanName = name.trim();

        if (cleanName.length > 255) {
            return res.status(400).json({
                success: false,
                code: 'PROJECT_NAME_TOO_LONG',
                message: 'Project name cannot exceed 255 characters.'
            });
        }

        const projectId =
            typeof project_id === 'string' &&
            project_id.trim()
                ? project_id.trim()
                : `p_${Date.now()}`;

        const projectType =
            typeof project_type === 'string' &&
            project_type.trim()
                ? project_type.trim()
                : 'General Collaboration';

        const timeSpan =
            typeof time_span === 'string' &&
            time_span.trim()
                ? time_span.trim()
                : 'Ongoing';

        const projectDescription =
            typeof description === 'string'
                ? description.trim()
                : null;

        const projectColor =
            typeof color === 'string' &&
            color.trim()
                ? color.trim()
                : 'coral';

        const invitedMembers =
            Array.isArray(invited_members)
                ? invited_members
                : [];

        const projectSprints =
            Array.isArray(sprints)
                ? sprints
                : [
                    {
                        id: `s_${Date.now()}_1`,
                        name: 'Sprint 1: Kickoff & Scoping',
                        status: 'Active'
                    },
                    {
                        id: `s_${Date.now()}_2`,
                        name: 'Sprint 2: Implementation',
                        status: 'Upcoming'
                    }
                ];

        const creatorEmail =
            req.firebaseEmail ||
            req.firebaseUser?.email ||
            null;

        const creatorName =
            req.firebaseUser?.name ||
            req.firebaseUser?.displayName ||
            null;

        const creatorInitials =
            creatorName
                ? creatorName
                    .split(/\s+/)
                    .filter(Boolean)
                    .map(part => part[0])
                    .join('')
                    .slice(0, 10)
                    .toUpperCase()
                : null;

        const sql = `
            INSERT INTO projects (
                project_id,
                name,
                project_type,
                time_span,
                description,
                color,
                creator_firebase_uid,
                creator_email,
                creator_name,
                creator_initials,
                invited_members,
                sprints
            )
            VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                $7,
                $8,
                $9,
                $10,
                $11::jsonb,
                $12::jsonb
            )
            RETURNING
                id,
                project_id,
                name,
                project_type,
                time_span,
                description,
                color,
                creator_firebase_uid,
                creator_email,
                creator_name,
                creator_initials,
                invited_members,
                sprints,
                created_at,
                updated_at
        `;

        const values = [
            projectId,
            cleanName,
            projectType,
            timeSpan,
            projectDescription,
            projectColor,
            creatorFirebaseUid,
            creatorEmail,
            creatorName,
            creatorInitials,
            JSON.stringify(invitedMembers),
            JSON.stringify(projectSprints)
        ];

        client = await pool.connect();
        await client.query('BEGIN');
        const result = await client.query(sql, values);
        const notificationResult = await client.query(
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
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING
                    id,
                    project_id,
                    type,
                    title,
                    detail,
                    avatar,
                    tone_class,
                    is_read,
                    created_at
            `,
            [
                creatorFirebaseUid,
                projectId,
                'project_created',
                'Project created',
                `"${cleanName}" was created successfully.`,
                creatorInitials || '📁',
                'blue-bg'
            ]
        );
        await client.query('COMMIT');

        return res.status(201).json({
            success: true,
            message: 'Project created successfully.',
            data: {
                project: result.rows[0],
                notification: notificationResult.rows[0]
            }
        });
    } catch (error) {
        if (client) {
            await client.query('ROLLBACK').catch(rollbackError => {
                console.error('Project creation rollback error:', rollbackError);
            });
        }
        console.error('Create project error:', error);

        if (error.code === '23505') {
            if (
                error.constraint ===
                'idx_projects_creator_name_unique'
            ) {
                return res.status(409).json({
                    success: false,
                    code: 'PROJECT_NAME_ALREADY_EXISTS',
                    message:
                        'You already have a project with this name.'
                });
            }

            if (
                error.constraint ===
                'projects_project_id_key'
            ) {
                return res.status(409).json({
                    success: false,
                    code: 'PROJECT_ID_ALREADY_EXISTS',
                    message:
                        'This project ID already exists.'
                });
            }

            return res.status(409).json({
                success: false,
                code: 'PROJECT_ALREADY_EXISTS',
                message:
                    'A project with these details already exists.'
            });
        }

        return res.status(500).json({
            success: false,
            code: 'PROJECT_CREATION_FAILED',
            message: 'The project could not be created.'
        });
    } finally {
        client?.release();
    }
};


/**
 * Get all projects belonging to the authenticated user
 * GET /api/projects
 */
const getProjects = async (req, res) => {
    try {
        const firebaseUid = req.firebaseUid;

        const sql = `
            SELECT
                id,
                project_id,
                name,
                project_type,
                time_span,
                description,
                color,
                creator_firebase_uid,
                creator_email,
                creator_name,
                creator_initials,
                invited_members,
                COALESCE(
                    (
                        SELECT json_agg(json_build_object(
                            'firebaseUid', accepted_member.invited_firebase_uid,
                            'email', accepted_member.invited_email,
                            'name', accepted_member.invited_name,
                            'role', accepted_member.role
                        ) ORDER BY accepted_member.created_at)
                        FROM (
                            SELECT DISTINCT ON (invited_firebase_uid)
                                invited_firebase_uid,
                                invited_email,
                                invited_name,
                                role,
                                created_at
                            FROM project_invitations
                            WHERE project_id = projects.project_id
                              AND status = 'accepted'
                              AND invited_firebase_uid IS NOT NULL
                            ORDER BY invited_firebase_uid, created_at DESC
                        ) accepted_member
                    ),
                    '[]'::json
                ) AS accepted_members,
                sprints,
                created_at,
                updated_at
            FROM projects
            WHERE creator_firebase_uid = $1
               OR EXISTS (
                    SELECT 1
                    FROM project_invitations pi
                    WHERE pi.project_id = projects.project_id
                      AND pi.invited_firebase_uid = $1
                      AND pi.status = 'accepted'
                )
            ORDER BY created_at DESC
        `;

        const result = await query(sql, [
            firebaseUid
        ]);

        return res.status(200).json({
            success: true,
            message: 'Projects retrieved successfully.',
            data: {
                projects: result.rows,
                count: result.rows.length
            }
        });
    } catch (error) {
        console.error('Get projects error:', error);

        return res.status(500).json({
            success: false,
            code: 'PROJECTS_FETCH_FAILED',
            message: 'Projects could not be retrieved.'
        });
    }
};


/**
 * Get one project
 * GET /api/projects/:projectId
 */
const getProject = async (req, res) => {
    try {
        const firebaseUid = req.firebaseUid;
        const { projectId } = req.params;

        if (!projectId) {
            return res.status(400).json({
                success: false,
                code: 'PROJECT_ID_REQUIRED',
                message: 'Project ID is required.'
            });
        }

        const sql = `
            SELECT
                id,
                project_id,
                name,
                project_type,
                time_span,
                description,
                color,
                creator_firebase_uid,
                creator_email,
                creator_name,
                creator_initials,
                invited_members,
                COALESCE(
                    (
                        SELECT json_agg(json_build_object(
                            'firebaseUid', accepted_member.invited_firebase_uid,
                            'email', accepted_member.invited_email,
                            'name', accepted_member.invited_name,
                            'role', accepted_member.role
                        ) ORDER BY accepted_member.created_at)
                        FROM (
                            SELECT DISTINCT ON (invited_firebase_uid)
                                invited_firebase_uid,
                                invited_email,
                                invited_name,
                                role,
                                created_at
                            FROM project_invitations
                            WHERE project_id = projects.project_id
                              AND status = 'accepted'
                              AND invited_firebase_uid IS NOT NULL
                            ORDER BY invited_firebase_uid, created_at DESC
                        ) accepted_member
                    ),
                    '[]'::json
                ) AS accepted_members,
                sprints,
                created_at,
                updated_at
            FROM projects
            WHERE project_id = $1
              AND (
                    creator_firebase_uid = $2
                    OR EXISTS (
                        SELECT 1
                        FROM project_invitations pi
                        WHERE pi.project_id = projects.project_id
                          AND pi.invited_firebase_uid = $2
                          AND pi.status = 'accepted'
                    )
              )
            LIMIT 1
        `;

        const result = await query(sql, [
            projectId,
            firebaseUid
        ]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                code: 'PROJECT_NOT_FOUND',
                message: 'Project not found.'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Project retrieved successfully.',
            data: {
                project: result.rows[0]
            }
        });
    } catch (error) {
        console.error('Get project error:', error);

        return res.status(500).json({
            success: false,
            code: 'PROJECT_FETCH_FAILED',
            message: 'The project could not be retrieved.'
        });
    }
};


/**
 * Update a project
 * PUT /api/projects/:projectId
 */
const updateProject = async (req, res) => {
    try {
        const firebaseUid = req.firebaseUid;
        const { projectId } = req.params;

        if (!projectId) {
            return res.status(400).json({
                success: false,
                code: 'PROJECT_ID_REQUIRED',
                message: 'Project ID is required.'
            });
        }

        const {
            name,
            project_type,
            time_span,
            description,
            color,
            invited_members,
            sprints,
            sprint_name_map
        } = req.body;

        /*
         * First confirm the project belongs to
         * the authenticated Firebase user.
         */
        const existingProject = await query(
            `
                SELECT *
                FROM projects
                WHERE project_id = $1
                  AND creator_firebase_uid = $2
                LIMIT 1
            `,
            [
                projectId,
                firebaseUid
            ]
        );

        if (existingProject.rows.length === 0) {
            return res.status(404).json({
                success: false,
                code: 'PROJECT_NOT_FOUND',
                message: 'Project not found.'
            });
        }

        const current = existingProject.rows[0];

        /*
         * Only update fields that were supplied.
         */
        const updatedName =
            name !== undefined
                ? String(name).trim()
                : current.name;

        if (!updatedName) {
            return res.status(400).json({
                success: false,
                code: 'PROJECT_NAME_REQUIRED',
                message: 'Project name is required.'
            });
        }

        if (updatedName.length > 255) {
            return res.status(400).json({
                success: false,
                code: 'PROJECT_NAME_TOO_LONG',
                message: 'Project name cannot exceed 255 characters.'
            });
        }

        const updatedProjectType =
            project_type !== undefined
                ? String(project_type).trim()
                : current.project_type;

        const updatedTimeSpan =
            time_span !== undefined
                ? String(time_span).trim()
                : current.time_span;

        const updatedDescription =
            description !== undefined
                ? (
                    description === null
                        ? null
                        : String(description).trim()
                )
                : current.description;

        const updatedColor =
            color !== undefined
                ? String(color).trim()
                : current.color;

        const updatedMembers =
            invited_members !== undefined
                ? invited_members
                : current.invited_members;

        const updatedSprints =
            sprints !== undefined
                ? sprints
                : current.sprints;

        if (!Array.isArray(updatedMembers)) {
            return res.status(400).json({
                success: false,
                code: 'INVALID_INVITED_MEMBERS',
                message: 'invited_members must be an array.'
            });
        }

        if (!Array.isArray(updatedSprints)) {
            return res.status(400).json({
                success: false,
                code: 'INVALID_SPRINTS',
                message: 'sprints must be an array.'
            });
        }

        let sprintNameMap = null;
        let taskSprintMap = null;
        const sprintAssignmentNotifications = [];
        if (sprints !== undefined) {
            const currentSprints = Array.isArray(current.sprints) ? current.sprints : [];
            const sprintNameEntries = sprint_name_map &&
                typeof sprint_name_map === 'object' &&
                !Array.isArray(sprint_name_map)
                ? Object.entries(sprint_name_map)
                : [];
            const oldNameByNewName = new Map(
                sprintNameEntries.map(([oldName, newName]) => [newName, oldName])
            );
            const sprintsById = new Map(
                currentSprints
                    .filter(sprint => sprint?.id !== undefined && sprint?.id !== null)
                    .map(sprint => [String(sprint.id), sprint])
            );
            const sprintsByName = new Map(
                currentSprints
                    .filter(sprint => typeof sprint?.name === 'string')
                    .map(sprint => [sprint.name, sprint])
            );

            updatedSprints.forEach(sprint => {
                const assigneeFirebaseUid =
                    typeof sprint?.assigneeFirebaseUid === 'string'
                        ? sprint.assigneeFirebaseUid.trim()
                        : '';
                if (!assigneeFirebaseUid) return;

                const previousSprint =
                    (sprint?.id !== undefined && sprint?.id !== null
                        ? sprintsById.get(String(sprint.id))
                        : null) ||
                    sprintsByName.get(oldNameByNewName.get(sprint?.name) || sprint?.name);
                const previousAssigneeFirebaseUid =
                    typeof previousSprint?.assigneeFirebaseUid === 'string'
                        ? previousSprint.assigneeFirebaseUid.trim()
                        : '';
                if (previousAssigneeFirebaseUid === assigneeFirebaseUid) return;

                sprintAssignmentNotifications.push({
                    assigneeFirebaseUid,
                    sprintName: typeof sprint.name === 'string' ? sprint.name : 'Project sprint'
                });
            });
        }

        if (sprint_name_map !== undefined) {
            const currentSprints = Array.isArray(current.sprints) ? current.sprints : [];
            const currentSprintNames = new Set(currentSprints.map(sprint => sprint?.name));
            const updatedSprintNames = new Set(updatedSprints.map(sprint => sprint?.name));
            const entries = sprint_name_map &&
                typeof sprint_name_map === 'object' &&
                !Array.isArray(sprint_name_map)
                ? Object.entries(sprint_name_map)
                : [];
            const isValidMap =
                entries.length === currentSprints.length &&
                entries.every(([oldName, newName]) =>
                    typeof oldName === 'string' &&
                    currentSprintNames.has(oldName) &&
                    typeof newName === 'string' &&
                    updatedSprintNames.has(newName)
                );

            if (!isValidMap) {
                return res.status(400).json({
                    success: false,
                    code: 'INVALID_SPRINT_NAME_MAP',
                    message: 'sprint_name_map must map every existing sprint to a remaining project sprint.'
                });
            }
            sprintNameMap = sprint_name_map;
            const updatedSprintsByName = new Map(
                updatedSprints.map(sprint => [sprint?.name, sprint])
            );
            taskSprintMap = Object.fromEntries(
                entries.map(([oldName, newName]) => {
                    const targetSprint = updatedSprintsByName.get(newName);
                    return [
                        oldName,
                        {
                            name: newName,
                            assigneeFirebaseUid: targetSprint.assigneeFirebaseUid || null
                        }
                    ];
                })
            );
        }

        const sql = `
            UPDATE projects
            SET
                name = $1,
                project_type = $2,
                time_span = $3,
                description = $4,
                color = $5,
                invited_members = $6::jsonb,
                sprints = $7::jsonb,
                updated_at = NOW()
            WHERE project_id = $8
              AND creator_firebase_uid = $9
            RETURNING
                id,
                project_id,
                name,
                project_type,
                time_span,
                description,
                color,
                creator_firebase_uid,
                creator_email,
                creator_name,
                creator_initials,
                invited_members,
                sprints,
                created_at,
                updated_at
        `;

        const values = [
            updatedName,
            updatedProjectType,
            updatedTimeSpan,
            updatedDescription,
            updatedColor,
            JSON.stringify(updatedMembers),
            JSON.stringify(updatedSprints),
            projectId,
            firebaseUid
        ];
        let result;
        let createdNotifications = [];
        if (sprints !== undefined || sprintNameMap) {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                const assigneeUids = [
                    ...new Set(sprintAssignmentNotifications.map(item => item.assigneeFirebaseUid))
                ];
                if (assigneeUids.length) {
                    const acceptedAssignees = await client.query(
                        `
                            SELECT invited_firebase_uid
                            FROM project_invitations
                            WHERE project_id = $1
                              AND status = 'accepted'
                              AND invited_firebase_uid = ANY($2::text[])
                        `,
                        [projectId, assigneeUids]
                    );
                    const acceptedUids = new Set(
                        acceptedAssignees.rows.map(row => row.invited_firebase_uid)
                    );
                    const invalidAssignee = assigneeUids.find(uid => !acceptedUids.has(uid));
                    if (invalidAssignee) {
                        await client.query('ROLLBACK');
                        return res.status(400).json({
                            success: false,
                            code: 'INVALID_SPRINT_ASSIGNEE',
                            message: 'Sprint leads must be accepted invitees of this project.'
                        });
                    }
                }

                result = await client.query(sql, values);
                if (!result.rowCount) {
                    await client.query('ROLLBACK');
                    return res.status(404).json({
                        success: false,
                        code: 'PROJECT_NOT_FOUND',
                        message: 'Project not found.'
                    });
                }
                if (taskSprintMap) {
                    await client.query(
                        `
                            UPDATE project_tasks AS task
                            SET sprint_name = sprint_map.target->>'name',
                                assignee_firebase_uid = COALESCE(
                                    sprint_map.target->>'assigneeFirebaseUid',
                                    task.assignee_firebase_uid
                                ),
                                updated_at = NOW()
                            FROM jsonb_each($1::jsonb) AS sprint_map(old_name, target)
                            WHERE task.project_id = $2
                              AND task.sprint_name = sprint_map.old_name
                        `,
                        [JSON.stringify(taskSprintMap), projectId]
                    );
                }
                for (const assignment of sprintAssignmentNotifications) {
                    const notification = await client.query(
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
                            VALUES ($1, $2, 'sprint_assigned', $3, $4, $5, 'blue-bg')
                            RETURNING
                                id,
                                project_id,
                                type,
                                title,
                                detail,
                                avatar,
                                tone_class,
                                is_read,
                                created_at
                        `,
                        [
                            assignment.assigneeFirebaseUid,
                            projectId,
                            'You have been assigned to a sprint',
                            `You are leading "${assignment.sprintName}" in "${updatedName}".`,
                            current.creator_initials || '•'
                        ]
                    );
                    createdNotifications.push(notification.rows[0]);
                }
                await client.query('COMMIT');
            } catch (error) {
                await client.query('ROLLBACK').catch(rollbackError => {
                    console.error('Project sprint update rollback error:', rollbackError);
                });
                throw error;
            } finally {
                client.release();
            }
        } else {
            result = await query(sql, values);
        }

        return res.status(200).json({
            success: true,
            message: 'Project updated successfully.',
            data: {
                project: result.rows[0],
                notifications: createdNotifications
            }
        });
    } catch (error) {
        console.error('Update project error:', error);

        if (error.code === '23505') {
            return res.status(409).json({
                success: false,
                code: 'PROJECT_NAME_ALREADY_EXISTS',
                message:
                    'You already have a project with this name.'
            });
        }

        return res.status(500).json({
            success: false,
            code: 'PROJECT_UPDATE_FAILED',
            message: 'The project could not be updated.'
        });
    }
};


/**
 * Delete a project
 * DELETE /api/projects/:projectId
 */
const deleteProject = async (req, res) => {
    try {
        const firebaseUid = req.firebaseUid;
        const { projectId } = req.params;

        if (!projectId) {
            return res.status(400).json({
                success: false,
                code: 'PROJECT_ID_REQUIRED',
                message: 'Project ID is required.'
            });
        }

        const sql = `
            DELETE FROM projects
            WHERE project_id = $1
              AND creator_firebase_uid = $2
            RETURNING
                id,
                project_id,
                name
        `;

        const result = await query(sql, [
            projectId,
            firebaseUid
        ]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                code: 'PROJECT_NOT_FOUND',
                message: 'Project not found.'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Project deleted successfully.',
            data: {
                project: result.rows[0]
            }
        });
    } catch (error) {
        console.error('Delete project error:', error);

        return res.status(500).json({
            success: false,
            code: 'PROJECT_DELETE_FAILED',
            message: 'The project could not be deleted.'
        });
    }
};


module.exports = {
    createProject,
    getProjects,
    getProject,
    updateProject,
    deleteProject
};