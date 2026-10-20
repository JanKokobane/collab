const { createHmac } = require('node:crypto');

const stunUrls = (process.env.WEBRTC_STUN_URLS ||
    'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302'
).split(',').map(url => url.trim()).filter(Boolean);

const getStaticTurnServers = firebaseUid => {
    const turnUrls = (process.env.WEBRTC_TURN_URLS || '')
        .split(',').map(url => url.trim()).filter(Boolean);
    const sharedSecret = process.env.WEBRTC_TURN_SHARED_SECRET;
    if (!turnUrls.length || !sharedSecret) return [];

    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const username = `${expiresAt}:${firebaseUid}`;
    const credential = createHmac('sha1', sharedSecret)
        .update(username)
        .digest('base64');
    return [{ urls: turnUrls, username, credential }];
};

const normalizeMeteredIceServers = payload => {
    const servers = Array.isArray(payload) ? payload : payload?.iceServers;
    if (!Array.isArray(servers)) return [];

    return servers.flatMap(server => {
        if (!server || typeof server !== 'object' || Array.isArray(server)) return [];
        const urls = Array.isArray(server.urls)
            ? server.urls.filter(url => typeof url === 'string' && /^(stun|turn|turns):/i.test(url))
            : typeof server.urls === 'string' && /^(stun|turn|turns):/i.test(server.urls)
                ? server.urls
                : null;
        if (!urls || (Array.isArray(urls) && !urls.length)) return [];
        const isTurn = (Array.isArray(urls) ? urls : [urls])
            .some(url => /^(turn|turns):/i.test(url));
        if (isTurn && (typeof server.username !== 'string' || typeof server.credential !== 'string')) return [];
        return [{
            urls,
            ...(typeof server.username === 'string' ? { username: server.username } : {}),
            ...(typeof server.credential === 'string' ? { credential: server.credential } : {}),
            ...(typeof server.credentialType === 'string' ? { credentialType: server.credentialType } : {})
        }];
    });
};

const getMeteredTurnServers = async () => {
    const configuredAppName = process.env.METERED_APP_NAME?.trim();
    const apiKey = process.env.METERED_API_KEY?.trim();
    if (!configuredAppName || !apiKey) return [];

    let appHost = configuredAppName.replace(/^https?:\/\//i, '').replace(/\/$/, '');
    if (!/^[a-z0-9-]+(?:\.metered\.live)?$/i.test(appHost)) return [];
    appHost = appHost.replace(/\.metered\.live$/i, '');

    const endpoint = new URL(`https://${appHost}.metered.live/api/v1/turn/credentials`);
    endpoint.searchParams.set('apiKey', apiKey);
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`Metered returned HTTP ${response.status}.`);

    const servers = normalizeMeteredIceServers(await response.json());
    if (!servers.some(server =>
        (Array.isArray(server.urls) ? server.urls : [server.urls])
            .some(url => /^(turn|turns):/i.test(url))
    )) {
        throw new Error('Metered returned no usable TURN servers.');
    }
    return servers;
};

const getMessageCallIceServers = async firebaseUid => {
    try {
        const meteredServers = await getMeteredTurnServers();
        if (meteredServers.length) return [...stunUrls.map(urls => ({ urls })), ...meteredServers];
    } catch (error) {
        console.warn('Metered TURN credentials unavailable; using configured fallback.', {
            message: error.message
        });
    }
    return [...stunUrls.map(urls => ({ urls })), ...getStaticTurnServers(firebaseUid)];
};

module.exports = { getMessageCallIceServers };
