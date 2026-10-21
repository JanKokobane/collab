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
