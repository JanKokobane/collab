ALTER TABLE project_tasks
    ADD COLUMN IF NOT EXISTS deadline_warning_sent_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deadline_blocked_at TIMESTAMPTZ;
