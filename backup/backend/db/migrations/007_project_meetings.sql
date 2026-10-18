CREATE TABLE IF NOT EXISTS project_meetings (
    meeting_id UUID PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 255),
    meeting_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    pinned BOOLEAN NOT NULL DEFAULT TRUE,
    location TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    host_firebase_uid TEXT NOT NULL,
    host_name TEXT NOT NULL,
    attendee_firebase_uids JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(attendee_firebase_uids) = 'array'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_project_meetings_project_date
    ON project_meetings (project_id, meeting_date, start_time);
