CREATE TABLE IF NOT EXISTS project_resources (
    resource_id UUID PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 255),
    target_url TEXT NOT NULL CHECK (char_length(target_url) BETWEEN 1 AND 2048),
    category TEXT NOT NULL
        CHECK (category IN ('Design', 'Engineering', 'Product', 'Testing', 'Meetings', 'Analytics')),
    created_by_firebase_uid TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_resources_project_created
    ON project_resources (project_id, created_at DESC);
