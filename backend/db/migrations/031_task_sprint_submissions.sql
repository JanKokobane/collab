ALTER TABLE project_tasks
    ADD COLUMN IF NOT EXISTS sprint_submission_status TEXT NOT NULL DEFAULT 'Not submitted',
    ADD COLUMN IF NOT EXISTS sprint_submission_note TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS sprint_submission_attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS sprint_submission_links JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS sprint_submitted_by_firebase_uid TEXT,
    ADD COLUMN IF NOT EXISTS sprint_submitted_at TIMESTAMPTZ;

ALTER TABLE project_tasks
    ADD CONSTRAINT project_tasks_sprint_submission_status_check
        CHECK (sprint_submission_status IN ('Not submitted', 'Pending Review', 'Changes Requested', 'Completed'));
