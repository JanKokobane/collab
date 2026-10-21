const { randomUUID } = require('node:crypto');
const { pool, query } = require('../config/db');
const { emitToCallParticipants, emitToUser } = require('../realtime/messageSocket');
const { getConversation } = require('./messageController');
const { getMessageCallIceServers } = require('../services/messageCallIceConfig');

const callIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const projectIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const getCallParticipants = async callId => {
    const result = await query(
        `SELECT firebase_uid, display_name, status, invited_at, accepted_at, left_at
         FROM message_call_participants
         WHERE call_id = $1::uuid
         ORDER BY invited_at, display_name`,
        [callId]
    );
    return result.rows;
};

const getMember = async (conversationId, firebaseUid) => {
    const result = await query(
        `SELECT email, display_name FROM message_conversation_members
         WHERE conversation_id = $1::uuid AND firebase_uid = $2`,
        [conversationId, firebaseUid]
    );
    return result.rows[0] || null;
};

const toPublicCall = call => ({
    call_id: call.call_id,
    conversation_id: call.conversation_id,
    caller_uid: call.caller_uid,
    caller_name: call.caller_name,
    callee_uid: call.callee_uid,
    callee_name: call.callee_name,
    call_type: call.call_type,
    status: call.status,
    created_at: call.created_at,
    accepted_at: call.accepted_at,
    ended_at: call.ended_at,
    ended_by_uid: call.ended_by_uid,
    ring_expires_at: call.ring_expires_at
});

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
        emitToCallParticipants(call, 'call:updated', { call });
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
                        `SELECT calls.call_id, calls.conversation_id::text AS conversation_id,
                                        calls.caller_uid, calls.caller_name, calls.callee_uid, calls.callee_name,
                                        calls.call_type, calls.status, calls.created_at, calls.accepted_at, calls.ended_at,
                                        calls.ended_by_uid, calls.ring_expires_at
                         FROM message_calls calls
                         LEFT JOIN message_conversation_user_state state
                             ON state.conversation_id = calls.conversation_id
                            AND state.firebase_uid = $2
                         WHERE calls.conversation_id = $1::uuid
                             AND (state.calls_cleared_at IS NULL OR calls.created_at > state.calls_cleared_at)
                         ORDER BY calls.created_at DESC, calls.call_id DESC
             LIMIT $3`,
                        [conversation.conversation_id, req.firebaseUid, limit]
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
        const timing = await client.query(
            `INSERT INTO message_calls (
                call_id, conversation_id, caller_uid, caller_name, callee_uid,
                callee_name, call_type, status, daily_room_name, daily_room_url,
                expires_at, ring_expires_at
             ) VALUES (
                $1::uuid, $2::uuid, $3, $4, $5, $6, $7, 'ringing',
                '', '', NOW() + INTERVAL '1 hour', NOW() + INTERVAL '45 seconds'
             )
             RETURNING created_at, ring_expires_at`,
            [
                callId, conversationId, req.firebaseUid,
                caller.display_name || caller.email || 'Project member',
                calleeUid, callee.display_name || callee.email || 'Project member',
                callType
            ]
        );
        await client.query(
            `INSERT INTO message_call_participants (
                call_id, firebase_uid, display_name, status, invited_by_uid,
                invited_at, accepted_at
             ) VALUES
                ($1::uuid, $2, $3, 'accepted', $2, NOW(), NOW()),
                ($1::uuid, $4, $5, 'ringing', $2, NOW(), NULL)`,
            [
                callId,
                req.firebaseUid,
                caller.display_name || caller.email || 'Project member',
                calleeUid,
                callee.display_name || callee.email || 'Project member'
            ]
        );
        await client.query('COMMIT');
        const { created_at: createdAt, ring_expires_at: ringExpiresAt } = timing.rows[0];
        const call = {
            call_id: callId,
            conversation_id: conversationId,
            caller_uid: req.firebaseUid,
            caller_name: caller.display_name || caller.email || 'Project member',
            callee_uid: calleeUid,
            callee_name: callee.display_name || callee.email || 'Project member',
            call_type: callType,
            status: 'ringing',
            created_at: createdAt.toISOString(),
            ring_expires_at: ringExpiresAt.toISOString()
        };
        emitToCallParticipants(call, 'call:updated', { call });
        res.set('Cache-Control', 'no-store');
        return res.status(201).json({
            success: true,
            data: {
                call: {
                    ...call,
                    peer_name: call.callee_name,
                    peer_uid: calleeUid,
                    participants: await getCallParticipants(callId),
                    ice_servers: await getMessageCallIceServers(req.firebaseUid)
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

const inviteCallParticipants = async (req, res) => {
    const conversationId = req.params.conversationId;
    const callId = req.params.callId;
    const projectId = req.body?.projectId;
    const requestedUids = Array.isArray(req.body?.participantFirebaseUids)
        ? [...new Set(req.body.participantFirebaseUids.filter(uid =>
            typeof uid === 'string' && uid.trim() && uid.length <= 128
        ).map(uid => uid.trim()))]
        : [];
    if (!callIdPattern.test(callId || '') || !projectIdPattern.test(projectId || '') ||
        !requestedUids.length || requestedUids.length > 3) {
        return res.status(400).json({
            success: false, code: 'INVALID_CALL_INVITE',
            message: 'Choose one to three project members to invite.'
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
        const callResult = await client.query(
            `SELECT call_id, conversation_id::text AS conversation_id,
                    caller_uid, caller_name, callee_uid, callee_name,
                    call_type, status, expires_at
             FROM message_calls
             WHERE call_id = $1::uuid AND conversation_id = $2::uuid
             FOR UPDATE`,
            [callId, conversation.conversation_id]
        );
        const call = callResult.rows[0];
        if (!call || call.caller_uid !== req.firebaseUid ||
            !['ringing', 'accepted'].includes(call.status) || new Date(call.expires_at) <= new Date()) {
            await client.query('ROLLBACK');
            return res.status(409).json({
                success: false, code: 'CALL_NOT_ACTIVE', message: 'Only the caller can invite members to an active call.'
            });
        }
        const projectAccess = await client.query(
            `SELECT 1 FROM projects p
             WHERE p.project_id = $1::uuid
               AND (p.creator_firebase_uid = $2 OR EXISTS (
                   SELECT 1 FROM project_invitations i
                   WHERE i.project_id = p.project_id
                     AND i.invited_firebase_uid = $2 AND i.status = 'accepted'
               ))`,
            [projectId, req.firebaseUid]
        );
        if (!projectAccess.rowCount) {
            await client.query('ROLLBACK');
            return res.status(403).json({
                success: false, code: 'CALL_PROJECT_ACCESS_DENIED',
                message: 'You do not have access to this project.'
            });
        }
        const invitedMembers = await client.query(
            `SELECT candidates.firebase_uid,
                    COALESCE(profile.full_name, invitation.invited_name, profile.email, 'Project member') AS display_name
             FROM unnest($2::text[]) AS candidates(firebase_uid)
             JOIN projects p ON p.project_id = $1::uuid
             LEFT JOIN user_profiles profile ON profile.firebase_uid = candidates.firebase_uid
             LEFT JOIN LATERAL (
                 SELECT invited_name
                 FROM project_invitations
                 WHERE project_id = p.project_id
                   AND invited_firebase_uid = candidates.firebase_uid
                   AND status = 'accepted'
                 ORDER BY created_at DESC
                 LIMIT 1
             ) invitation ON TRUE
             WHERE candidates.firebase_uid <> $3
               AND (p.creator_firebase_uid = candidates.firebase_uid OR EXISTS (
                   SELECT 1 FROM project_invitations i
                   WHERE i.project_id = p.project_id
                     AND i.invited_firebase_uid = candidates.firebase_uid
                     AND i.status = 'accepted'
               ))`,
            [projectId, requestedUids, req.firebaseUid]
        );
        if (invitedMembers.rowCount !== requestedUids.length) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false, code: 'CALL_INVITEE_NOT_IN_PROJECT',
                message: 'Every invitee must be an accepted member of the selected project.'
            });
        }
        const activeCount = await client.query(
            `SELECT COUNT(*)::integer AS count
             FROM message_call_participants
             WHERE call_id = $1::uuid AND status IN ('ringing', 'accepted')`,
            [callId]
        );
        if (activeCount.rows[0].count + invitedMembers.rowCount > 4) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false, code: 'CALL_PARTICIPANT_LIMIT',
                message: 'Calls can have up to four participants.'
            });
        }
        const invited = [];
        for (const member of invitedMembers.rows) {
            const inserted = await client.query(
                `INSERT INTO message_call_participants (
                    call_id, firebase_uid, display_name, status, invited_by_uid, invited_at
                 ) VALUES ($1::uuid, $2, $3, 'ringing', $4, NOW())
                 ON CONFLICT (call_id, firebase_uid) DO UPDATE
                 SET display_name = EXCLUDED.display_name, status = 'ringing',
                     invited_by_uid = EXCLUDED.invited_by_uid, invited_at = NOW(),
                     accepted_at = NULL, left_at = NULL
                 WHERE message_call_participants.status IN ('declined', 'missed', 'left')
                 RETURNING firebase_uid, display_name, status, invited_at, accepted_at, left_at`,
                [callId, member.firebase_uid, member.display_name, req.firebaseUid]
            );
            if (inserted.rowCount) invited.push(inserted.rows[0]);
        }
        await client.query('COMMIT');
        for (const member of invited) {
            emitToUser(member.firebase_uid, 'call:updated', {
                call: {
                    ...call,
                    callee_uid: member.firebase_uid,
                    callee_name: member.display_name,
                    status: 'ringing'
                }
            });
        }
        return res.status(200).json({ success: true, data: { invited } });
    } catch (error) {
        await client?.query('ROLLBACK').catch(() => {});
        return responseError(res, error, 'Invite call participants');
    } finally {
        client?.release();
    }
};

