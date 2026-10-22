const getMeteredConfig = () => {
    const configuredAppName = process.env.METERED_APP_NAME?.trim();
    const secretKey = process.env.METERED_SECRET_KEY?.trim();
    if (!configuredAppName || !secretKey) {
        const error = new Error('Metered room creation requires METERED_APP_NAME and METERED_SECRET_KEY.');
        error.code = 'METERED_ROOM_NOT_CONFIGURED';
        throw error;
    }

    let appHost = configuredAppName.replace(/^https?:\/\//i, '').replace(/\/$/, '');
    if (!/^[a-z0-9-]+(?:\.metered\.live)?$/i.test(appHost)) {
        const error = new Error('Metered app name is invalid.');
        error.code = 'METERED_ROOM_CONFIGURATION_INVALID';
        throw error;
    }
    appHost = appHost.replace(/\.metered\.live$/i, '');
    return { appHost, secretKey };
};

const createMeteredRoom = async () => {
    const { appHost, secretKey } = getMeteredConfig();
    const endpoint = new URL(`https://${appHost}.metered.live/api/v1/room`);
    endpoint.searchParams.set('secretKey', secretKey);

    let response;
    try {
        response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                privacy: 'public',
                maxParticipants: 100,
                autoJoin: false,
                enableChat: true,
                enableScreenSharing: true,
                recordRoom: false
            }),
            signal: AbortSignal.timeout(10_000)
        });
    } catch (cause) {
        const error = new Error('Could not connect to Metered to create a meeting room.');
        error.code = 'METERED_ROOM_REQUEST_FAILED';
        error.cause = cause;
        throw error;
    }

    if (!response.ok) {
        const error = new Error(`Metered rejected room creation with HTTP ${response.status}.`);
        error.code = 'METERED_ROOM_REQUEST_FAILED';
        throw error;
    }

    let room;
    try {
        room = await response.json();
    } catch (cause) {
        const error = new Error('Metered returned an invalid meeting room response.');
        error.code = 'METERED_ROOM_RESPONSE_INVALID';
        error.cause = cause;
        throw error;
    }

    if (typeof room?.roomName !== 'string' || !/^[A-Za-z0-9_-]+$/.test(room.roomName)) {
        const error = new Error('Metered did not return a valid meeting room name.');
        error.code = 'METERED_ROOM_RESPONSE_INVALID';
        throw error;
    }

    return `https://${appHost}.metered.live/${encodeURIComponent(room.roomName)}`;
};

module.exports = { createMeteredRoom };
