ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS sprint_name TEXT;

CREATE INDEX IF NOT EXISTS idx_notifications_sprint_name
    ON notifications(sprint_name)
    WHERE sprint_name IS NOT NULL;
