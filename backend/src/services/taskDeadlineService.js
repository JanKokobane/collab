const { pool, isDatabaseConnected } = require('../config/db');

const getProjectTaskRecipients = async (client, projectId) => {
    const result = await client.query(
        'SELECT creator_firebase_uid, sprints FROM projects WHERE project_id = $1',
        [projectId]
    );
    const project = result.rows[0];
    if (!project) return [];
    const sprints = Array.isArray(project.sprints) ? project.sprints : [];
    const members = sprints.flatMap(sprint => {
        if (Array.isArray(sprint?.memberFirebaseUids)) return sprint.memberFirebaseUids;
        if (Array.isArray(sprint?.member_firebase_uids)) return sprint.member_firebase_uids;
        return [sprint?.assigneeFirebaseUid || sprint?.assignee_firebase_uid];
    });
    return [...new Set([project.creator_firebase_uid, ...members]
        .filter(uid => typeof uid === 'string' && uid.trim())
        .map(uid => uid.trim()))];
};

const sweepTaskDeadlines = async () => {
    if (!isDatabaseConnected()) return;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query(
            `
                UPDATE project_tasks
                SET deadline_warning_sent_at = NOW(),
                    updated_at = NOW()
                WHERE due_date IS NOT NULL
                  AND status NOT IN ('Done', 'Blocked')
                  AND deadline_warning_sent_at IS NULL
                  AND due_date::timestamp + INTERVAL '16 hours' <= NOW()
                  AND due_date::timestamp + INTERVAL '1 day' > NOW()
                RETURNING task_id, project_id, title
            `
        ).then(async result => {
            for (const task of result.rows) {
                const recipients = await getProjectTaskRecipients(client, task.project_id);
                for (const recipientUid of recipients) {
                    await client.query(
                        `
                            INSERT INTO notifications (
                                recipient_firebase_uid,
                                project_id,
                                related_task_id,
                                type,
                                title,
                                detail,
                                avatar,
                                tone_class
                            )
                            VALUES ($1, $2, $3, 'task_deadline_warning',
                                    'Task deadline approaching',
                                    $4, '⏰', 'orange-bg')
                        `,
                        [
                            recipientUid,
                            task.project_id,
                            task.task_id,
                            `There are 8 hours left to complete "${task.title}".`
                        ]
                    );
                }
            }
        });

        const overdue = await client.query(
            `
                UPDATE project_tasks
                SET status = 'Blocked',
                    deadline_blocked_at = NOW(),
                    updated_at = NOW()
                WHERE due_date IS NOT NULL
                  AND status NOT IN ('Done', 'Blocked')
                  AND due_date::timestamp + INTERVAL '1 day' <= NOW()
                  AND deadline_blocked_at IS NULL
                RETURNING task_id, project_id, title
            `
        );
        for (const task of overdue.rows) {
            const recipients = await getProjectTaskRecipients(client, task.project_id);
            for (const recipientUid of recipients) {
                await client.query(
                    `
                        INSERT INTO notifications (
                            recipient_firebase_uid,
                            project_id,
                            related_task_id,
                            type,
                            title,
                            detail,
                            avatar,
                            tone_class
                        )
                        VALUES ($1, $2, $3, 'task_deadline_expired',
                                'Task deadline passed',
                                $4, '!', 'coral-bg')
                    `,
                    [
                        recipientUid,
                        task.project_id,
                        task.task_id,
                        `"${task.title}" is now blocked because its deadline passed.`
                    ]
                );
            }
        }

        await client.query('COMMIT');
        if (overdue.rowCount) {
            console.info(`Blocked ${overdue.rowCount} overdue project task(s).`);
        }
    } catch (error) {
        await client.query('ROLLBACK').catch(rollbackError => {
            console.error('Task deadline sweep rollback error:', rollbackError);
        });
        throw error;
    } finally {
        client.release();
    }
};

module.exports = { sweepTaskDeadlines };
