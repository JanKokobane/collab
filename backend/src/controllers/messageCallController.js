const { randomUUID } = require('node:crypto');
const { pool, query } = require('../config/db');
const { emitToConversation } = require('../realtime/messageSocket');
const { getConversation } = require('./messageController');
const { getMessageCallIceServers } = require('../services/messageCallIceConfig');

const callIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const getMember = async (conversationId, firebaseUid) => {
    const result = await query(
        `SELECT email, display_name FROM message_conversation_members
         WHERE conversation_id = $1::uuid AND firebase_uid = $2`,
        [conversationId, firebaseUid]
    );
    return result.rows[0] || null;
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
};

const getCallHistory = async (req, res) => {
    const conversationId = req.params.conversationId;
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 100, 1), 200);
    try {
        const conversation = await getConversation(conversationId, req.firebaseUid);
        if (!conversation || conversation.conversation_type !== 'direct') {
            return res.status(404).json({
                success: false, code: 'CONVERSATION_NOT_FOUND',
                message: 'Conversation not found.'
            });
        }
        await markExpiredCallsMissed(conversation.conversation_id);
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
        return res.json({ success: true, data: { calls: result.rows } });
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
        const now = Date.now();
        const expiresAt = new Date(now + 60 * 60 * 1000);
        const ringExpiresAt = new Date(now + 45_000);
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
                caller.display_name || caller.email || 'Project member',
                calleeUid, callee.display_name || callee.email || 'Project member',
                callType, expiresAt, ringExpiresAt
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
            if (action === 'end' || action === 'missed' ||
                (action === 'decline' && isCallee && call.status === 'declined')) {
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
                data: { call: { ice_servers: getMessageCallIceServers(req.firebaseUid) } }
            });
        }
        if ((action === 'decline' && (!isCallee || call.status !== 'ringing')) ||
            (action === 'missed' && (!isCaller || call.status !== 'ringing' ||
                new Date(call.ring_expires_at) > new Date())) ||
            (action === 'end' && !['ringing', 'accepted'].includes(call.status))) {
            await client.query('ROLLBACK');
            return res.status(409).json({
                success: false, code: 'CALL_NOT_ACTIVE',
                message: 'This call is no longer active.'
            });
        }
        const status = action === 'decline' ? 'declined' :
            action === 'missed' ? 'missed' : 'ended';
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
        return responseError(res, error, `${action} WebRTC call`);
    } finally {
        client?.release();
    }
};

module.exports = { getCallHistory, startCall, updateCall };
