CREATE TABLE IF NOT EXISTS notifications (
    id BIGSERIAL PRIMARY KEY,
    recipient_firebase_uid TEXT NOT NULL,
    project_id TEXT REFERENCES projects(project_id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    detail TEXT NOT NULL,
    avatar TEXT NOT NULL DEFAULT '•',
    tone_class TEXT NOT NULL DEFAULT 'coral-bg',
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created
    ON notifications (recipient_firebase_uid, created_at DESC);
