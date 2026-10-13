CREATE TABLE IF NOT EXISTS project_scratchpads (
    project_id TEXT PRIMARY KEY REFERENCES projects(project_id) ON DELETE CASCADE,
    content TEXT NOT NULL DEFAULT '' CHECK (char_length(content) <= 50000),
    updated_by_firebase_uid TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
