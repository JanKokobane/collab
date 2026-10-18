const { createHash, randomUUID } = require('node:crypto');
const { pool, query } = require('../config/db');
const { emitToConversation } = require('../realtime/messageSocket');
const { getConversation } = require('./messageController');

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
            path, errorName: error.name, message: error.message
        });
        throw new DailyApiError(502, path);
    }
    if (!response.ok) {
        const responseBody = await response.json().catch(() => null);
        const details = responseBody && typeof responseBody === 'object'
            ? {
                error: typeof responseBody.error === 'string' ? responseBody.error.slice(0, 300) : null,
                info: typeof responseBody.info === 'string' ? responseBody.info.slice(0, 300) : null,
                message: typeof responseBody.message === 'string' ? responseBody.message.slice(0, 300) : null
            }
            : null;
        console.error('Daily API returned an unsuccessful response.', {
            path, status: response.status, details
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
    const result = await query(
        `SELECT email, display_name FROM message_conversation_members
         WHERE conversation_id = $1::uuid AND firebase_uid = $2`,
        [conversationId, firebaseUid]
    );
    return result.rows[0] || null;
};

const responseError = (res, error, operation) => {
    if (error.status === 503) {
        return res.status(503).json({
            success: false, code: 'CALLING_NOT_CONFIGURED', message: error.message
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
            success: false, code: 'INVALID_CALL_TYPE',
            message: 'Choose an audio or video call.'
        });
    }
    let client;
    let conversationId;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        const conversation = await getConversation(req.params.conversationId, req.firebaseUid, client);
        if (!conversation) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false, code: 'CONVERSATION_NOT_FOUND', message: 'Conversation not found.'
            });
        }
        conversationId = conversation.conversation_id;
        const memberUids = conversation.member_uids || [];
        if (conversation.conversation_type !== 'direct' || memberUids.length !== 2) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false, code: 'DIRECT_CALLS_ONLY',
                message: 'Calls are currently available for direct conversations only.'
            });
        }
        await client.query(
            'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
            [`call:${conversationId}`]
        );
        const active = await client.query(
            `SELECT 1 FROM message_calls
             WHERE conversation_id = $1::uuid AND status IN ('ringing', 'accepted')
               AND CASE WHEN status = 'ringing' THEN ring_expires_at ELSE expires_at END > NOW()
             LIMIT 1`,
            [conversationId]
        );
        if (active.rowCount) {
            await client.query('ROLLBACK');
            return res.status(409).json({
                success: false, code: 'CALL_ALREADY_ACTIVE',
                message: 'There is already an active call in this conversation.'
            });
        }
        const calleeUid = memberUids.find(uid => uid !== req.firebaseUid);
        const caller = await getMember(conversationId, req.firebaseUid);
        const callee = await getMember(conversationId, calleeUid);
        if (!caller || !callee) {
            await client.query('ROLLBACK');
            return res.status(409).json({
                success: false, code: 'CONVERSATION_MEMBERS_UNAVAILABLE',
                message: 'Conversation members could not be verified.'
            });
        }
        const callId = randomUUID();
        const roomName = `collab-${callId}`;
        const now = Date.now();
        const expiration = Math.floor(now / 1000) + 60 * 60;
        const room = await createRoom(roomName, expiration);
        if (!room?.name || !room.url) throw new DailyApiError(502, '/rooms');
        const token = await createMeetingToken(room.name, {
            firebaseUid: req.firebaseUid,
            name: caller.display_name || caller.email
        }, callType, expiration);
        if (!token?.token) throw new DailyApiError(502, '/meeting-tokens');
        const ringExpiresAt = new Date(now + 45_000);
        const expiresAt = new Date(expiration * 1000);
        await client.query(
            `INSERT INTO message_calls (
                call_id, conversation_id, caller_uid, caller_name, callee_uid,
                callee_name, call_type, status, daily_room_name, daily_room_url,
                expires_at, ring_expires_at
             ) VALUES (
                $1::uuid, $2::uuid, $3, $4, $5, $6, $7, 'ringing',
                $8, $9, $10, $11
             )`,
            [
                callId, conversationId, req.firebaseUid,
                caller.display_name || caller.email || 'Project member',
                calleeUid, callee.display_name || callee.email || 'Project member',
                callType, room.name, room.url, expiresAt, ringExpiresAt
            ]
        );
        await client.query('COMMIT');
        const call = {
            call_id: callId,
            conversation_id: conversationId,
            caller_uid: req.firebaseUid,
            caller_name: caller.display_name || caller.email || 'Project member',
            callee_uid: calleeUid,
            callee_name: callee.display_name || callee.email || 'Project member',
            call_type: callType,
            status: 'ringing',
            created_at: new Date(now).toISOString(),
            ring_expires_at: ringExpiresAt.toISOString()
        };
        emitToConversation(conversationId, 'call:updated', { call });
        res.set('Cache-Control', 'no-store');
        return res.status(201).json({
            success: true,
            data: {
                call: {
                    ...call,
                    peer_name: call.callee_name,
                    room_url: room.url,
                    token: token.token
                }
            }
        });
    } catch (error) {
        await client?.query('ROLLBACK').catch(() => {});
        return responseError(res, error, 'Start Daily call');
    } finally {
        client?.release();
    }
};

