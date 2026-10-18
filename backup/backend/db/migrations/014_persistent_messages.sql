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
