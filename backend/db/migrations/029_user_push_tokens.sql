CREATE TABLE IF NOT EXISTS user_push_tokens (
    push_token TEXT PRIMARY KEY,
    firebase_uid TEXT NOT NULL,
    platform TEXT NOT NULL CHECK (platform IN ('android', 'ios')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_push_tokens_firebase_uid
    ON user_push_tokens (firebase_uid);
