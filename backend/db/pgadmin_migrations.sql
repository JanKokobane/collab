-- Consolidated schema migrations for a new, empty PostgreSQL database.
-- Run the entire script once in pgAdmin Query Tool, connected to the target database.
-- This creates the schema only; it does not copy application data from another database.
-- It records applied migration filenames so backend startup will not replay them.
BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_type = 'BASE TABLE'
          AND table_name <> 'schema_migrations'
    ) OR EXISTS (SELECT 1 FROM schema_migrations) THEN
        RAISE EXCEPTION 'This script is for a new, empty database only; existing tables or migration records were found.';
    END IF;
END
$$;

-- Migration: 000_create_projects.sql
CREATE TABLE IF NOT EXISTS projects (
    id BIGSERIAL PRIMARY KEY,
    project_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 255),
    project_type TEXT NOT NULL DEFAULT 'General Collaboration',
    time_span TEXT NOT NULL DEFAULT 'Ongoing',
    description TEXT,
    color TEXT NOT NULL DEFAULT 'coral',
    creator_firebase_uid TEXT NOT NULL,
    creator_email TEXT,
    creator_name TEXT,
    creator_initials TEXT,
    invited_members JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(invited_members) = 'array'),
    sprints JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(sprints) = 'array'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_creator_created
    ON projects (creator_firebase_uid, created_at DESC);
INSERT INTO schema_migrations (version) VALUES ('000_create_projects.sql');

-- Migration: 001_create_notifications.sql
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
INSERT INTO schema_migrations (version) VALUES ('001_create_notifications.sql');

-- Migration: 002_project_invitations.sql
CREATE TABLE IF NOT EXISTS project_invitations (
    id BIGSERIAL PRIMARY KEY,
    invitation_id UUID NOT NULL UNIQUE,
    project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    invited_by_firebase_uid TEXT NOT NULL,
    invited_email TEXT NOT NULL,
    invited_name TEXT NOT NULL,
    role TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'declined', 'revoked', 'delivery_failed')),
    invited_firebase_uid TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    responded_at TIMESTAMPTZ,
    CONSTRAINT project_invitations_role_check
        CHECK (role IN (
            'Workspace Admin',
            'Product Lead',
            'Designer',
            'Engineer',
            'QA Specialist',
            'Content Strategist',
            'Member'
        ))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_invitations_pending_email
    ON project_invitations (project_id, invited_email)
    WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_invitations_accepted_email
    ON project_invitations (project_id, invited_email)
    WHERE status = 'accepted';

CREATE INDEX IF NOT EXISTS idx_project_invitations_member_access
    ON project_invitations (invited_firebase_uid, project_id)
    WHERE status = 'accepted';
INSERT INTO schema_migrations (version) VALUES ('002_project_invitations.sql');