const joinInvitedCall = async (req, res) => {
    const callId = req.params.callId;
    if (!callIdPattern.test(callId || '')) {
        return res.status(400).json({
            success: false, code: 'INVALID_CALL_ID', message: 'The call identifier is not valid.'
        });
    }
    try {
        const result = await query(
            `UPDATE message_call_participants participant
             SET status = 'accepted', accepted_at = COALESCE(accepted_at, NOW()), left_at = NULL
             FROM message_calls call
             WHERE participant.call_id = $1::uuid
               AND participant.firebase_uid = $2
               AND participant.status IN ('ringing', 'accepted')
               AND call.call_id = participant.call_id
               AND call.status IN ('ringing', 'accepted')
               AND call.expires_at > NOW()
               AND (call.status <> 'ringing' OR call.ring_expires_at > NOW())
             RETURNING call.call_id, call.conversation_id::text AS conversation_id,
                       call.caller_uid, call.caller_name, call.callee_uid, call.callee_name,
                       call.call_type, call.status, call.ring_expires_at,
                       participant.display_name` ,
            [callId, req.firebaseUid]
        );
        const call = result.rows[0];
        if (!call) {
            return res.status(404).json({
                success: false, code: 'CALL_INVITE_NOT_FOUND',
                message: 'This call invitation is no longer available.'
            });
        }
        await query(
            `UPDATE message_calls
             SET status = 'accepted', accepted_at = COALESCE(accepted_at, NOW())
             WHERE call_id = $1::uuid AND status = 'ringing'`,
            [callId]
        );
        const participants = await getCallParticipants(callId);
        const acceptedCall = { ...call, status: 'accepted' };
        emitToCallParticipants(acceptedCall, 'call:participant-updated', {
            call_id: callId,
            participants
        });
        return res.json({
            success: true,
            data: {
                call: acceptedCall,
                participants,
                ice_servers: await getMessageCallIceServers(req.firebaseUid)
            }
        });
    } catch (error) {
        return responseError(res, error, 'Join invited call');
    }
};

