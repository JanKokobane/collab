ALTER TABLE project_meetings
    ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ended_by_firebase_uid TEXT;

CREATE TABLE IF NOT EXISTS project_meeting_screen_shares (
    meeting_id UUID PRIMARY KEY REFERENCES project_meetings(meeting_id) ON DELETE CASCADE,
    firebase_uid TEXT NOT NULL,
    participant_session_id TEXT NOT NULL,
    lease_expires_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
