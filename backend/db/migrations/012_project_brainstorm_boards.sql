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
