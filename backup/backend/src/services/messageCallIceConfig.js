const { createHmac } = require('node:crypto');

const stunUrls = (process.env.WEBRTC_STUN_URLS ||
    'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302'
).split(',').map(url => url.trim()).filter(Boolean);

const getMessageCallIceServers = firebaseUid => {
    const iceServers = stunUrls.map(urls => ({ urls }));
    const turnUrls = (process.env.WEBRTC_TURN_URLS || '')
        .split(',').map(url => url.trim()).filter(Boolean);
    const sharedSecret = process.env.WEBRTC_TURN_SHARED_SECRET;
    if (!turnUrls.length || !sharedSecret) return iceServers;

    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const username = `${expiresAt}:${firebaseUid}`;
    const credential = createHmac('sha1', sharedSecret)
        .update(username)
        .digest('base64');
    iceServers.push({ urls: turnUrls, username, credential });
    return iceServers;
};

module.exports = { getMessageCallIceServers };
