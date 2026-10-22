ALTER TABLE project_meetings
    ADD COLUMN IF NOT EXISTS meeting_url TEXT NOT NULL DEFAULT '';
