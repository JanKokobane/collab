const { randomUUID } = require('node:crypto');
const { pool, query } = require('../config/db');

const allowedCategories = new Set([
    'Design',
    'Engineering',
    'Product',
    'Testing',
    'Meetings',
    'Analytics',
    'Documentation',
    'Research',
    'Marketing',
    'Sales',
    'Customer Support',
    'Operations',
    'Finance',
    'Legal',
    'Human Resources',
    'Recruiting',
    'Strategy',
    'Planning',
    'Roadmaps',
    'Requirements',
    'Specifications',
    'Architecture',
    'APIs & Integrations',
    'Code Repositories',
    'DevOps',
    'Cybersecurity',
    'Data Science',
    'Databases',
    'Infrastructure',
    'Deployment',
    'Monitoring',
    'Incident Response',
    'Quality Assurance',
    'Bug Tracking',
    'User Experience',
    'Prototyping',
    'Branding',
    'Content',
    'SEO',
    'Social Media',
    'Campaigns',
    'Competitor Analysis',
    'Training',
    'Onboarding',
    'Policies',
    'Contracts',
    'Vendor Management',
    'Reports',
    'Presentations',
    'Other'
]);

const getProjectAccess = async (executor, projectId, firebaseUid, ownerOnly = false) => {
    const result = await executor.query(
        `
            SELECT project_id, name, creator_firebase_uid
            FROM projects p
            WHERE p.project_id = $1
              AND (
                    p.creator_firebase_uid = $2
                    OR (
                        NOT $3
                        AND EXISTS (
                            SELECT 1
                            FROM project_invitations invitation
                            WHERE invitation.project_id = p.project_id
                              AND invitation.invited_firebase_uid = $2
                              AND invitation.status = 'accepted'
                        )
                    )
              )
            LIMIT 1
        `,
        [projectId, firebaseUid, ownerOnly]
    );
    return result.rows[0] || null;
};

const validateResourceInput = body => {
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    const targetUrl = typeof body?.targetUrl === 'string' ? body.targetUrl.trim() : '';
    const category = typeof body?.category === 'string' ? body.category : '';
    let parsedUrl;
    try {
        parsedUrl = new URL(targetUrl);
    } catch {
        parsedUrl = null;
    }

    if (
        !title || title.length > 255 ||
        !targetUrl || targetUrl.length > 2048 ||
        !parsedUrl || !['http:', 'https:'].includes(parsedUrl.protocol) ||
        !allowedCategories.has(category)
    ) {
        return null;
    }

    return { title, targetUrl: parsedUrl.href, category };
};

const notifyProjectMembers = async (client, project, actorUid, type, title, detail) => {
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
                recipients.firebase_uid,
                $1,
                $3,
                $4,
                $5,
                '🔗',
                'teal-bg'
            FROM (
                SELECT creator_firebase_uid AS firebase_uid
                FROM projects
                WHERE project_id = $1
                UNION
                SELECT invited_firebase_uid
                FROM project_invitations
                WHERE project_id = $1
                  AND status = 'accepted'
                  AND invited_firebase_uid IS NOT NULL
            ) recipients
            WHERE recipients.firebase_uid <> $2
        `,
        [project.project_id, actorUid, type, title, detail]
    );
};

const getProjectResources = async (req, res) => {
    try {
        const project = await getProjectAccess(pool, req.params.projectId, req.firebaseUid);
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
                    resource_id,
                    project_id,
                    $2::text AS project_name,
                    title,
                    target_url,
                    category,
                    created_by_firebase_uid,
                    created_at,
                    updated_at
                FROM project_resources
                WHERE project_id = $1
                ORDER BY created_at DESC
            `,
            [project.project_id, project.name]
        );
        return res.status(200).json({
            success: true,
            data: { resources: result.rows }
        });
    } catch (error) {
        console.error('Get project resources error:', error);
        return res.status(500).json({
            success: false,
            code: 'PROJECT_RESOURCES_FETCH_FAILED',
            message: 'Project resources could not be retrieved.'
        });
    }
};

