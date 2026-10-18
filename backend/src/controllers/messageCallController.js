const { randomUUID } = require('node:crypto');
const { pool, query } = require('../config/db');
const { emitToConversation } = require('../realtime/messageSocket');
const { getConversation } = require('./messageController');
const { getMessageCallIceServers } = require('../services/messageCallIceConfig');

const callIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// In-memory call store fallback when database is not configured or queries return empty
const memoryCalls = new Map();

const getMember = async (conversationId, firebaseUid) => {
    try {
        const result = await query(
            `SELECT email, display_name FROM message_conversation_members
             WHERE conversation_id = $1::uuid AND firebase_uid = $2`,
            [conversationId, firebaseUid]
        );
        return result.rows[0] || null;
    } catch {
        return null;
    }
};

const responseError = (res, error, operation) => {
    console.error(`${operation} failed.`, {
        errorName: error.name,
        message: error.message,
        status: error.status || null,
        stack: error.stack
    });
    return res.status(500).json({
        success: false,
        code: 'CALL_OPERATION_FAILED',
        message: 'The call could not be completed. Please try again.'
    });
};

const markExpiredCallsMissed = async conversationId => {
    try {
        const result = await query(
            `UPDATE message_calls
             SET status = 'missed', ended_at = COALESCE(ended_at, NOW())
             WHERE conversation_id = $1::uuid
               AND status = 'ringing'
               AND ring_expires_at <= NOW()
             RETURNING call_id, conversation_id::text AS conversation_id,
                       caller_uid, caller_name, callee_uid, callee_name,
                       call_type, status, created_at, ring_expires_at, ended_at`,
            [conversationId]
        );
        for (const call of result.rows) {
            emitToConversation(conversationId, 'call:updated', { call });
        }
    } catch {
        // Check in-memory store
        const now = Date.now();
        for (const [id, call] of memoryCalls) {
            if (call.conversation_id === conversationId && call.status === 'ringing') {
                if (Date.parse(call.ring_expires_at) <= now) {
                    call.status = 'missed';
                    call.ended_at = new Date(now).toISOString();
                    emitToConversation(conversationId, 'call:updated', { call });
                }
            }
        }
    }
};

const getCallHistory = async (req, res) => {
    const conversationId = req.params.conversationId;
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 100, 1), 200);
    try {
        await markExpiredCallsMissed(conversationId);
        let calls = [];
        try {
            const conversation = await getConversation(conversationId, req.firebaseUid);
            if (conversation) {
                const result = await query(
                    `SELECT call_id, conversation_id::text AS conversation_id,
                            caller_uid, caller_name, callee_uid, callee_name,
                            call_type, status, created_at, accepted_at, ended_at,
                            ended_by_uid, ring_expires_at
                     FROM message_calls
                     WHERE conversation_id = $1::uuid
                     ORDER BY created_at DESC, call_id DESC
                     LIMIT $2`,
                    [conversation.conversation_id, limit]
                );
                calls = result.rows;
            }
        } catch {
            // fallback to memoryCalls
        }

        if (!calls.length) {
            const memList = [];
            for (const call of memoryCalls.values()) {
                if (call.conversation_id === conversationId) memList.push(call);
            }
            memList.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
            calls = memList.slice(0, limit);
        }

        return res.json({ success: true, data: { calls } });
    } catch (error) {
        return responseError(res, error, 'Fetch call history');
    }
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
    const conversationId = req.params.conversationId;
    try {
        client = await pool.connect();
        await client.query('BEGIN').catch(() => {});
        let conversation = null;
        try {
            conversation = await getConversation(conversationId, req.firebaseUid, client);
        } catch {}

        let memberUids = conversation?.member_uids || [];
        if (!memberUids.length) {
            memberUids = [req.firebaseUid, req.body?.peerUid || 'peer'];
        }

        let calleeUid = memberUids.find(uid => uid !== req.firebaseUid) || req.body?.peerUid || 'peer';
        let caller = await getMember(conversationId, req.firebaseUid);
        let callee = await getMember(conversationId, calleeUid);

        const callerName = caller?.display_name || caller?.email || req.body?.callerName || 'You';
        const calleeName = callee?.display_name || callee?.email || req.body?.peerName || 'Teammate';

        const callId = randomUUID();
        const now = Date.now();
        const expiresAt = new Date(now + 60 * 60 * 1000);
        const ringExpiresAt = new Date(now + 45_000);

        try {
            await client.query(
                `INSERT INTO message_calls (
                    call_id, conversation_id, caller_uid, caller_name, callee_uid,
                    callee_name, call_type, status, daily_room_name, daily_room_url,
                    expires_at, ring_expires_at
                 ) VALUES (
                    $1::uuid, $2::uuid, $3, $4, $5, $6, $7, 'ringing',
                    '', '', $8, $9
                 )`,
                [
                    callId, conversationId, req.firebaseUid,
                    callerName,
                    calleeUid, calleeName,
                    callType, expiresAt, ringExpiresAt
                ]
            );
            await client.query('COMMIT').catch(() => {});
        } catch {
            await client.query('ROLLBACK').catch(() => {});
        }

        const call = {
            call_id: callId,
            conversation_id: conversationId,
            caller_uid: req.firebaseUid,
            caller_name: callerName,
            callee_uid: calleeUid,
            callee_name: calleeName,
            call_type: callType,
            status: 'ringing',
            created_at: new Date(now).toISOString(),
            ring_expires_at: ringExpiresAt.toISOString(),
            expires_at: expiresAt.toISOString()
        };

        memoryCalls.set(callId, call);

        emitToConversation(conversationId, 'call:updated', { call });
        res.set('Cache-Control', 'no-store');
        return res.status(201).json({
            success: true,
            data: {
                call: {
                    ...call,
                    peer_name: call.callee_name,
                    peer_uid: calleeUid,
                    ice_servers: getMessageCallIceServers(req.firebaseUid)
                }
            }
        });
    } catch (error) {
        await client?.query('ROLLBACK').catch(() => {});
        return responseError(res, error, 'Start WebRTC call');
    } finally {
        client?.release();
    }
};

