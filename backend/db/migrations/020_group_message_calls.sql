/*
# Extend message calls to project conversations

1. Purpose
- Allow voice and video calls from direct, group, and channel conversations.
- Preserve existing caller/callee columns so existing call history remains compatible.

2. Modified table
- `message_calls.participant_uids` stores the Firebase user IDs invited to the call.
- `message_calls.participant_names` stores display names for the call participant list.

3. Security
- The API validates every invited participant against the conversation membership before creating a call.
- Realtime signaling validates both the sender and target against the stored participant list.

4. Compatibility
- Existing rows are backfilled with their caller and callee IDs and names.
- No existing rows or columns are deleted.
*/

ALTER TABLE message_calls
    ADD COLUMN IF NOT EXISTS participant_uids JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS participant_names JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE message_calls
SET participant_uids = jsonb_build_array(caller_uid, callee_uid),
    participant_names = jsonb_build_array(
        jsonb_build_object('uid', caller_uid, 'name', caller_name),
        jsonb_build_object('uid', callee_uid, 'name', callee_name)
    )
WHERE participant_uids = '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_message_calls_participant_uids
    ON message_calls USING GIN (participant_uids);
