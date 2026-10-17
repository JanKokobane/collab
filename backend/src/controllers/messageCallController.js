const { createHash, randomUUID } = require('node:crypto');
const { getFirebaseAdmin } = require('../config/firebaseAdmin');
const { getConversation } = require('./messageController');

const firestore = () => getFirebaseAdmin().firestore();
const callsRef = conversationId =>
    firestore().collection('messageConversations').doc(conversationId).collection('calls');
const callIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class DailyApiError extends Error {
    constructor(status, path, details = null) {
        super('Daily API request failed.');
        this.status = status;
        this.path = path;
        this.details = details;
    }
}

const dailyRequest = async (path, body) => {
    const apiKey = process.env.DAILY_API_KEY;
    if (!apiKey) {
        console.error('Daily call setup is missing DAILY_API_KEY.');
        const error = new Error('Calling is not configured on the backend.');
        error.status = 503;
        throw error;
    }

    let response;
    try {
        response = await fetch(`https://api.daily.co/v1${path}`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
    } catch (error) {
        console.error('Daily API request could not connect.', {
            path,
            errorName: error.name,
            message: error.message
        });
        const requestError = new DailyApiError(502, path);
        throw requestError;
    }

    if (!response.ok) {
        const responseBody = await response.json().catch(() => null);
        const details = responseBody && typeof responseBody === 'object'
            ? {
                error: typeof responseBody.error === 'string'
                    ? responseBody.error.slice(0, 300)
                    : null,
                info: typeof responseBody.info === 'string'
                    ? responseBody.info.slice(0, 300)
                    : null,
                message: typeof responseBody.message === 'string'
                    ? responseBody.message.slice(0, 300)
                    : null
            }
            : null;
        console.error('Daily API returned an unsuccessful response.', {
            path,
            status: response.status,
            details
        });
        throw new DailyApiError(response.status, path, details);
    }
    return response.json();
};

const createRoom = (roomName, expiration) => dailyRequest('/rooms', {
    name: roomName,
    privacy: 'private',
    properties: {
        exp: expiration,
        max_participants: 2,
        enable_chat: false,
        enable_screenshare: false
    }
});

const createMeetingToken = (roomName, user, callType, expiration) =>
    dailyRequest('/meeting-tokens', {
        properties: {
            room_name: roomName,
            user_id: createHash('sha256').update(user.firebaseUid).digest('hex').slice(0, 36),
            user_name: user.name || 'Project member',
            exp: expiration,
            eject_at_token_exp: true,
            start_video_off: callType === 'audio',
            enable_screenshare: false
        }
    });

const getMember = async (conversationId, firebaseUid) => {
    const snapshot = await firestore()
        .collection('messageConversations').doc(conversationId)
        .collection('members').doc(firebaseUid).get();
    return snapshot.exists ? snapshot.data() : null;
};

const responseError = (res, error, operation) => {
    if (error.status === 503) {
        return res.status(503).json({
            success: false,
            code: 'CALLING_NOT_CONFIGURED',
            message: error.message
        });
    }
    console.error(`${operation} failed.`, {
        errorName: error.name,
        message: error.message,
        status: error.status || null,
        dailyPath: error.path || null,
        dailyDetails: error.details || null,
        stack: error.stack
    });
    return res.status(error.status === 429 ? 429 : error instanceof DailyApiError ? 502 : 500).json({
        success: false,
        code: 'CALL_OPERATION_FAILED',
        message: 'The call could not be completed. Please try again.'
    });
};

const startCall = async (req, res) => {
    const callType = req.body?.callType;
    if (!['audio', 'video'].includes(callType)) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_CALL_TYPE',
            message: 'Choose an audio or video call.'
        });
    }
    try {
        const conversation = await getConversation(req.params.conversationId, req.firebaseUid);
        if (!conversation) {
            return res.status(404).json({
                success: false,
                code: 'CONVERSATION_NOT_FOUND',
                message: 'Conversation not found.'
            });
        }
        const memberUids = conversation.member_uids || [];
        if (conversation.conversation_type !== 'direct' || memberUids.length !== 2) {
            return res.status(400).json({
                success: false,
                code: 'DIRECT_CALLS_ONLY',
                message: 'Calls are currently available for direct conversations only.'
            });
        }
        const calleeUid = memberUids.find(uid => uid !== req.firebaseUid);
        const [caller, callee] = await Promise.all([
            getMember(conversation.conversation_id, req.firebaseUid),
            getMember(conversation.conversation_id, calleeUid)
        ]);
        if (!caller || !callee) {
            return res.status(409).json({
                success: false,
                code: 'CONVERSATION_MEMBERS_UNAVAILABLE',
                message: 'Conversation members could not be verified.'
            });
        }
        const activeCalls = await callsRef(conversation.conversation_id)
            .where('status', 'in', ['ringing', 'accepted']).limit(10).get();
        const now = Date.now();
        if (activeCalls.docs.some(snapshot => {
            const call = snapshot.data();
            return call.status === 'accepted'
                ? call.expires_at?.toMillis?.() > now
                : call.ring_expires_at?.toMillis?.() > now;
        })) {
            return res.status(409).json({
                success: false,
                code: 'CALL_ALREADY_ACTIVE',
                message: 'There is already an active call in this conversation.'
            });
        }

        const callId = randomUUID();
        const roomName = `collab-${callId}`;
        const expiration = Math.floor(now / 1000) + 60 * 60;
        const room = await createRoom(roomName, expiration);
        if (!room?.name || !room.url) throw new DailyApiError(502);
        const token = await createMeetingToken(room.name, {
            firebaseUid: req.firebaseUid,
            name: caller.display_name || caller.name || caller.email
        }, callType, expiration);
        if (!token?.token) throw new DailyApiError(502);
        const createdAt = getFirebaseAdmin().firestore.Timestamp.now();
        await callsRef(conversation.conversation_id).doc(callId).create({
            call_id: callId,
            conversation_id: conversation.conversation_id,
            caller_uid: req.firebaseUid,
            caller_name: caller.display_name || caller.name || caller.email || 'Project member',
            callee_uid: calleeUid,
            callee_name: callee.display_name || callee.name || callee.email || 'Project member',
            call_type: callType,
            status: 'ringing',
            daily_room_name: room.name,
            daily_room_url: room.url,
            created_at: createdAt,
            expires_at: getFirebaseAdmin().firestore.Timestamp.fromMillis(expiration * 1000),
            ring_expires_at: getFirebaseAdmin().firestore.Timestamp.fromMillis(now + 45_000)
        });
        res.set('Cache-Control', 'no-store');
        return res.status(201).json({
            success: true,
            data: {
                call: {
                    call_id: callId,
                    conversation_id: conversation.conversation_id,
                    call_type: callType,
                    status: 'ringing',
                    ring_expires_at: new Date(now + 45_000).toISOString(),
                    peer_name: callee.display_name || callee.name || callee.email || 'Project member',
                    room_url: room.url,
                    token: token.token
                }
            }
        });
    } catch (error) {
        return responseError(res, error, 'Start Daily call');
    }
};

