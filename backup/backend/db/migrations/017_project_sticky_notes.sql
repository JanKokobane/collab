CREATE TABLE IF NOT EXISTS project_sticky_notes (
    note_id UUID PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    created_by_firebase_uid TEXT NOT NULL,
    content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
    color TEXT NOT NULL DEFAULT 'yellow'
        CHECK (color IN ('yellow', 'pink', 'blue', 'green')),
    position_x NUMERIC(6, 5) NOT NULL DEFAULT 0.08000
        CHECK (position_x BETWEEN 0 AND 1),
    position_y NUMERIC(6, 5) NOT NULL DEFAULT 0.12000
        CHECK (position_y BETWEEN 0 AND 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_sticky_notes_project_updated
    ON project_sticky_notes (project_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS project_sticky_note_recipients (
    note_id UUID NOT NULL REFERENCES project_sticky_notes(note_id) ON DELETE CASCADE,
    firebase_uid TEXT NOT NULL,
    PRIMARY KEY (note_id, firebase_uid)
);

CREATE INDEX IF NOT EXISTS idx_project_sticky_note_recipients_user
    ON project_sticky_note_recipients (firebase_uid, note_id);
