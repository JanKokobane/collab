DROP INDEX IF EXISTS idx_project_tasks_assignee;

ALTER TABLE project_tasks
    DROP COLUMN IF EXISTS assignee_firebase_uid;
