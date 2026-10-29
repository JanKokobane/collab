const { pool, query } = require('../config/db');
const { reconcileUserConversationAccess } = require('../realtime/messageSocket');

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

        const invitedMembers = [];

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
                (
                    SELECT profile_image
                    FROM user_profiles
                    WHERE firebase_uid = projects.creator_firebase_uid
                ) AS creator_profile_image,
                invited_members,
                (
                    SELECT COUNT(DISTINCT LOWER(invitation.invited_email))::int
                    FROM project_invitations invitation
                    WHERE invitation.project_id = projects.project_id
                      AND invitation.status = 'accepted'
                      AND (
                            invitation.invited_firebase_uid IS NULL
                            OR invitation.invited_firebase_uid <> projects.creator_firebase_uid
                      )
                      AND LOWER(invitation.invited_email) <> LOWER(COALESCE(projects.creator_email, ''))
                ) AS team_member_count,
                COALESCE(
                    (
                        SELECT json_agg(json_build_object(
                            'firebaseUid', accepted_member.invited_firebase_uid,
                            'email', accepted_member.invited_email,
                            'name', accepted_member.invited_name,
                            'role', accepted_member.role,
                            'profileImage', accepted_member.profile_image
                        ) ORDER BY accepted_member.created_at)
                        FROM (
                            SELECT DISTINCT ON (invited_firebase_uid)
                                invitation.invited_firebase_uid,
                                invitation.invited_email,
                                invitation.invited_name,
                                invitation.role,
                                invitation.created_at,
                                user_profile.profile_image
                            FROM project_invitations invitation
                            LEFT JOIN user_profiles user_profile
                              ON user_profile.firebase_uid = invitation.invited_firebase_uid
                            WHERE invitation.project_id = projects.project_id
                              AND invitation.status = 'accepted'
                              AND invitation.invited_firebase_uid IS NOT NULL
                            ORDER BY invitation.invited_firebase_uid, invitation.created_at DESC
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
                (
                    SELECT profile_image
                    FROM user_profiles
                    WHERE firebase_uid = projects.creator_firebase_uid
                ) AS creator_profile_image,
                invited_members,
                (
                    SELECT COUNT(DISTINCT LOWER(invitation.invited_email))::int
                    FROM project_invitations invitation
                    WHERE invitation.project_id = projects.project_id
                      AND invitation.status = 'accepted'
                      AND (
                            invitation.invited_firebase_uid IS NULL
                            OR invitation.invited_firebase_uid <> projects.creator_firebase_uid
                      )
                      AND LOWER(invitation.invited_email) <> LOWER(COALESCE(projects.creator_email, ''))
                ) AS team_member_count,
                COALESCE(
                    (
                        SELECT json_agg(json_build_object(
                            'firebaseUid', accepted_member.invited_firebase_uid,
                            'email', accepted_member.invited_email,
                            'name', accepted_member.invited_name,
                            'role', accepted_member.role,
                            'profileImage', accepted_member.profile_image
                        ) ORDER BY accepted_member.created_at)
                        FROM (
                            SELECT DISTINCT ON (invited_firebase_uid)
                                invitation.invited_firebase_uid,
                                invitation.invited_email,
                                invitation.invited_name,
                                invitation.role,
                                invitation.created_at,
                                user_profile.profile_image
                            FROM project_invitations invitation
                            LEFT JOIN user_profiles user_profile
                              ON user_profile.firebase_uid = invitation.invited_firebase_uid
                            WHERE invitation.project_id = projects.project_id
                              AND invitation.status = 'accepted'
                              AND invitation.invited_firebase_uid IS NOT NULL
                            ORDER BY invitation.invited_firebase_uid, invitation.created_at DESC
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
                const inviteeAssigneeUids = assigneeUids.filter(
                    uid => uid !== current.creator_firebase_uid
                );
                if (inviteeAssigneeUids.length) {
                    const acceptedAssignees = await client.query(
                        `
                            SELECT invited_firebase_uid
                            FROM project_invitations
                            WHERE project_id = $1
                              AND status = 'accepted'
                              AND invited_firebase_uid = ANY($2::text[])
                        `,
                        [projectId, inviteeAssigneeUids]
                    );
                    const acceptedUids = new Set(
                        acceptedAssignees.rows.map(row => row.invited_firebase_uid)
                    );
                    const invalidAssignee = inviteeAssigneeUids.find(uid => !acceptedUids.has(uid));
                    if (invalidAssignee) {
                        await client.query('ROLLBACK');
                        return res.status(400).json({
                            success: false,
                            code: 'INVALID_SPRINT_ASSIGNEE',
                            message: 'Sprint leads must be the project owner or accepted invitees.'
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
 * POST /api/projects/:projectId/sprints/:sprintName/submit
 */
const MAX_SPRINT_SUBMISSION_MEDIA_BYTES = 100 * 1024 * 1024;
const MAX_SPRINT_SUBMISSION_ATTACHMENTS = 10;

const normalizeSprintSubmissionAttachments = value => {
    if (value === undefined) return { attachments: [], error: null };
    if (!Array.isArray(value) || value.length > MAX_SPRINT_SUBMISSION_ATTACHMENTS) {
        return { attachments: [], error: `Attach no more than ${MAX_SPRINT_SUBMISSION_ATTACHMENTS} files.` };
    }

    let totalBytes = 0;
    const attachments = [];
    for (const item of value) {
        const fileName = typeof item?.fileName === 'string' ? item.fileName.trim() : '';
        const mediaType = typeof item?.mediaType === 'string' ? item.mediaType.toLowerCase() : '';
        const data = typeof item?.data === 'string' ? item.data : '';
        const isSupportedType = /^(image\/(?!svg\+xml(?:$|;))[a-z0-9.+-]+|audio\/[a-z0-9.+-]+|video\/[a-z0-9.+-]+|application\/pdf)$/.test(mediaType);
        const dataMatch = data.match(/^data:([^;,]+)(?:;codecs=[^;,]+)?;base64,([A-Za-z0-9+/]*={0,2})$/);

        if (!fileName || fileName.length > 255 || /[\u0000-\u001f\u007f]/.test(fileName) ||
            !isSupportedType || !dataMatch || dataMatch[1].toLowerCase() !== mediaType) {
            return { attachments: [], error: 'One or more attachments are invalid or use an unsupported file type.' };
        }

        const encoded = dataMatch[2];
        const buffer = Buffer.from(encoded, 'base64');
        if (!buffer.length || buffer.toString('base64') !== encoded) {
            return { attachments: [], error: 'One or more attachments contain invalid file data.' };
        }
        totalBytes += buffer.length;
        if (totalBytes > MAX_SPRINT_SUBMISSION_MEDIA_BYTES) {
            return { attachments: [], error: 'Sprint attachments must total 100 MB or less.' };
        }

        attachments.push({
            fileName,
            mediaType,
            size: buffer.length,
            data
        });
    }

    return { attachments, error: null };
};

const submitProjectSprint = async (req, res) => {
    let client;
    try {
        const { projectId, sprintName } = req.params;
        const firebaseUid = req.firebaseUid;
        const submissionNote = typeof req.body?.submissionNote === 'string'
            ? req.body.submissionNote.trim()
            : '';
        const { attachments: submissionAttachments, error: attachmentError } =
            normalizeSprintSubmissionAttachments(req.body?.submissionAttachments);

        if (!projectId || !sprintName?.trim()) {
            return res.status(400).json({
                success: false,
                code: 'SPRINT_REQUIRED',
                message: 'Project and sprint are required.'
            });
        }
        if (attachmentError) {
            return res.status(400).json({
                success: false,
                code: 'SPRINT_SUBMISSION_ATTACHMENTS_INVALID',
                message: attachmentError
            });
        }
        if (submissionNote.length > 5000 || (!submissionNote && !submissionAttachments.length)) {
            return res.status(400).json({
                success: false,
                code: 'SPRINT_SUBMISSION_NOTE_REQUIRED',
                message: submissionNote.length > 5000
                    ? 'Submission notes cannot exceed 5,000 characters.'
                    : 'Add a submission note or attach a file or voice note.'
            });
        }

        client = await pool.connect();
        await client.query('BEGIN');
        const projectResult = await client.query(
            `SELECT project_id, name, creator_firebase_uid, creator_initials, sprints
             FROM projects
             WHERE project_id = $1
             FOR UPDATE`,
            [projectId]
        );
        if (!projectResult.rowCount) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                code: 'PROJECT_NOT_FOUND',
                message: 'Project not found.'
            });
        }

        const project = projectResult.rows[0];
        const sprints = Array.isArray(project.sprints) ? project.sprints : [];
        const sprintIndex = sprints.findIndex(sprint => sprint?.name === sprintName.trim());
        if (sprintIndex < 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                code: 'SPRINT_NOT_FOUND',
                message: 'Sprint not found.'
            });
        }

        const sprint = sprints[sprintIndex];
        if (sprint.assigneeFirebaseUid !== firebaseUid) {
            await client.query('ROLLBACK');
            return res.status(403).json({
                success: false,
                code: 'SPRINT_COMPLETION_FORBIDDEN',
                message: 'Only the assigned sprint lead can submit this sprint for review.'
            });
        }
        if (sprint.status === 'Completed' || sprint.status === 'Pending Review') {
            await client.query('ROLLBACK');
            return res.status(409).json({
                success: false,
                code: 'SPRINT_NOT_SUBMITTABLE',
                message: sprint.status === 'Completed'
                    ? 'This sprint has already been accepted.'
                    : 'This sprint is already awaiting review.'
            });
        }

        const submittedByName = req.firebaseUser?.name || req.firebaseUser?.displayName || req.firebaseEmail || 'Sprint lead';
        const submittedAt = new Date().toISOString();
        sprints[sprintIndex] = {
            ...sprint,
            status: project.creator_firebase_uid === firebaseUid ? 'Completed' : 'Pending Review',
            submissionNote,
            submissionAttachments,
            submittedByFirebaseUid: firebaseUid,
            submittedByName,
            submittedAt,
            reviewComment: ''
        };
        const saved = await client.query(
            `UPDATE projects
             SET sprints = $1::jsonb, updated_at = NOW()
             WHERE project_id = $2
             RETURNING project_id, sprints`,
            [JSON.stringify(sprints), projectId]
        );
        if (!saved.rowCount) {
            throw new Error('Sprint submission update did not persist.');
        }

        await client.query('COMMIT');

        let notificationWarning = null;
        if (project.creator_firebase_uid !== firebaseUid) {
            try {
                await client.query(
                    `INSERT INTO notifications (
                        recipient_firebase_uid, project_id, type, title, detail, avatar, tone_class
                     )
                     VALUES ($1, $2, 'sprint_submitted_for_review', $3, $4, $5, 'orange-bg')`,
                    [
                        project.creator_firebase_uid,
                        projectId,
                        'Sprint ready for review',
                        `${submittedByName} submitted "${sprint.name}" in "${project.name}" for your review.`,
                        project.creator_initials || '•'
                    ]
                );
            } catch (notificationError) {
                console.error('Sprint submission saved, but its notification could not be created:', notificationError);
                notificationWarning = 'The submission was saved, but the project owner could not be notified.';
            }
        }

        return res.status(200).json({
            success: true,
            message: project.creator_firebase_uid === firebaseUid
                ? 'Sprint completed successfully.'
                : 'Sprint submitted for owner review.',
            ...(notificationWarning ? { notificationWarning } : {}),
            data: { project: saved.rows[0] }
        });
    } catch (error) {
        await client?.query('ROLLBACK').catch(rollbackError => {
            console.error('Sprint submission rollback error:', rollbackError);
        });
        console.error('Submit project sprint error:', error);
        return res.status(500).json({
            success: false,
            code: 'SPRINT_SUBMISSION_FAILED',
            message: 'The sprint submission could not be saved. Please try again.'
        });
    } finally {
        client?.release();
    }
};

const reviewProjectSprint = async (req, res) => {
    let client;
    try {
        const { projectId, sprintName } = req.params;
        const firebaseUid = req.firebaseUid;
        const decision = typeof req.body?.decision === 'string' ? req.body.decision.trim() : '';
        const comment = typeof req.body?.comment === 'string' ? req.body.comment.trim() : '';
        const { attachments: reviewAttachments, error: attachmentError } =
            normalizeSprintSubmissionAttachments(req.body?.reviewAttachments);

        if (!projectId || !sprintName?.trim() || !['accept', 'request_changes'].includes(decision)) {
            return res.status(400).json({
                success: false,
                code: 'INVALID_SPRINT_REVIEW',
                message: 'Choose whether to accept the sprint or request changes.'
            });
        }
        if (attachmentError) {
            return res.status(400).json({
                success: false,
                code: 'SPRINT_REVIEW_ATTACHMENTS_INVALID',
                message: attachmentError
            });
        }
        if (comment.length > 5000 || (decision === 'request_changes' && !comment)) {
            return res.status(400).json({
                success: false,
                code: 'SPRINT_REVIEW_COMMENT_REQUIRED',
                message: decision === 'request_changes'
                    ? 'Add a written comment explaining the requested changes.'
                    : 'The review comment cannot exceed 5,000 characters.'
            });
        }

        client = await pool.connect();
        await client.query('BEGIN');
        const projectResult = await client.query(
            `SELECT project_id, name, creator_firebase_uid, creator_initials, sprints
             FROM projects
             WHERE project_id = $1
             FOR UPDATE`,
            [projectId]
        );
        if (!projectResult.rowCount) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                code: 'PROJECT_NOT_FOUND',
                message: 'Project not found.'
            });
        }

        const project = projectResult.rows[0];
        if (project.creator_firebase_uid !== firebaseUid) {
            await client.query('ROLLBACK');
            return res.status(403).json({
                success: false,
                code: 'SPRINT_REVIEW_FORBIDDEN',
                message: 'Only the project owner can review sprint submissions.'
            });
        }
        const sprints = Array.isArray(project.sprints) ? project.sprints : [];
        const sprintIndex = sprints.findIndex(sprint => sprint?.name === sprintName.trim());
        if (sprintIndex < 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                code: 'SPRINT_NOT_FOUND',
                message: 'Sprint not found.'
            });
        }

        const sprint = sprints[sprintIndex];
        if (sprint.status !== 'Pending Review') {
            await client.query('ROLLBACK');
            return res.status(409).json({
                success: false,
                code: 'SPRINT_NOT_AWAITING_REVIEW',
                message: 'This sprint is not awaiting review.'
            });
        }

        const reviewedAt = new Date().toISOString();
        const reviewerName = req.firebaseUser?.name || req.firebaseUser?.displayName || req.firebaseEmail || 'Project owner';
        sprints[sprintIndex] = {
            ...sprint,
            status: decision === 'accept' ? 'Completed' : 'Changes Requested',
            reviewComment: comment,
            reviewAttachments,
            reviewedByFirebaseUid: firebaseUid,
            reviewedByName: reviewerName,
            reviewedAt
        };
        const saved = await client.query(
            `UPDATE projects
             SET sprints = $1::jsonb, updated_at = NOW()
             WHERE project_id = $2
             RETURNING project_id, sprints`,
            [JSON.stringify(sprints), projectId]
        );
        if (!saved.rowCount) {
            throw new Error('Sprint review update did not persist.');
        }

        await client.query('COMMIT');

        let notificationWarning = null;
        if (sprint.assigneeFirebaseUid && sprint.assigneeFirebaseUid !== firebaseUid) {
            try {
                await client.query(
                    `INSERT INTO notifications (
                        recipient_firebase_uid, project_id, type, title, detail, avatar, tone_class
                     )
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [
                        sprint.assigneeFirebaseUid,
                        projectId,
                        decision === 'accept' ? 'sprint_submission_accepted' : 'sprint_changes_requested',
                        decision === 'accept' ? 'Sprint submission accepted' : 'Changes requested on sprint',
                        decision === 'accept'
                            ? `Your submission for "${sprint.name}" in "${project.name}" was accepted.`
                            : `The project owner requested changes to "${sprint.name}" in "${project.name}": ${comment || 'See the attached feedback.'}`,
                        project.creator_initials || '•',
                        decision === 'accept' ? 'green-bg' : 'orange-bg'
                    ]
                );
            } catch (notificationError) {
                console.error('Sprint review saved, but its notification could not be created:', notificationError);
                notificationWarning = 'The review was saved, but the sprint lead could not be notified.';
            }
        }

        return res.status(200).json({
            success: true,
            message: decision === 'accept' ? 'Sprint submission accepted.' : 'Changes requested on sprint.',
            ...(notificationWarning ? { notificationWarning } : {}),
            data: { project: saved.rows[0] }
        });
    } catch (error) {
        await client?.query('ROLLBACK').catch(rollbackError => {
            console.error('Sprint review rollback error:', rollbackError);
        });
        console.error('Review project sprint error:', error);
        return res.status(500).json({
            success: false,
            code: 'SPRINT_REVIEW_FAILED',
            message: 'The sprint submission could not be reviewed.'
        });
    } finally {
        client?.release();
    }
};


/**
 * Delete a project
 * DELETE /api/projects/:projectId
 */
const deleteProject = async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const firebaseUid = req.firebaseUid;
        const { projectId } = req.params;

        if (!projectId) {
            return res.status(400).json({
                success: false,
                code: 'PROJECT_ID_REQUIRED',
                message: 'Project ID is required.'
            });
        }

        await client.query('BEGIN');
        const ownedProject = await client.query(
            `SELECT project_id, name FROM projects
             WHERE project_id = $1 AND creator_firebase_uid = $2
             FOR UPDATE`,
            [projectId, firebaseUid]
        );
        if (!ownedProject.rowCount) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                code: 'PROJECT_NOT_FOUND',
                message: 'Project not found.'
            });
        }
        const conversations = await client.query(
            `SELECT mc.conversation_id::text AS conversation_id,
                    array_agg(member.firebase_uid) AS member_uids
             FROM message_conversations mc
             JOIN message_conversation_members member
               ON member.conversation_id = mc.conversation_id
             WHERE mc.project_id = $1
             GROUP BY mc.conversation_id`,
            [projectId]
        );
        await client.query('DELETE FROM projects WHERE project_id = $1', [projectId]);
        await client.query('COMMIT');
        const conversationIds = conversations.rows.map(row => row.conversation_id);
        const members = new Set(conversations.rows.flatMap(row => row.member_uids));
        await Promise.all([...members].map(uid =>
            reconcileUserConversationAccess(uid, conversationIds)
        ));

        return res.status(200).json({
            success: true,
            message: 'Project deleted successfully.',
            data: {
                project: ownedProject.rows[0]
            }
        });
    } catch (error) {
        await client?.query('ROLLBACK').catch(() => {});
        console.error('Delete project error:', error);

        return res.status(500).json({
            success: false,
            code: 'PROJECT_DELETE_FAILED',
            message: 'The project could not be deleted.'
        });
    } finally {
        client?.release();
    }
};


module.exports = {
    createProject,
    getProjects,
    getProject,
    updateProject,
    submitProjectSprint,
    reviewProjectSprint,
    deleteProject
};