const updateCall = async (req, res) => {
    const action = req.params.action;
    if (!['accept', 'decline', 'end'].includes(action) ||
        !callIdPattern.test(req.params.callId || '')) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_CALL_ACTION',
            message: 'The requested call action is not valid.'
        });
    }
    try {
        const conversation = await getConversation(req.params.conversationId, req.firebaseUid);
        if (!conversation || conversation.conversation_type !== 'direct') {
            return res.status(404).json({
                success: false,
                code: 'CONVERSATION_NOT_FOUND',
                message: 'Conversation not found.'
            });
        }
        const callRef = callsRef(conversation.conversation_id).doc(req.params.callId);
        const snapshot = await callRef.get();
        if (!snapshot.exists) {
            return res.status(404).json({
                success: false,
                code: 'CALL_NOT_FOUND',
                message: 'This call is no longer available.'
            });
        }
        const call = snapshot.data();
        const isCaller = call.caller_uid === req.firebaseUid;
        const isCallee = call.callee_uid === req.firebaseUid;
        if (!isCaller && !isCallee) {
            return res.status(403).json({
                success: false,
                code: 'CALL_ACCESS_DENIED',
                message: 'You are not a participant in this call.'
            });
        }
        if (['declined', 'missed', 'ended'].includes(call.status)) {
            if (action === 'end' ||
                (action === 'decline' && isCallee && call.status === 'declined')) {
                return res.json({ success: true });
            }
            return res.status(409).json({
                success: false,
                code: 'CALL_NOT_ACTIVE',
                message: 'This call is no longer active.'
            });
        }
        if (action === 'accept') {
            if (!isCallee || !['ringing', 'accepted'].includes(call.status)) {
                return res.status(409).json({
                    success: false,
                    code: 'CALL_NOT_ACCEPTABLE',
                    message: 'This call can no longer be accepted.'
                });
            }
            const callExpired = call.expires_at?.toMillis?.() <= Date.now();
            const ringExpired = call.status === 'ringing' &&
                call.ring_expires_at?.toMillis?.() <= Date.now();
            if (callExpired || ringExpired) {
                await callRef.update({
                    status: 'missed',
                    ended_at: getFirebaseAdmin().firestore.Timestamp.now()
                });
                return res.status(410).json({
                    success: false,
                    code: 'CALL_EXPIRED',
                    message: 'This call invitation has expired.'
                });
            }
            const member = await getMember(conversation.conversation_id, req.firebaseUid);
            const token = await createMeetingToken(call.daily_room_name, {
                firebaseUid: req.firebaseUid,
                name: member?.display_name || member?.name || member?.email
            }, call.call_type, Math.floor(call.expires_at.toMillis() / 1000));
            if (!token?.token) throw new DailyApiError(502);
            await callRef.update({
                status: 'accepted',
                accepted_at: call.accepted_at || getFirebaseAdmin().firestore.Timestamp.now()
            });
            res.set('Cache-Control', 'no-store');
            return res.json({
                success: true,
                data: { call: { room_url: call.daily_room_url, token: token.token } }
            });
        }
        if ((action === 'decline' && (!isCallee || call.status !== 'ringing')) ||
            (action === 'end' && !['ringing', 'accepted'].includes(call.status))) {
            return res.status(409).json({
                success: false,
                code: 'CALL_NOT_ACTIVE',
                message: 'This call is no longer active.'
            });
        }
        await callRef.update({
            status: action === 'decline' ? 'declined' : 'ended',
            ended_at: getFirebaseAdmin().firestore.Timestamp.now(),
            ended_by_uid: req.firebaseUid
        });
        return res.json({ success: true });
    } catch (error) {
        return responseError(res, error, `${action} Daily call`);
    }
};

module.exports = { startCall, updateCall };
