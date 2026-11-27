ALTER TABLE project_tasks
    DROP CONSTRAINT IF EXISTS project_tasks_priority_check;

ALTER TABLE project_tasks
    ADD CONSTRAINT project_tasks_priority_check
        CHECK (priority IN ('none', 'low', 'medium', 'high', 'urgent'));
