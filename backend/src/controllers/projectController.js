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
                            'firebaseUid', pi.invited_firebase_uid,
                            'email', pi.invited_email,
                            'name', pi.invited_name,
                            'role', pi.role
                        ) ORDER BY pi.created_at)
                        FROM project_invitations pi
                        WHERE pi.project_id = projects.project_id
                          AND pi.status = 'accepted'
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
                            'firebaseUid', pi.invited_firebase_uid,
                            'email', pi.invited_email,
                            'name', pi.invited_name,
                            'role', pi.role
                        ) ORDER BY pi.created_at)
                        FROM project_invitations pi
                        WHERE pi.project_id = projects.project_id
                          AND pi.status = 'accepted'
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
            sprints
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

        const result = await query(sql, [
            updatedName,
            updatedProjectType,
            updatedTimeSpan,
            updatedDescription,
            updatedColor,
            JSON.stringify(updatedMembers),
            JSON.stringify(updatedSprints),
            projectId,
            firebaseUid
        ]);

        return res.status(200).json({
            success: true,
            message: 'Project updated successfully.',
            data: {
                project: result.rows[0]
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