-- Migration: 003_notification_invitations.sql
ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS invitation_id UUID
    REFERENCES project_invitations(invitation_id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notifications_invitation
    ON notifications (invitation_id)
    WHERE invitation_id IS NOT NULL;
INSERT INTO schema_migrations (version) VALUES ('003_notification_invitations.sql');

-- Migration: 004_user_profiles.sql
CREATE TABLE IF NOT EXISTS user_profiles (
    firebase_uid TEXT PRIMARY KEY,
    profile_image TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO schema_migrations (version) VALUES ('004_user_profiles.sql');

-- Migration: 005_project_tasks.sql
CREATE TABLE IF NOT EXISTS project_tasks (
    task_id UUID PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 255),
    description TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'Product',
    sprint_name TEXT NOT NULL,
    assignee_firebase_uid TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'To do'
        CHECK (status IN ('Backlog', 'To do', 'In progress', 'Done')),
    start_date DATE,
    due_date DATE,
    created_by_firebase_uid TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_tasks_project
    ON project_tasks (project_id, created_at);

CREATE INDEX IF NOT EXISTS idx_project_tasks_assignee
    ON project_tasks (assignee_firebase_uid, project_id);
INSERT INTO schema_migrations (version) VALUES ('005_project_tasks.sql');

-- Migration: 006_project_task_comments.sql
CREATE TABLE IF NOT EXISTS project_task_comments (
    comment_id BIGSERIAL PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES project_tasks(task_id) ON DELETE CASCADE,
    author_firebase_uid TEXT NOT NULL,
    author_name TEXT NOT NULL,
    author_email TEXT,
    body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_task_comments_task_created
    ON project_task_comments (task_id, created_at, comment_id);
INSERT INTO schema_migrations (version) VALUES ('006_project_task_comments.sql');

-- Migration: 007_project_meetings.sql
CREATE TABLE IF NOT EXISTS project_meetings (
    meeting_id UUID PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 255),
    meeting_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    pinned BOOLEAN NOT NULL DEFAULT TRUE,
    location TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    host_firebase_uid TEXT NOT NULL,
    host_name TEXT NOT NULL,
    attendee_firebase_uids JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(attendee_firebase_uids) = 'array'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_project_meetings_project_date
    ON project_meetings (project_id, meeting_date, start_time);
INSERT INTO schema_migrations (version) VALUES ('007_project_meetings.sql');

-- Migration: 008_project_reminders.sql
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
INSERT INTO schema_migrations (version) VALUES ('008_project_reminders.sql');

-- Migration: 009_project_resources.sql
CREATE TABLE IF NOT EXISTS project_resources (
    resource_id UUID PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 255),
    target_url TEXT NOT NULL CHECK (char_length(target_url) BETWEEN 1 AND 2048),
    category TEXT NOT NULL
        CHECK (category IN ('Design', 'Engineering', 'Product', 'Testing', 'Meetings', 'Analytics')),
    created_by_firebase_uid TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_resources_project_created
    ON project_resources (project_id, created_at DESC);
INSERT INTO schema_migrations (version) VALUES ('009_project_resources.sql');

-- Migration: 010_expand_project_resource_categories.sql
ALTER TABLE project_resources
    DROP CONSTRAINT IF EXISTS project_resources_category_check;

ALTER TABLE project_resources
    ADD CONSTRAINT project_resources_category_check
    CHECK (category IN (
        'Design',
        'Engineering',
        'Product',
        'Testing',
        'Meetings',
        'Analytics',
        'Documentation',
        'Research',
        'Marketing',
        'Sales',
        'Customer Support',
        'Operations',
        'Finance',
        'Legal',
        'Human Resources',
        'Recruiting',
        'Strategy',
        'Planning',
        'Roadmaps',
        'Requirements',
        'Specifications',
        'Architecture',
        'APIs & Integrations',
        'Code Repositories',
        'DevOps',
        'Cybersecurity',
        'Data Science',
        'Databases',
        'Infrastructure',
        'Deployment',
        'Monitoring',
        'Incident Response',
        'Quality Assurance',
        'Bug Tracking',
        'User Experience',
        'Prototyping',
        'Branding',
        'Content',
        'SEO',
        'Social Media',
        'Campaigns',
        'Competitor Analysis',
        'Training',
        'Onboarding',
        'Policies',
        'Contracts',
        'Vendor Management',
        'Reports',
        'Presentations',
        'Other'
    ));
INSERT INTO schema_migrations (version) VALUES ('010_expand_project_resource_categories.sql');

-- Migration: 011_persistent_user_profile_fields.sql
ALTER TABLE user_profiles
    ADD COLUMN IF NOT EXISTS full_name TEXT,
    ADD COLUMN IF NOT EXISTS email TEXT,
    ADD COLUMN IF NOT EXISTS phone_country_code TEXT,
    ADD COLUMN IF NOT EXISTS phone_number TEXT,
    ADD COLUMN IF NOT EXISTS workspace TEXT,
    ADD COLUMN IF NOT EXISTS role TEXT,
    ADD COLUMN IF NOT EXISTS collaboration_type TEXT,
    ADD COLUMN IF NOT EXISTS collaboration_details TEXT,
    ADD COLUMN IF NOT EXISTS industry TEXT,
    ADD COLUMN IF NOT EXISTS avatar_tone TEXT,
    ADD COLUMN IF NOT EXISTS status TEXT,
    ADD COLUMN IF NOT EXISTS timezone TEXT;
INSERT INTO schema_migrations (version) VALUES ('011_persistent_user_profile_fields.sql');

-- Migration: 012_project_brainstorm_boards.sql
CREATE TABLE IF NOT EXISTS brainstorm_boards (
    board_id UUID PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
    created_by_firebase_uid TEXT NOT NULL,
    board_data JSONB NOT NULL DEFAULT '{"notes":[],"links":[]}'::jsonb
        CHECK (jsonb_typeof(board_data) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS brainstorm_board_members (
    board_id UUID NOT NULL REFERENCES brainstorm_boards(board_id) ON DELETE CASCADE,
    firebase_uid TEXT NOT NULL,
    invited_by_firebase_uid TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (board_id, firebase_uid)
);

CREATE INDEX IF NOT EXISTS idx_brainstorm_boards_project_updated
    ON brainstorm_boards (project_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_brainstorm_board_members_user
    ON brainstorm_board_members (firebase_uid, board_id);
INSERT INTO schema_migrations (version) VALUES ('012_project_brainstorm_boards.sql');

-- Migration: 013_brainstorm_board_notifications.sql
ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS brainstorm_board_id UUID
    REFERENCES brainstorm_boards(board_id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notifications_brainstorm_board
    ON notifications (brainstorm_board_id)
    WHERE brainstorm_board_id IS NOT NULL;
INSERT INTO schema_migrations (version) VALUES ('013_brainstorm_board_notifications.sql');

-- Migration: 014_persistent_messages.sql
CREATE TABLE IF NOT EXISTS message_conversations (
    conversation_id UUID PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    conversation_type TEXT NOT NULL CHECK (conversation_type IN ('direct', 'group', 'channel')),
    name TEXT NOT NULL DEFAULT '',
    created_by_firebase_uid TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
        (conversation_type = 'direct' AND name = '') OR
        (conversation_type IN ('group', 'channel') AND char_length(name) BETWEEN 1 AND 60)
    )
);

CREATE TABLE IF NOT EXISTS message_conversation_members (
    conversation_id UUID NOT NULL REFERENCES message_conversations(conversation_id) ON DELETE CASCADE,
    firebase_uid TEXT NOT NULL,
    email TEXT NOT NULL,
    display_name TEXT NOT NULL,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_read_at TIMESTAMPTZ,
    PRIMARY KEY (conversation_id, firebase_uid)
);

CREATE TABLE IF NOT EXISTS messages (
    message_id UUID PRIMARY KEY,
    conversation_id UUID NOT NULL REFERENCES message_conversations(conversation_id) ON DELETE CASCADE,
    sender_firebase_uid TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    reply_to_message_id UUID REFERENCES messages(message_id) ON DELETE SET NULL,
    attachments JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(attachments) = 'array'),
    forwarded_from JSONB,
    is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
    edited_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (char_length(body) <= 5000),
    CHECK (jsonb_array_length(attachments) <= 10),
    CHECK (char_length(body) > 0 OR jsonb_array_length(attachments) > 0)
);

CREATE TABLE IF NOT EXISTS message_reactions (
    message_id UUID NOT NULL REFERENCES messages(message_id) ON DELETE CASCADE,
    firebase_uid TEXT NOT NULL,
    emoji TEXT NOT NULL CHECK (emoji IN ('👍', '❤️', '😂', '🎉', '👀', '🙌', '🔥', '✅', '🤔', '😄')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (message_id, firebase_uid, emoji)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_message_reactions_one_per_user
    ON message_reactions (message_id, firebase_uid);

CREATE TABLE IF NOT EXISTS message_reads (
    message_id UUID NOT NULL REFERENCES messages(message_id) ON DELETE CASCADE,
    firebase_uid TEXT NOT NULL,
    read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (message_id, firebase_uid)
);

CREATE INDEX IF NOT EXISTS idx_message_conversation_members_user
    ON message_conversation_members (firebase_uid, conversation_id);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
    ON messages (conversation_id, created_at, message_id);

CREATE INDEX IF NOT EXISTS idx_message_reads_user
    ON message_reads (firebase_uid, message_id);
INSERT INTO schema_migrations (version) VALUES ('014_persistent_messages.sql');

-- Migration: 015_message_delete_scopes.sql
ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS message_hidden_for (
    message_id UUID NOT NULL REFERENCES messages(message_id) ON DELETE CASCADE,
    firebase_uid TEXT NOT NULL,
    hidden_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (message_id, firebase_uid)
);

CREATE INDEX IF NOT EXISTS idx_message_hidden_for_user
    ON message_hidden_for (firebase_uid, message_id);
INSERT INTO schema_migrations (version) VALUES ('015_message_delete_scopes.sql');

-- Migration: 016_project_scratchpads.sql
CREATE TABLE IF NOT EXISTS project_scratchpads (
    project_id TEXT PRIMARY KEY REFERENCES projects(project_id) ON DELETE CASCADE,
    content TEXT NOT NULL DEFAULT '' CHECK (char_length(content) <= 50000),
    updated_by_firebase_uid TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO schema_migrations (version) VALUES ('016_project_scratchpads.sql');

-- Migration: 017_project_sticky_notes.sql
CREATE TABLE IF NOT EXISTS project_sticky_notes (
    note_id UUID PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    created_by_firebase_uid TEXT NOT NULL,
    content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
    color TEXT NOT NULL DEFAULT 'yellow'
        CHECK (color IN ('yellow', 'pink', 'blue', 'green')),
    position_x NUMERIC(6, 5) NOT NULL DEFAULT 0.08000
        CHECK (position_x BETWEEN 0 AND 1),
    position_y NUMERIC(6, 5) NOT NULL DEFAULT 0.12000
        CHECK (position_y BETWEEN 0 AND 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_sticky_notes_project_updated
    ON project_sticky_notes (project_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS project_sticky_note_recipients (
    note_id UUID NOT NULL REFERENCES project_sticky_notes(note_id) ON DELETE CASCADE,
    firebase_uid TEXT NOT NULL,
    PRIMARY KEY (note_id, firebase_uid)
);

CREATE INDEX IF NOT EXISTS idx_project_sticky_note_recipients_user
    ON project_sticky_note_recipients (firebase_uid, note_id);
INSERT INTO schema_migrations (version) VALUES ('017_project_sticky_notes.sql');

-- Migration: 018_message_presence.sql
ALTER TABLE user_profiles
    ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
INSERT INTO schema_migrations (version) VALUES ('018_message_presence.sql');

-- Migration: 019_message_realtime.sql
ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS sender_email TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS sender_name TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS reply_to_body TEXT,
    ADD COLUMN IF NOT EXISTS reply_to_sender_name TEXT,
    ADD COLUMN IF NOT EXISTS client_message_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_client_message_id
    ON messages (conversation_id, sender_firebase_uid, client_message_id)
    WHERE client_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS message_conversation_user_state (
    conversation_id UUID NOT NULL REFERENCES message_conversations(conversation_id) ON DELETE CASCADE,
    firebase_uid TEXT NOT NULL,
    hidden_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ,
    PRIMARY KEY (conversation_id, firebase_uid)
);

CREATE TABLE IF NOT EXISTS message_deliveries (
    message_id UUID NOT NULL REFERENCES messages(message_id) ON DELETE CASCADE,
    firebase_uid TEXT NOT NULL,
    delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (message_id, firebase_uid)
);

CREATE TABLE IF NOT EXISTS message_presence (
    firebase_uid TEXT PRIMARY KEY,
    is_online BOOLEAN NOT NULL DEFAULT FALSE,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS message_calls (
    call_id UUID PRIMARY KEY,
    conversation_id UUID NOT NULL REFERENCES message_conversations(conversation_id) ON DELETE CASCADE,
    caller_uid TEXT NOT NULL,
    caller_name TEXT NOT NULL,
    callee_uid TEXT NOT NULL,
    callee_name TEXT NOT NULL,
    call_type TEXT NOT NULL CHECK (call_type IN ('audio', 'video')),
    status TEXT NOT NULL CHECK (status IN ('ringing', 'accepted', 'declined', 'missed', 'ended')),
    daily_room_name TEXT NOT NULL,
    daily_room_url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    ring_expires_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    ended_by_uid TEXT
);

CREATE INDEX IF NOT EXISTS idx_message_calls_active
    ON message_calls (conversation_id, status, created_at DESC)
    WHERE status IN ('ringing', 'accepted');
INSERT INTO schema_migrations (version) VALUES ('019_message_realtime.sql');

-- Migration: 020_message_call_history_state.sql
ALTER TABLE message_conversation_user_state
    ADD COLUMN IF NOT EXISTS calls_cleared_at TIMESTAMPTZ;
INSERT INTO schema_migrations (version) VALUES ('020_message_call_history_state.sql');

-- Migration: 021_message_call_participants.sql
CREATE TABLE IF NOT EXISTS message_call_participants (
    call_id UUID NOT NULL REFERENCES message_calls(call_id) ON DELETE CASCADE,
    firebase_uid TEXT NOT NULL,
    display_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('ringing', 'accepted', 'declined', 'missed', 'left')),
    invited_by_uid TEXT,
    invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    left_at TIMESTAMPTZ,
    PRIMARY KEY (call_id, firebase_uid)
);

CREATE INDEX IF NOT EXISTS idx_message_call_participants_user_active
    ON message_call_participants (firebase_uid, status, call_id);

INSERT INTO message_call_participants (
    call_id, firebase_uid, display_name, status, invited_by_uid, invited_at, accepted_at
)
SELECT call_id, caller_uid, caller_name, 'accepted', caller_uid, created_at, accepted_at
FROM message_calls
ON CONFLICT (call_id, firebase_uid) DO NOTHING;

INSERT INTO message_call_participants (
    call_id, firebase_uid, display_name, status, invited_by_uid, invited_at, accepted_at, left_at
)
SELECT call_id, callee_uid, callee_name,
       CASE status
           WHEN 'accepted' THEN 'accepted'
           WHEN 'declined' THEN 'declined'
           WHEN 'missed' THEN 'missed'
           WHEN 'ended' THEN 'left'
           ELSE 'ringing'
       END,
       caller_uid, created_at, accepted_at, ended_at
FROM message_calls
ON CONFLICT (call_id, firebase_uid) DO NOTHING;
INSERT INTO schema_migrations (version) VALUES ('021_message_call_participants.sql');

-- Migration: 022_project_meeting_urls.sql
ALTER TABLE project_meetings
    ADD COLUMN IF NOT EXISTS meeting_url TEXT NOT NULL DEFAULT '';
INSERT INTO schema_migrations (version) VALUES ('022_project_meeting_urls.sql');

-- Migration: 023_project_meeting_messages.sql
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
INSERT INTO schema_migrations (version) VALUES ('023_project_meeting_messages.sql');

-- Migration: 024_collaboration_context_features.sql
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
INSERT INTO schema_migrations (version) VALUES ('024_collaboration_context_features.sql');

-- Migration: 025_project_task_priority.sql
ALTER TABLE project_tasks
    ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'medium'
        CHECK (priority IN ('none', 'low', 'medium', 'high', 'urgent'));
INSERT INTO schema_migrations (version) VALUES ('025_project_task_priority.sql');

-- Migration: 025_project_timeline_dates.sql
ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS start_date DATE,
    ADD COLUMN IF NOT EXISTS due_date DATE;

WITH extracted_dates AS (
    SELECT
        project_id,
        regexp_match(
            time_span,
            '\(about [^;]+; ([A-Za-z]{3} [0-9]{1,2}, [0-9]{4}) – ([A-Za-z]{3} [0-9]{1,2}, [0-9]{4})\)'
        ) AS dates
    FROM projects
    WHERE start_date IS NULL
      AND due_date IS NULL
)
UPDATE projects
SET start_date = to_date(extracted_dates.dates[1], 'Mon DD, YYYY'),
    due_date = to_date(extracted_dates.dates[2], 'Mon DD, YYYY')
FROM extracted_dates
WHERE extracted_dates.project_id = projects.project_id
  AND extracted_dates.dates IS NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'projects_timeline_dates_ordered'
          AND conrelid = 'projects'::regclass
    ) THEN
        ALTER TABLE projects
            ADD CONSTRAINT projects_timeline_dates_ordered
                CHECK (
                    (start_date IS NULL AND due_date IS NULL) OR
                    (start_date IS NOT NULL AND due_date IS NOT NULL AND due_date >= start_date)
                );
    END IF;
END
$$;
INSERT INTO schema_migrations (version) VALUES ('025_project_timeline_dates.sql');

-- Migration: 026_meeting_live_controls.sql
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
INSERT INTO schema_migrations (version) VALUES ('026_meeting_live_controls.sql');

-- Migration: 027_expand_project_invitation_roles.sql
ALTER TABLE project_invitations
    DROP CONSTRAINT IF EXISTS project_invitations_role_check;

ALTER TABLE project_invitations
    ADD CONSTRAINT project_invitations_role_check
    CHECK (role IN (
        'Workspace Admin',
        'Product Lead',
        'Designer',
        'Engineer',
        'QA Specialist',
        'Content Strategist',
        'Member',
        'Project Manager',
        'Program Manager',
        'Scrum Master',
        'Agile Coach',
        'Business Analyst',
        'Systems Analyst',
        'Data Analyst',
        'Data Scientist',
        'Machine Learning Engineer',
        'DevOps Engineer',
        'Site Reliability Engineer',
        'Security Engineer',
        'QA Lead',
        'Test Automation Engineer',
        'UX Researcher',
        'UX Writer',
        'UI Designer',
        'Product Designer',
        'Visual Designer',
        'Brand Designer',
        'Motion Designer',
        'Frontend Developer',
        'Backend Developer',
        'Full-Stack Developer',
        'Mobile Developer',
        'API Developer',
        'Database Administrator',
        'Technical Writer',
        'Documentation Specialist',
        'Content Writer',
        'Copywriter',
        'Editor',
        'SEO Specialist',
        'Marketing Manager',
        'Growth Marketer',
        'Social Media Manager',
        'Community Manager',
        'Customer Success Manager',
        'Support Specialist',
        'Sales Lead',
        'Operations Manager',
        'Finance Manager',
        'HR Manager',
        'Legal Advisor',
        'Stakeholder',
        'Business Owner',
        'Product Owner',
        'Delivery Manager',
        'Release Manager',
        'Researcher'
    ));
INSERT INTO schema_migrations (version) VALUES ('027_expand_project_invitation_roles.sql');

-- Migration: 028_task_deadline_tracking.sql
ALTER TABLE project_tasks
    ADD COLUMN IF NOT EXISTS deadline_warning_sent_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deadline_blocked_at TIMESTAMPTZ;
INSERT INTO schema_migrations (version) VALUES ('028_task_deadline_tracking.sql');

-- Migration: 029_user_push_tokens.sql
CREATE TABLE IF NOT EXISTS user_push_tokens (
    push_token TEXT PRIMARY KEY,
    firebase_uid TEXT NOT NULL,
    platform TEXT NOT NULL CHECK (platform IN ('android', 'ios')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_push_tokens_firebase_uid
    ON user_push_tokens (firebase_uid);
INSERT INTO schema_migrations (version) VALUES ('029_user_push_tokens.sql');

-- Migration: 030_project_task_tags.sql
ALTER TABLE project_tasks
    ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb;
INSERT INTO schema_migrations (version) VALUES ('030_project_task_tags.sql');

-- Migration: 031_task_sprint_submissions.sql
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
INSERT INTO schema_migrations (version) VALUES ('031_task_sprint_submissions.sql');

-- Migration: 032_task_sprint_review_feedback.sql
ALTER TABLE project_tasks
    ADD COLUMN IF NOT EXISTS sprint_review_comment TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS sprint_reviewed_by_firebase_uid TEXT,
    ADD COLUMN IF NOT EXISTS sprint_reviewed_at TIMESTAMPTZ;
INSERT INTO schema_migrations (version) VALUES ('032_task_sprint_review_feedback.sql');

-- Migration: 034_sprint_membership.sql
UPDATE projects AS project
SET sprints = COALESCE((
    SELECT jsonb_agg(
        (
            sprint.value
                - 'member_firebase_uids'
                - 'assigneeFirebaseUid'
                - 'assignee_firebase_uid'
                - 'assigneeName'
                - 'assignee_name'
                - 'assigneeProfileImage'
                - 'assignee_profile_image'
        ) || jsonb_build_object(
            'memberFirebaseUids',
            CASE
                WHEN jsonb_typeof(sprint.value->'memberFirebaseUids') = 'array'
                    THEN sprint.value->'memberFirebaseUids'
                WHEN jsonb_typeof(sprint.value->'member_firebase_uids') = 'array'
                    THEN sprint.value->'member_firebase_uids'
                WHEN COALESCE(
                    NULLIF(sprint.value->>'assigneeFirebaseUid', ''),
                    NULLIF(sprint.value->>'assignee_firebase_uid', '')
                ) IS NOT NULL
                    THEN jsonb_build_array(COALESCE(
                        NULLIF(sprint.value->>'assigneeFirebaseUid', ''),
                        NULLIF(sprint.value->>'assignee_firebase_uid', '')
                    ))
                ELSE '[]'::jsonb
            END
        )
        ORDER BY sprint.ordinality
    )
    FROM jsonb_array_elements(project.sprints)
        WITH ORDINALITY AS sprint(value, ordinality)
), '[]'::jsonb)
WHERE jsonb_typeof(project.sprints) = 'array';
INSERT INTO schema_migrations (version) VALUES ('034_sprint_membership.sql');

-- Migration: 035_remove_task_assignee.sql
DROP INDEX IF EXISTS idx_project_tasks_assignee;

ALTER TABLE project_tasks
    DROP COLUMN IF EXISTS assignee_firebase_uid;
INSERT INTO schema_migrations (version) VALUES ('035_remove_task_assignee.sql');

-- Migration: 036_remove_task_sprint_link.sql
ALTER TABLE project_tasks
    DROP COLUMN IF EXISTS sprint_name;

DO $$
DECLARE
    column_migration RECORD;
    old_column_exists BOOLEAN;
    new_column_exists BOOLEAN;
BEGIN
    FOR column_migration IN
        SELECT *
        FROM (VALUES
            (
                'sprint_submission_status',
                'task_submission_status',
                'TEXT NOT NULL DEFAULT ''Not submitted'''
            ),
            (
                'sprint_submission_note',
                'task_submission_note',
                'TEXT NOT NULL DEFAULT '''''
            ),
            (
                'sprint_submission_attachments',
                'task_submission_attachments',
                'JSONB NOT NULL DEFAULT ''[]''::jsonb'
            ),
            (
                'sprint_submission_links',
                'task_submission_links',
                'JSONB NOT NULL DEFAULT ''[]''::jsonb'
            ),
            (
                'sprint_submitted_by_firebase_uid',
                'task_submitted_by_firebase_uid',
                'TEXT'
            ),
            (
                'sprint_submitted_at',
                'task_submitted_at',
                'TIMESTAMPTZ'
            ),
            (
                'sprint_review_comment',
                'task_review_comment',
                'TEXT NOT NULL DEFAULT '''''
            ),
            (
                'sprint_reviewed_by_firebase_uid',
                'task_reviewed_by_firebase_uid',
                'TEXT'
            ),
            (
                'sprint_reviewed_at',
                'task_reviewed_at',
                'TIMESTAMPTZ'
            )
        ) AS columns_to_migrate(old_name, new_name, definition)
    LOOP
        SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'project_tasks'
              AND column_name = column_migration.old_name
        ) INTO old_column_exists;

        SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'project_tasks'
              AND column_name = column_migration.new_name
        ) INTO new_column_exists;

        IF old_column_exists AND new_column_exists THEN
            RAISE EXCEPTION
                'Both project_tasks columns "%" and "%" exist; resolve their data before retrying migration 036',
                column_migration.old_name,
                column_migration.new_name;
        ELSIF old_column_exists THEN
            EXECUTE format(
                'ALTER TABLE project_tasks RENAME COLUMN %I TO %I',
                column_migration.old_name,
                column_migration.new_name
            );
        ELSIF NOT new_column_exists THEN
            EXECUTE format(
                'ALTER TABLE project_tasks ADD COLUMN %I %s',
                column_migration.new_name,
                column_migration.definition
            );
        END IF;
    END LOOP;

    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'project_tasks'::regclass
          AND conname = 'project_tasks_sprint_submission_status_check'
    ) AND NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'project_tasks'::regclass
          AND conname = 'project_tasks_task_submission_status_check'
    ) THEN
        ALTER TABLE project_tasks
            RENAME CONSTRAINT project_tasks_sprint_submission_status_check
            TO project_tasks_task_submission_status_check;
    ELSIF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'project_tasks'::regclass
          AND conname = 'project_tasks_task_submission_status_check'
    ) THEN
        ALTER TABLE project_tasks
            ADD CONSTRAINT project_tasks_task_submission_status_check
            CHECK (task_submission_status IN (
                'Not submitted',
                'Pending Review',
                'Changes Requested',
                'Completed'
            ));
    END IF;
END
$$;
INSERT INTO schema_migrations (version) VALUES ('036_remove_task_sprint_link.sql');

-- Migration: 037_project_task_assignee.sql
ALTER TABLE project_tasks
    ADD COLUMN IF NOT EXISTS assignee_firebase_uid TEXT;

CREATE INDEX IF NOT EXISTS idx_project_tasks_assignee
    ON project_tasks (assignee_firebase_uid, project_id)
    WHERE assignee_firebase_uid IS NOT NULL;
INSERT INTO schema_migrations (version) VALUES ('037_project_task_assignee.sql');

-- Migration: 038_project_sprints.sql
CREATE TABLE IF NOT EXISTS project_sprints (
    sprint_id UUID PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 255),
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Active',
    start_date DATE,
    due_date DATE,
    attachments JSONB NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(attachments) = 'array'),
    details JSONB NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(details) = 'object'),
    created_by_firebase_uid TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (due_date IS NULL OR start_date IS NULL OR due_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_project_sprints_project_created
    ON project_sprints (project_id, created_at, sprint_id);

INSERT INTO project_sprints (
    sprint_id,
    project_id,
    name,
    description,
    status,
    start_date,
    due_date,
    attachments,
    details,
    created_by_firebase_uid
)
SELECT
    md5(project.project_id || ':' || COALESCE(
        NULLIF(sprint.value->>'id', ''),
        NULLIF(sprint.value->>'name', ''),
        sprint.ordinality::text
    ))::uuid,
    project.project_id,
    left(btrim(sprint.value->>'name'), 255),
    COALESCE(sprint.value->>'description', ''),
    COALESCE(NULLIF(sprint.value->>'status', ''), 'Active'),
    CASE
        WHEN sprint.value->>'startDate' ~ '^\d{4}-\d{2}-\d{2}$'
            THEN (sprint.value->>'startDate')::date
        WHEN sprint.value->>'start_date' ~ '^\d{4}-\d{2}-\d{2}$'
            THEN (sprint.value->>'start_date')::date
        ELSE NULL
    END,
    CASE
        WHEN sprint.value->>'dueDate' ~ '^\d{4}-\d{2}-\d{2}$'
            THEN (sprint.value->>'dueDate')::date
        WHEN sprint.value->>'due_date' ~ '^\d{4}-\d{2}-\d{2}$'
            THEN (sprint.value->>'due_date')::date
        WHEN sprint.value->>'endDate' ~ '^\d{4}-\d{2}-\d{2}$'
            THEN (sprint.value->>'endDate')::date
        WHEN sprint.value->>'end_date' ~ '^\d{4}-\d{2}-\d{2}$'
            THEN (sprint.value->>'end_date')::date
        ELSE NULL
    END,
    CASE
        WHEN jsonb_typeof(sprint.value->'attachments') = 'array'
            THEN sprint.value->'attachments'
        ELSE '[]'::jsonb
    END,
    sprint.value,
    project.creator_firebase_uid
FROM projects AS project
CROSS JOIN LATERAL jsonb_array_elements(
    CASE
        WHEN jsonb_typeof(project.sprints) = 'array' THEN project.sprints
        ELSE '[]'::jsonb
    END
) WITH ORDINALITY AS sprint(value, ordinality)
WHERE NULLIF(btrim(sprint.value->>'name'), '') IS NOT NULL
ON CONFLICT (sprint_id) DO NOTHING;

UPDATE projects
SET sprints = '[]'::jsonb
WHERE jsonb_typeof(sprints) = 'array'
  AND jsonb_array_length(sprints) > 0;
INSERT INTO schema_migrations (version) VALUES ('038_project_sprints.sql');

COMMIT;
