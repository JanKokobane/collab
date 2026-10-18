CREATE TABLE IF NOT EXISTS project_reminders (
    reminder_id UUID PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 255),
    reminder_date DATE NOT NULL,
    reminder_time TIME NOT NULL,
    priority TEXT NOT NULL DEFAULT 'Normal'
        CHECK (priority IN ('Normal', 'High', 'Urgent')),
    created_by_firebase_uid TEXT NOT NULL,
    created_by_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_reminders_project_date
    ON project_reminders (project_id, reminder_date, reminder_time);
