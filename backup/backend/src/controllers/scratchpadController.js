const { pool } = require('../config/db');

const maxScratchpadLength = 50000;

const getAccessibleProject = async (projectId, firebaseUid) => {
    const result = await pool.query(
        `
            SELECT project_id
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

const getProjectScratchpad = async (req, res) => {
    try {
        const project = await getAccessibleProject(req.params.projectId, req.firebaseUid);
        if (!project) {
            return res.status(404).json({
                success: false,
                code: 'PROJECT_NOT_FOUND',
                message: 'Project not found.'
            });
        }

        const result = await pool.query(
            `
                SELECT content, updated_at
                FROM project_scratchpads
                WHERE project_id = $1
            `,
            [project.project_id]
        );
        const scratchpad = result.rows[0] || { content: '', updated_at: null };
        return res.status(200).json({
            success: true,
            data: {
                scratchpad: {
                    content: scratchpad.content,
                    updated_at: scratchpad.updated_at
                }
            }
        });
    } catch (error) {
        console.error('Get project scratchpad error:', error);
        return res.status(500).json({
            success: false,
            code: 'PROJECT_SCRATCHPAD_FETCH_FAILED',
            message: 'The project scratchpad could not be retrieved.'
        });
    }
};

const saveProjectScratchpad = async (req, res) => {
    const content = req.body?.content;
    if (typeof content !== 'string' || content.length > maxScratchpadLength) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_PROJECT_SCRATCHPAD',
            message: `Scratchpad content must be text no longer than ${maxScratchpadLength} characters.`
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

        const result = await pool.query(
            `
                INSERT INTO project_scratchpads (project_id, content, updated_by_firebase_uid)
                VALUES ($1, $2, $3)
                ON CONFLICT (project_id)
                DO UPDATE SET
                    content = EXCLUDED.content,
                    updated_by_firebase_uid = EXCLUDED.updated_by_firebase_uid,
                    updated_at = NOW()
                RETURNING content, updated_at
            `,
            [project.project_id, content, req.firebaseUid]
        );
        return res.status(200).json({
            success: true,
            data: { scratchpad: result.rows[0] }
        });
    } catch (error) {
        console.error('Save project scratchpad error:', error);
        return res.status(500).json({
            success: false,
            code: 'PROJECT_SCRATCHPAD_SAVE_FAILED',
            message: 'The project scratchpad could not be saved.'
        });
    }
};

module.exports = {
    getProjectScratchpad,
    saveProjectScratchpad
};