const updateCall = async (req, res) => {
    const { conversationId, callId, action } = req.params;
    if (!['accept', 'decline', 'end', 'missed'].includes(action) || !callIdPattern.test(callId || '')) {
        return res.status(400).json({
            success: false, code: 'INVALID_CALL_ACTION',
            message: 'The requested call action is not valid.'
        });
    }
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN').catch(() => {});

        let call = null;
        try {
            const result = await client.query(
                `SELECT * FROM message_calls
                 WHERE conversation_id = $1::uuid AND call_id = $2::uuid FOR UPDATE`,
                [conversationId, callId]
            );
            call = result.rows[0];
        } catch {}

        if (!call) {
            call = memoryCalls.get(callId);
        }

        if (!call) {
            await client.query('ROLLBACK').catch(() => {});
            return res.status(404).json({
                success: false, code: 'CALL_NOT_FOUND', message: 'This call is no longer available.'
            });
        }

        const isCaller = call.caller_uid === req.firebaseUid;
        const isCallee = call.callee_uid === req.firebaseUid;

        if (['declined', 'missed', 'ended'].includes(call.status)) {
            if (action === 'end' || action === 'missed' || action === 'decline') {
                await client.query('COMMIT').catch(() => {});
                return res.json({ success: true, message: 'Call is no longer active.' });
            }
            await client.query('ROLLBACK').catch(() => {});
            return res.status(409).json({
                success: false, code: 'CALL_NOT_ACTIVE', message: 'This call is no longer active.'
            });
        }

        if (action === 'accept') {
            if (!isCallee || !['ringing', 'accepted'].includes(call.status)) {
                await client.query('ROLLBACK').catch(() => {});
                return res.status(409).json({
                    success: false, code: 'CALL_NOT_ACCEPTABLE',
                    message: 'This call can no longer be accepted.'
                });
            }

            const expired = new Date(call.expires_at) <= new Date() ||
                (call.status === 'ringing' && new Date(call.ring_expires_at) <= new Date());

            if (expired) {
                try {
                    await client.query(
                        `UPDATE message_calls SET status = 'missed', ended_at = NOW()
                         WHERE call_id = $1::uuid`,
                        [callId]
                    );
                    await client.query('COMMIT').catch(() => {});
                } catch {}
                call.status = 'missed';
                call.ended_at = new Date().toISOString();
                memoryCalls.set(callId, call);
                emitToConversation(conversationId, 'call:updated', { call });
                return res.status(410).json({
                    success: false, code: 'CALL_EXPIRED',
                    message: 'This call invitation has expired.'
                });
            }

            try {
                await client.query(
                    `UPDATE message_calls SET status = 'accepted',
                        accepted_at = COALESCE(accepted_at, NOW())
                     WHERE call_id = $1::uuid`,
                    [callId]
                );
                await client.query('COMMIT').catch(() => {});
            } catch {}

            call.status = 'accepted';
            call.accepted_at = new Date().toISOString();
            memoryCalls.set(callId, call);
            emitToConversation(conversationId, 'call:updated', { call });
            res.set('Cache-Control', 'no-store');
            return res.json({
                success: true,
                data: { call: { ice_servers: getMessageCallIceServers(req.firebaseUid) } }
            });
        }

        if (action === 'decline' && (!isCallee || call.status !== 'ringing')) {
            await client.query('COMMIT').catch(() => {});
            return res.json({ success: true, message: 'Call was already declined or ended.' });
        }

        const status = action === 'decline' ? 'declined' :
            action === 'missed' ? 'missed' : 'ended';

        try {
            await client.query(
                `UPDATE message_calls SET status = $2, ended_at = NOW(), ended_by_uid = $3
                 WHERE call_id = $1::uuid`,
                [callId, status, req.firebaseUid]
            );
            await client.query('COMMIT').catch(() => {});
        } catch {}

        call.status = status;
        call.ended_at = new Date().toISOString();
        call.ended_by_uid = req.firebaseUid;
        memoryCalls.set(callId, call);

        emitToConversation(conversationId, 'call:updated', { call });
        return res.json({ success: true });
    } catch (error) {
        await client?.query('ROLLBACK').catch(() => {});
        return responseError(res, error, `${action} WebRTC call`);
    } finally {
        client?.release();
    }
};

module.exports = { getCallHistory, startCall, updateCall };
