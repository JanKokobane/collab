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
