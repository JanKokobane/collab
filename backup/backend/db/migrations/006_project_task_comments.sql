CREATE TABLE IF NOT EXISTS project_task_comments (
    comment_id BIGSERIAL PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES project_tasks(task_id) ON DELETE CASCADE,
    author_firebase_uid TEXT NOT NULL,
    author_name TEXT NOT NULL,
    author_email TEXT,
    body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_task_comments_task_created
    ON project_task_comments (task_id, created_at, comment_id);
