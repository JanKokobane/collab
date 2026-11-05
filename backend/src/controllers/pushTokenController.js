const { query } = require('../config/db');

const savePushToken = async (req, res) => {
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    const platform = req.body?.platform;

    if (!token || token.length > 4096 || !['android', 'ios'].includes(platform)) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_PUSH_TOKEN',
            message: 'A valid device token and platform are required.'
        });
    }

    try {
        await query(
            `INSERT INTO user_push_tokens (firebase_uid, push_token, platform, updated_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (push_token)
             DO UPDATE SET firebase_uid = EXCLUDED.firebase_uid,
                           platform = EXCLUDED.platform,
                           updated_at = NOW()`,
            [req.firebaseUid, token, platform]
        );
        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('Save push token error:', error);
        return res.status(500).json({
            success: false,
            code: 'PUSH_TOKEN_SAVE_FAILED',
            message: 'Your device could not be registered for notifications.'
        });
    }
};

module.exports = { savePushToken };
