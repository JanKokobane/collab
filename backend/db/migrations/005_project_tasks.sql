CREATE TABLE IF NOT EXISTS project_tasks (
    task_id UUID PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 255),
    description TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'Product',
    sprint_name TEXT NOT NULL,
    assignee_firebase_uid TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'To do'
        CHECK (status IN ('Backlog', 'To do', 'In progress', 'Done')),
    start_date DATE,
    due_date DATE,
    created_by_firebase_uid TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_tasks_project
    ON project_tasks (project_id, created_at);

CREATE INDEX IF NOT EXISTS idx_project_tasks_assignee
    ON project_tasks (assignee_firebase_uid, project_id);
