const { randomUUID } = require('node:crypto');
const { query } = require('../config/db');

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

const getProjectAccess = async (projectId, firebaseUid, ownerOnly = false) => {
    const result = await query(
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

const getProjectResources = async (req, res) => {
    try {
        const project = await getProjectAccess(req.params.projectId, req.firebaseUid);
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
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const targetUrl = typeof req.body?.targetUrl === 'string' ? req.body.targetUrl.trim() : '';
    const category = typeof req.body?.category === 'string' ? req.body.category : '';
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
        return res.status(400).json({
            success: false,
            code: 'INVALID_PROJECT_RESOURCE',
            message: 'Provide a valid title, HTTP(S) URL, and resource category.'
        });
    }

    try {
        const project = await getProjectAccess(req.params.projectId, req.firebaseUid, true);
        if (!project) {
            return res.status(404).json({
                success: false,
                code: 'PROJECT_NOT_FOUND',
                message: 'Only a project creator can pin resources to that project.'
            });
        }

        const result = await query(
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
                title,
                parsedUrl.href,
                category,
                req.firebaseUid
            ]
        );
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
        console.error('Create project resource error:', error);
        return res.status(500).json({
            success: false,
            code: 'PROJECT_RESOURCE_CREATE_FAILED',
            message: 'The project resource could not be pinned.'
        });
    }
};

module.exports = {
    createProjectResource,
    getProjectResources
};
