ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS brainstorm_board_id UUID
    REFERENCES brainstorm_boards(board_id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notifications_brainstorm_board
    ON notifications (brainstorm_board_id)
    WHERE brainstorm_board_id IS NOT NULL;