const createProjectResource = async (req, res) => {
    const resourceInput = validateResourceInput(req.body);
    if (!resourceInput) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_PROJECT_RESOURCE',
            message: 'Provide a valid title, HTTP(S) URL, and resource category.'
        });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const project = await getProjectAccess(client, req.params.projectId, req.firebaseUid, true);
        if (!project) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                code: 'PROJECT_NOT_FOUND',
                message: 'Only a project creator can pin resources to that project.'
            });
        }

        const result = await client.query(
            `
                INSERT INTO project_resources (
                    resource_id,
                    project_id,
                    title,
                    target_url,
                    category,
                    created_by_firebase_uid
                )
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING
                    resource_id,
                    project_id,
                    title,
                    target_url,
                    category,
                    created_by_firebase_uid,
                    created_at,
                    updated_at
            `,
            [
                randomUUID(),
                project.project_id,
                resourceInput.title,
                resourceInput.targetUrl,
                resourceInput.category,
                req.firebaseUid
            ]
        );
        await notifyProjectMembers(
            client,
            project,
            req.firebaseUid,
            'project_resource_created',
            'A project resource was added',
            `"${resourceInput.title}" was added to ${project.name}.`
        );
        await client.query('COMMIT');
        return res.status(201).json({
            success: true,
            data: {
                resource: {
                    ...result.rows[0],
                    project_name: project.name
                }
            }
        });
    } catch (error) {
        await client.query('ROLLBACK').catch(rollbackError => {
            console.error('Create project resource rollback error:', rollbackError);
        });
        console.error('Create project resource error:', error);
        return res.status(500).json({
            success: false,
            code: 'PROJECT_RESOURCE_CREATE_FAILED',
            message: 'The project resource could not be pinned.'
        });
    } finally {
        client.release();
    }
};

const updateProjectResource = async (req, res) => {
    const resourceInput = validateResourceInput(req.body);
    if (!resourceInput) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_PROJECT_RESOURCE',
            message: 'Provide a valid title, HTTP(S) URL, and resource category.'
        });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const project = await getProjectAccess(client, req.params.projectId, req.firebaseUid, true);
        if (!project) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                code: 'PROJECT_NOT_FOUND',
                message: 'Only a project creator can edit resources in that project.'
            });
        }

        const result = await client.query(
            `
                UPDATE project_resources
                SET title = $3,
                    target_url = $4,
                    category = $5,
                    updated_at = NOW()
                WHERE project_id = $1
                  AND resource_id = $2
                RETURNING
                    resource_id,
                    project_id,
                    title,
                    target_url,
                    category,
                    created_by_firebase_uid,
                    created_at,
                    updated_at
            `,
            [
                project.project_id,
                req.params.resourceId,
                resourceInput.title,
                resourceInput.targetUrl,
                resourceInput.category
            ]
        );
        if (!result.rowCount) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                code: 'PROJECT_RESOURCE_NOT_FOUND',
                message: 'The project resource was not found.'
            });
        }

        await notifyProjectMembers(
            client,
            project,
            req.firebaseUid,
            'project_resource_updated',
            'A project resource was updated',
            `"${resourceInput.title}" in ${project.name} was updated.`
        );
        await client.query('COMMIT');
        return res.status(200).json({
            success: true,
            data: {
                resource: {
                    ...result.rows[0],
                    project_name: project.name
                }
            }
        });
    } catch (error) {
        await client.query('ROLLBACK').catch(rollbackError => {
            console.error('Update project resource rollback error:', rollbackError);
        });
        console.error('Update project resource error:', error);
        return res.status(500).json({
            success: false,
            code: 'PROJECT_RESOURCE_UPDATE_FAILED',
            message: 'The project resource could not be updated.'
        });
    } finally {
        client.release();
    }
};

const deleteProjectResource = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const project = await getProjectAccess(client, req.params.projectId, req.firebaseUid, true);
        if (!project) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                code: 'PROJECT_NOT_FOUND',
                message: 'Only a project creator can remove resources from that project.'
            });
        }

        const result = await client.query(
            `
                DELETE FROM project_resources
                WHERE project_id = $1
                  AND resource_id = $2
                RETURNING title
            `,
            [project.project_id, req.params.resourceId]
        );
        if (!result.rowCount) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                code: 'PROJECT_RESOURCE_NOT_FOUND',
                message: 'The project resource was not found.'
            });
        }

        await notifyProjectMembers(
            client,
            project,
            req.firebaseUid,
            'project_resource_deleted',
            'A project resource was removed',
            `"${result.rows[0].title}" was removed from ${project.name}.`
        );
        await client.query('COMMIT');
        return res.status(200).json({
            success: true,
            data: { resourceId: req.params.resourceId }
        });
    } catch (error) {
        await client.query('ROLLBACK').catch(rollbackError => {
            console.error('Delete project resource rollback error:', rollbackError);
        });
        console.error('Delete project resource error:', error);
        return res.status(500).json({
            success: false,
            code: 'PROJECT_RESOURCE_DELETE_FAILED',
            message: 'The project resource could not be removed.'
        });
    } finally {
        client.release();
    }
};

module.exports = {
    createProjectResource,
    deleteProjectResource,
    getProjectResources,
    updateProjectResource
};
