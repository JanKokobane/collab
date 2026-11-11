ALTER TABLE project_tasks
    ADD COLUMN IF NOT EXISTS sprint_review_comment TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS sprint_reviewed_by_firebase_uid TEXT,
    ADD COLUMN IF NOT EXISTS sprint_reviewed_at TIMESTAMPTZ;
