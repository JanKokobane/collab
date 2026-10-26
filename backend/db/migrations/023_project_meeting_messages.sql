CREATE TABLE IF NOT EXISTS project_meeting_messages (
    message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID NOT NULL REFERENCES project_meetings(meeting_id) ON DELETE CASCADE,
    sender_firebase_uid TEXT NOT NULL,
    sender_name TEXT NOT NULL,
    content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_meeting_messages_meeting_created
    ON project_meeting_messages (meeting_id, created_at DESC, message_id DESC);