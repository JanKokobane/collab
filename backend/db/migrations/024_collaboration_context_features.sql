ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS is_decision BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE project_tasks
    ADD COLUMN IF NOT EXISTS chat_message_id UUID
        REFERENCES messages(message_id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS description_attachments JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(description_attachments) = 'array');

ALTER TABLE project_tasks
    DROP CONSTRAINT IF EXISTS project_tasks_status_check;

ALTER TABLE project_tasks
    ADD CONSTRAINT project_tasks_status_check
        CHECK (status IN ('Backlog', 'To do', 'In progress', 'Blocked', 'Done'));

ALTER TABLE project_task_comments
    ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(attachments) = 'array');

ALTER TABLE project_task_comments
    DROP CONSTRAINT IF EXISTS project_task_comments_body_check;

ALTER TABLE project_task_comments
    ADD CONSTRAINT project_task_comments_body_check
        CHECK (
            char_length(body) <= 5000
            AND (char_length(body) > 0 OR jsonb_array_length(attachments) > 0)
        );

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_tasks_chat_message
    ON project_tasks (chat_message_id)
    WHERE chat_message_id IS NOT NULL;

ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS related_task_id UUID
        REFERENCES project_tasks(task_id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS task_dependencies (
    predecessor_task_id UUID NOT NULL REFERENCES project_tasks(task_id) ON DELETE CASCADE,
    dependent_task_id UUID NOT NULL REFERENCES project_tasks(task_id) ON DELETE CASCADE,
    created_by_firebase_uid TEXT NOT NULL,
    warning_reason TEXT CHECK (warning_reason IN (
        'blocked', 'due_date_postponed', 'blocked_and_due_date_postponed'
    )),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (predecessor_task_id, dependent_task_id),
    CHECK (predecessor_task_id <> dependent_task_id)
);

CREATE INDEX IF NOT EXISTS idx_task_dependencies_dependent
    ON task_dependencies (dependent_task_id);

CREATE TABLE IF NOT EXISTS project_meeting_notes (
    meeting_id UUID PRIMARY KEY REFERENCES project_meetings(meeting_id) ON DELETE CASCADE,
    body TEXT NOT NULL DEFAULT '',
    updated_by_firebase_uid TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (char_length(body) <= 20000)
);

CREATE TABLE IF NOT EXISTS project_meeting_action_items (
    action_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID NOT NULL REFERENCES project_meetings(meeting_id) ON DELETE CASCADE,
    content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
    assignee_firebase_uid TEXT NOT NULL,
    due_date DATE,
    task_id UUID REFERENCES project_tasks(task_id) ON DELETE SET NULL,
    created_by_firebase_uid TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_meeting_action_items_meeting
    ON project_meeting_action_items (meeting_id, created_at, action_item_id);