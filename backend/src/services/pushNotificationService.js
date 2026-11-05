const { getFirebaseAdmin } = require('../config/firebaseAdmin');

const sendPushNotification = async (userPushToken, title, body, customData = {}) => {
    if (typeof userPushToken !== 'string' || !userPushToken.trim()) {
        throw new TypeError('A valid FCM device token is required.');
    }
    if (typeof title !== 'string' || !title.trim() ||
        typeof body !== 'string' || !body.trim()) {
        throw new TypeError('A notification title and body are required.');
    }
    if (!customData || typeof customData !== 'object' || Array.isArray(customData)) {
        throw new TypeError('Notification data must be an object.');
    }

    const data = {};
    for (const [key, value] of Object.entries(customData)) {
        if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
            throw new TypeError(`Notification data value "${key}" must be a string, number, or boolean.`);
        }
        data[key] = String(value);
    }

    return getFirebaseAdmin().messaging().send({
        token: userPushToken.trim(),
        notification: { title: title.trim(), body: body.trim() },
        data,
        android: {
            priority: 'high',
            notification: { channelId: 'default' }
        }
    });
};

module.exports = { sendPushNotification };
