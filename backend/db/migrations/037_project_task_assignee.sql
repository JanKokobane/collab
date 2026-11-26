ALTER TABLE project_tasks
    ADD COLUMN IF NOT EXISTS assignee_firebase_uid TEXT;

CREATE INDEX IF NOT EXISTS idx_project_tasks_assignee
    ON project_tasks (assignee_firebase_uid, project_id)
    WHERE assignee_firebase_uid IS NOT NULL;
