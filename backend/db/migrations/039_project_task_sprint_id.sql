ALTER TABLE project_tasks
    ADD COLUMN IF NOT EXISTS sprint_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'project_tasks'::regclass
          AND conname = 'project_tasks_sprint_id_fkey'
    ) THEN
        ALTER TABLE project_tasks
            ADD CONSTRAINT project_tasks_sprint_id_fkey
            FOREIGN KEY (sprint_id)
            REFERENCES project_sprints (sprint_id)
            ON DELETE SET NULL;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_project_tasks_sprint
    ON project_tasks (sprint_id)
    WHERE sprint_id IS NOT NULL;
