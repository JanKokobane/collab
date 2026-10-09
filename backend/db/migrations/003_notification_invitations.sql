ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS invitation_id UUID
    REFERENCES project_invitations(invitation_id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notifications_invitation
    ON notifications (invitation_id)
    WHERE invitation_id IS NOT NULL;
