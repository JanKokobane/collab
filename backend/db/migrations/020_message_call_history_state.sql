ALTER TABLE message_conversation_user_state
    ADD COLUMN IF NOT EXISTS calls_cleared_at TIMESTAMPTZ;