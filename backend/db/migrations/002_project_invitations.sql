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