const updateCall = async (req, res) => {
    const { conversationId, callId, action } = req.params;
    if (!['accept', 'decline', 'end'].includes(action) || !callIdPattern.test(callId || '')) {
        return res.status(400).json({
            success: false, code: 'INVALID_CALL_ACTION',
            message: 'The requested call action is not valid.'
        });
    }
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        const conversation = await getConversation(conversationId, req.firebaseUid, client);
        if (!conversation || conversation.conversation_type !== 'direct') {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false, code: 'CONVERSATION_NOT_FOUND', message: 'Conversation not found.'
            });
        }
        const result = await client.query(
            `SELECT * FROM message_calls
             WHERE conversation_id = $1::uuid AND call_id = $2::uuid FOR UPDATE`,
            [conversationId, callId]
        );
        const call = result.rows[0];
        if (!call) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false, code: 'CALL_NOT_FOUND', message: 'This call is no longer available.'
            });
        }
        const isCaller = call.caller_uid === req.firebaseUid;
        const isCallee = call.callee_uid === req.firebaseUid;
        if (!isCaller && !isCallee) {
            await client.query('ROLLBACK');
            return res.status(403).json({
                success: false, code: 'CALL_ACCESS_DENIED',
                message: 'You are not a participant in this call.'
            });
        }
        if (['declined', 'missed', 'ended'].includes(call.status)) {
            if (action === 'end' || (action === 'decline' && isCallee && call.status === 'declined')) {
                await client.query('COMMIT');
                return res.json({ success: true });
            }
            await client.query('ROLLBACK');
            return res.status(409).json({
                success: false, code: 'CALL_NOT_ACTIVE', message: 'This call is no longer active.'
            });
        }
        if (action === 'accept') {
            if (!isCallee || !['ringing', 'accepted'].includes(call.status)) {
                await client.query('ROLLBACK');
                return res.status(409).json({
                    success: false, code: 'CALL_NOT_ACCEPTABLE',
                    message: 'This call can no longer be accepted.'
                });
            }
            const expired = new Date(call.expires_at) <= new Date() ||
                (call.status === 'ringing' && new Date(call.ring_expires_at) <= new Date());
            if (expired) {
                await client.query(
                    `UPDATE message_calls SET status = 'missed', ended_at = NOW()
                     WHERE call_id = $1::uuid`,
                    [callId]
                );
                await client.query('COMMIT');
                emitToConversation(conversationId, 'call:updated', {
                    call: { ...call, status: 'missed', ended_at: new Date().toISOString() }
                });
                return res.status(410).json({
                    success: false, code: 'CALL_EXPIRED',
                    message: 'This call invitation has expired.'
                });
            }
            const member = await getMember(conversationId, req.firebaseUid);
            const token = await createMeetingToken(
                call.daily_room_name,
                { firebaseUid: req.firebaseUid, name: member?.display_name || member?.email },
                call.call_type,
                Math.floor(new Date(call.expires_at).getTime() / 1000)
            );
            if (!token?.token) throw new DailyApiError(502, '/meeting-tokens');
            await client.query(
                `UPDATE message_calls SET status = 'accepted',
                    accepted_at = COALESCE(accepted_at, NOW())
                 WHERE call_id = $1::uuid`,
                [callId]
            );
            await client.query('COMMIT');
            emitToConversation(conversationId, 'call:updated', {
                call: { ...call, status: 'accepted' }
            });
            res.set('Cache-Control', 'no-store');
            return res.json({
                success: true,
                data: { call: { room_url: call.daily_room_url, token: token.token } }
            });
        }
        if ((action === 'decline' && (!isCallee || call.status !== 'ringing')) ||
            (action === 'end' && !['ringing', 'accepted'].includes(call.status))) {
            await client.query('ROLLBACK');
            return res.status(409).json({
                success: false, code: 'CALL_NOT_ACTIVE',
                message: 'This call is no longer active.'
            });
        }
        const status = action === 'decline' ? 'declined' : 'ended';
        await client.query(
            `UPDATE message_calls SET status = $2, ended_at = NOW(), ended_by_uid = $3
             WHERE call_id = $1::uuid`,
            [callId, status, req.firebaseUid]
        );
        await client.query('COMMIT');
        emitToConversation(conversationId, 'call:updated', {
            call: { ...call, status, ended_by_uid: req.firebaseUid }
        });
        return res.json({ success: true });
    } catch (error) {
        await client?.query('ROLLBACK').catch(() => {});
        return responseError(res, error, `${action} Daily call`);
    } finally {
        client?.release();
    }
};

module.exports = { startCall, updateCall };
