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