const declineInvitedCall = async (req, res) => {
    const callId = req.params.callId;
    if (!callIdPattern.test(callId || '')) {
        return res.status(400).json({
            success: false, code: 'INVALID_CALL_ID', message: 'The call identifier is not valid.'
        });
    }
    try {
        const result = await query(
            `UPDATE message_call_participants
             SET status = 'declined', left_at = NOW()
             WHERE call_id = $1::uuid AND firebase_uid = $2 AND status = 'ringing'
             RETURNING call_id`,
            [callId, req.firebaseUid]
        );
        if (!result.rowCount) {
            return res.status(404).json({
                success: false, code: 'CALL_INVITE_NOT_FOUND',
                message: 'This call invitation is no longer available.'
            });
        }
        const participants = await getCallParticipants(callId);
        emitToCallParticipants({ call_id: callId }, 'call:participant-updated', {
            call_id: callId,
            participants
        });
        return res.json({ success: true });
    } catch (error) {
        return responseError(res, error, 'Decline invited call');
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
        if (action === 'missed') {
            if (!isCaller) {
                await client.query('ROLLBACK');
                return res.status(403).json({
                    success: false, code: 'CALL_ACCESS_DENIED',
                    message: 'Only the caller can mark an unanswered call as missed.'
                });
            }
            if (call.status === 'ringing') {
                const expired = await client.query(
                    `SELECT ring_expires_at <= NOW() AS is_expired,
                            GREATEST(0, CEIL(EXTRACT(EPOCH FROM ring_expires_at - NOW()) * 1000))::integer
                                AS retry_after_ms
                     FROM message_calls WHERE call_id = $1::uuid`,
                    [callId]
                );
                if (!expired.rows[0]?.is_expired) {
                    await client.query('COMMIT');
                    return res.json({
                        success: true, code: 'CALL_NOT_EXPIRED',
                        message: 'The call is still ringing.',
                        data: {
                            call: toPublicCall(call),
                            retry_after_ms: expired.rows[0].retry_after_ms
                        }
                    });
                }
                const updated = await client.query(
                    `UPDATE message_calls
                     SET status = 'missed', ended_at = NOW(), ended_by_uid = $2
                     WHERE call_id = $1::uuid
                     RETURNING call_id, conversation_id::text AS conversation_id,
                               caller_uid, caller_name, callee_uid, callee_name,
                               call_type, status, created_at, accepted_at, ended_at,
                               ended_by_uid, ring_expires_at`,
                    [callId, req.firebaseUid]
                );
                await client.query('COMMIT');
                const updatedCall = toPublicCall(updated.rows[0]);
                emitToCallParticipants(updatedCall, 'call:updated', { call: updatedCall });
                return res.json({ success: true, data: { call: updatedCall } });
            }
            await client.query('COMMIT');
            return res.json({ success: true, data: { call: toPublicCall(call) } });
        }
        if (['declined', 'missed', 'ended'].includes(call.status)) {
            if (action === 'end' ||
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
                const updatedCall = { ...call, status: 'missed', ended_at: new Date().toISOString() };
                emitToCallParticipants(updatedCall, 'call:updated', { call: updatedCall });
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
            const updatedCall = { ...call, status: 'accepted' };
            emitToCallParticipants(updatedCall, 'call:updated', { call: updatedCall });
            res.set('Cache-Control', 'no-store');
            return res.json({
                success: true,
                data: { call: { ice_servers: await getMessageCallIceServers(req.firebaseUid) } }
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
        const status = action === 'decline' ? 'declined' :
            action === 'missed' ? 'missed' : 'ended';
        await client.query(
            `UPDATE message_calls SET status = $2, ended_at = NOW(), ended_by_uid = $3
             WHERE call_id = $1::uuid`,
            [callId, status, req.firebaseUid]
        );
        await client.query('COMMIT');
        const updatedCall = { ...call, status, ended_by_uid: req.firebaseUid };
        emitToCallParticipants(updatedCall, 'call:updated', { call: updatedCall });
        return res.json({ success: true });
    } catch (error) {
        await client?.query('ROLLBACK').catch(() => {});
        return responseError(res, error, `${action} WebRTC call`);
    } finally {
        client?.release();
    }
};

module.exports = {
    getCallHistory,
    startCall,
    updateCall,
    inviteCallParticipants,
    joinInvitedCall,
    declineInvitedCall
};
