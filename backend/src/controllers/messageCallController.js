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
                   call_type, status, created_at, ring_expires_at, ended_at,
                   participant_uids, participant_names`,
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
        if (!conversation) {
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
                    ended_by_uid, ring_expires_at, participant_uids, participant_names
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
        const memberUids = [...new Set(conversation.member_uids || [])];
        const requestedUids = Array.isArray(req.body?.participantUids)
            ? req.body.participantUids.filter(uid => typeof uid === 'string' && uid.trim())
            : memberUids.filter(uid => uid !== req.firebaseUid);
        const participantUids = [...new Set([req.firebaseUid, ...requestedUids])];
        if (participantUids.length < 2 || participantUids.some(uid => !memberUids.includes(uid))) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false, code: 'INVALID_CALL_PARTICIPANTS',
                message: 'Every call participant must belong to this conversation.'
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
        const calleeUid = participantUids.find(uid => uid !== req.firebaseUid);
        const members = await Promise.all(participantUids.map(uid => getMember(conversationId, uid)));
        const caller = members[0];
        const callee = members[participantUids.indexOf(calleeUid)];
        if (members.some(member => !member)) {
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
                expires_at, ring_expires_at, participant_uids, participant_names
             ) VALUES (
                $1::uuid, $2::uuid, $3, $4, $5, $6, $7, 'ringing',
                '', '', $8, $9, $10::jsonb, $11::jsonb
             )`,
            [
                callId, conversationId, req.firebaseUid,
                caller.display_name || caller.email || 'Project member',
                calleeUid, callee.display_name || callee.email || 'Project member',
                callType, expiresAt, ringExpiresAt,
                JSON.stringify(participantUids),
                JSON.stringify(participantUids.map((uid, index) => ({
                    uid,
                    name: members[index].display_name || members[index].email || 'Project member'
                })))
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
            ring_expires_at: ringExpiresAt.toISOString(),
            participant_uids: participantUids,
            participant_names: participantUids.map((uid, index) => ({
                uid,
                name: members[index].display_name || members[index].email || 'Project member'
            }))
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
        if (!conversation) {
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
        const participantUids = Array.isArray(call.participant_uids) && call.participant_uids.length
            ? call.participant_uids
            : [call.caller_uid, call.callee_uid];
        const isCaller = call.caller_uid === req.firebaseUid;
        const isParticipant = participantUids.includes(req.firebaseUid);
        const isCallee = isParticipant && !isCaller;
        if (!isParticipant) {
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
                    call: { ...call, status: 'missed', ended_at: new Date().toISOString(),
                        participant_uids: participantUids }
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
                call: { ...call, status: 'accepted', participant_uids: participantUids,
                    participant_names: call.participant_names }
            });
            res.set('Cache-Control', 'no-store');
            return res.json({
                success: true,
                data: { call: { ice_servers: getMessageCallIceServers(req.firebaseUid) } }
            });
        }
        if (action === 'decline' && participantUids.length > 2) {
            await client.query('COMMIT');
            return res.json({ success: true });
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
            call: { ...call, status, ended_by_uid: req.firebaseUid,
                participant_uids: participantUids, participant_names: call.participant_names }
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
