const { pool } = require('../config/db');

const sweepTaskDeadlines = async () => {
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
                RETURNING task_id, project_id, assignee_firebase_uid, title
            `
        ).then(async result => {
            for (const task of result.rows) {
                if (!task.assignee_firebase_uid) continue;
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
                        task.assignee_firebase_uid,
                        task.project_id,
                        task.task_id,
                        `You have 8 hours left to submit "${task.title}".`
                    ]
                );
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
                RETURNING task_id, project_id, assignee_firebase_uid, title
            `
        );
        for (const task of overdue.rows) {
            if (!task.assignee_firebase_uid) continue;
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
                    task.assignee_firebase_uid,
                    task.project_id,
                    task.task_id,
                    `"${task.title}" is now blocked because its deadline passed.`
                ]
            );
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
