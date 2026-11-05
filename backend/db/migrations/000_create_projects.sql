CREATE TABLE IF NOT EXISTS projects (
    id BIGSERIAL PRIMARY KEY,
    project_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 255),
    project_type TEXT NOT NULL DEFAULT 'General Collaboration',
    time_span TEXT NOT NULL DEFAULT 'Ongoing',
    description TEXT,
    color TEXT NOT NULL DEFAULT 'coral',
    creator_firebase_uid TEXT NOT NULL,
    creator_email TEXT,
    creator_name TEXT,
    creator_initials TEXT,
    invited_members JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(invited_members) = 'array'),
    sprints JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(sprints) = 'array'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_creator_created
    ON projects (creator_firebase_uid, created_at DESC);
