const { query } = require('../config/db');

const getNotifications = async (req, res) => {
    try {
        const result = await query(
            `
                SELECT
                    n.id,
                    n.project_id,
                    n.brainstorm_board_id,
                    n.invitation_id,
                    pi.status AS invitation_status,
                    pi.expires_at AS invitation_expires_at,
                    n.type,
                    n.title,
                    n.detail,
                    n.avatar,
                    n.tone_class,
                    n.is_read,
                    n.created_at
                FROM notifications n
                LEFT JOIN project_invitations pi
                    ON pi.invitation_id = n.invitation_id
                WHERE n.recipient_firebase_uid = $1
                ORDER BY n.created_at DESC
            `,
            [req.firebaseUid]
        );

        return res.status(200).json({
            success: true,
            data: { notifications: result.rows }
        });
    } catch (error) {
        console.error('Get notifications error:', error);
        return res.status(500).json({
            success: false,
            code: 'NOTIFICATIONS_FETCH_FAILED',
            message: 'Notifications could not be retrieved.'
        });
    }
};

const markNotificationRead = async (req, res) => {
    try {
        const { notificationId } = req.params;
        if (!/^[1-9]\d*$/.test(notificationId)) {
            return res.status(400).json({
                success: false,
                code: 'INVALID_NOTIFICATION_ID',
                message: 'Notification ID must be a positive integer.'
            });
        }

        const result = await query(
            `
                UPDATE notifications
                SET is_read = TRUE
                WHERE id = $1
                  AND recipient_firebase_uid = $2
                RETURNING id, is_read
            `,
            [notificationId, req.firebaseUid]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                code: 'NOTIFICATION_NOT_FOUND',
                message: 'Notification not found.'
            });
        }

        return res.status(200).json({
            success: true,
            data: { notification: result.rows[0] }
        });
    } catch (error) {
        console.error('Mark notification read error:', error);
        return res.status(500).json({
            success: false,
            code: 'NOTIFICATION_UPDATE_FAILED',
            message: 'The notification could not be updated.'
        });
    }
};

const markAllNotificationsRead = async (req, res) => {
    try {
        const result = await query(
            `
                UPDATE notifications
                SET is_read = TRUE
                WHERE recipient_firebase_uid = $1
                  AND is_read = FALSE
            `,
            [req.firebaseUid]
        );

        return res.status(200).json({
            success: true,
            data: { updatedCount: result.rowCount }
        });
    } catch (error) {
        console.error('Mark all notifications read error:', error);
        return res.status(500).json({
            success: false,
            code: 'NOTIFICATIONS_UPDATE_FAILED',
            message: 'Notifications could not be updated.'
        });
    }
};

const clearNotifications = async (req, res) => {
    try {
        const result = await query(
            `
                DELETE FROM notifications
                WHERE recipient_firebase_uid = $1
                  AND NOT EXISTS (
                      SELECT 1
                      FROM project_invitations pi
                      WHERE pi.invitation_id = notifications.invitation_id
                        AND pi.status = 'pending'
                        AND pi.expires_at > NOW()
                  )
            `,
            [req.firebaseUid]
        );

        return res.status(200).json({
            success: true,
            data: { deletedCount: result.rowCount }
        });
    } catch (error) {
        console.error('Clear notifications error:', error);
        return res.status(500).json({
            success: false,
            code: 'NOTIFICATIONS_DELETE_FAILED',
            message: 'Notifications could not be cleared.'
        });
    }
};

const deleteNotification = async (req, res) => {
    try {
        const { notificationId } = req.params;
        if (!/^[1-9]\d*$/.test(notificationId)) {
            return res.status(400).json({
                success: false,
                code: 'INVALID_NOTIFICATION_ID',
                message: 'Notification ID must be a positive integer.'
            });
        }

        const result = await query(
            `
                DELETE FROM notifications
                WHERE id = $1
                  AND recipient_firebase_uid = $2
                  AND NOT EXISTS (
                      SELECT 1
                      FROM project_invitations pi
                      WHERE pi.invitation_id = notifications.invitation_id
                        AND pi.status = 'pending'
                        AND pi.expires_at > NOW()
                  )
                RETURNING id
            `,
            [notificationId, req.firebaseUid]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                code: 'NOTIFICATION_NOT_FOUND',
                message: 'Notification not found.'
            });
        }

        return res.status(200).json({
            success: true,
            data: { notification: result.rows[0] }
        });
    } catch (error) {
        console.error('Delete notification error:', error);
        return res.status(500).json({
            success: false,
            code: 'NOTIFICATION_DELETE_FAILED',
            message: 'The notification could not be deleted.'
        });
    }
};

module.exports = {
    getNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    clearNotifications,
    deleteNotification
};
