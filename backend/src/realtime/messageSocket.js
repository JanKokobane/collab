const { Server } = require('socket.io');
const { query } = require('../config/db');
const { getFirebaseAdmin } = require('../config/firebaseAdmin');
const { getMessageCallIceServers } = require('../services/messageCallIceConfig');
const { isOriginAllowed } = require('../config/cors');

let io;
const socketsByUid = new Map();
const roomPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const userRoom = uid => `user:${uid}`;
const conversationRoom = id => `conversation:${id}`;
const callRoom = id => `call:${id}`;

const normalizeCallSignal = signal => {
    if (!signal || typeof signal !== 'object' || Array.isArray(signal)) return null;
    if (signal.type === 'offer' || signal.type === 'answer') {
        if (typeof signal.sdp !== 'string' || signal.sdp.length > 32768) return null;
        return { type: signal.type, sdp: signal.sdp };
    }
    if (signal.candidate && typeof signal.candidate === 'object') {
        const candidate = signal.candidate;
        if (typeof candidate.candidate !== 'string' || candidate.candidate.length > 4096 ||
            (candidate.sdpMid != null && (typeof candidate.sdpMid !== 'string' || candidate.sdpMid.length > 128)) ||
            (candidate.sdpMLineIndex != null &&
                (!Number.isInteger(candidate.sdpMLineIndex) || candidate.sdpMLineIndex < 0 ||
                    candidate.sdpMLineIndex > 255)) ||
            (candidate.usernameFragment != null &&
                (typeof candidate.usernameFragment !== 'string' || candidate.usernameFragment.length > 256))) {
            return null;
        }
        return {
            candidate: {
                candidate: candidate.candidate,
                sdpMid: candidate.sdpMid ?? null,
                sdpMLineIndex: candidate.sdpMLineIndex ?? null,
                ...(candidate.usernameFragment == null
                    ? {} : { usernameFragment: candidate.usernameFragment })
            }
        };
    }
    return null;
};

const setPresence = async (uid, isOnline) => {
    const result = await query(
        `INSERT INTO message_presence (firebase_uid, is_online, last_seen_at, updated_at)
         VALUES ($1, $2, NOW(), NOW())
         ON CONFLICT (firebase_uid) DO UPDATE
         SET is_online = EXCLUDED.is_online,
             last_seen_at = CASE WHEN EXCLUDED.is_online
                 THEN message_presence.last_seen_at ELSE NOW() END,
             updated_at = NOW()
         WHERE message_presence.is_online IS DISTINCT FROM EXCLUDED.is_online
         RETURNING firebase_uid`,
        [uid, isOnline]
    );
    if (!result.rowCount) return
    const presence = {
        firebase_uid: uid,
        is_online: isOnline,
        last_seen_at: new Date().toISOString()
    }
    io?.to(userRoom(uid)).emit('presence:updated', presence)
    const conversations = await query(
        `SELECT conversation_id::text AS conversation_id
         FROM message_conversation_members WHERE firebase_uid = $1`,
        [uid]
    )
    for (const row of conversations.rows) {
        if (await isConversationMember(row.conversation_id, uid)) {
            await emitToConversation(row.conversation_id, 'presence:updated', presence)
        }
    }
};

const isConversationMember = async (conversationId, uid) => {
    const result = await query(
        `SELECT 1
         FROM message_conversations mc
         JOIN message_conversation_members m
           ON m.conversation_id = mc.conversation_id AND m.firebase_uid = $2
         JOIN projects p ON p.project_id = mc.project_id
         WHERE mc.conversation_id = $1::uuid
           AND (
             (mc.conversation_type <> 'direct' AND (
               p.creator_firebase_uid = $2 OR EXISTS (
                 SELECT 1 FROM project_invitations pi
                 WHERE pi.project_id = p.project_id
                   AND pi.invited_firebase_uid = $2 AND pi.status = 'accepted'
               )
             ))
             OR
             (mc.conversation_type = 'direct'
               AND (SELECT COUNT(*) FROM message_conversation_members count_members
                    WHERE count_members.conversation_id = mc.conversation_id) = 2
               AND EXISTS (
                 SELECT 1
                 FROM message_conversation_members peer
                 WHERE peer.conversation_id = mc.conversation_id
                   AND peer.firebase_uid <> $2
                   AND EXISTS (
                     SELECT 1 FROM projects shared
                     WHERE (
                       shared.creator_firebase_uid = $2 OR EXISTS (
                         SELECT 1 FROM project_invitations current_invitation
                         WHERE current_invitation.project_id = shared.project_id
                           AND current_invitation.invited_firebase_uid = $2
                           AND current_invitation.status = 'accepted'
                       )
                     )
                     AND (
                       shared.creator_firebase_uid = peer.firebase_uid OR EXISTS (
                         SELECT 1 FROM project_invitations peer_invitation
                         WHERE peer_invitation.project_id = shared.project_id
                           AND peer_invitation.invited_firebase_uid = peer.firebase_uid
                           AND peer_invitation.status = 'accepted'
                       )
                     )
                   )
               )
             )
           )
           AND NOT EXISTS (
               SELECT 1 FROM message_conversation_user_state s
               WHERE s.conversation_id = mc.conversation_id
                 AND s.firebase_uid = $2 AND s.hidden_at IS NOT NULL
           )`,
        [conversationId, uid]
    );
    return result.rowCount > 0;
};

const emitToConversation = async (conversationId, event, payload, exceptSocketId = null) => {
    if (!io) return;
    try {
        const members = await query(
            `SELECT firebase_uid FROM message_conversation_members
             WHERE conversation_id = $1::uuid`,
            [conversationId]
        );
        const room = conversationRoom(conversationId);
        for (const { firebase_uid: uid } of members.rows) {
            if (!await isConversationMember(conversationId, uid)) continue;
            for (const socketId of socketsByUid.get(uid) || []) {
                if (socketId !== exceptSocketId &&
                    io.sockets.sockets.get(socketId)?.rooms.has(room)) {
                    io.to(socketId).emit(event, payload);
                }
            }
        }
    } catch (error) {
        console.error('Unable to authorize realtime conversation delivery:', {
            conversationId,
            event,
            message: error.message
        });
    }
};

const emitToUser = (uid, event, payload) => io?.to(userRoom(uid)).emit(event, payload);

const emitToCallParticipants = (call, event, payload) => {
    if (!call) return;
    const participantUids = new Set([call.caller_uid, call.callee_uid].filter(Boolean));
    participantUids.forEach(uid => {
        if (!socketsByUid.get(uid)?.size) {
            console.warn('Realtime call update has no connected participant socket.', {
                callId: call.call_id || null,
                event,
                participant: uid === call.caller_uid ? 'caller' : 'callee'
            });
            return;
        }
        emitToUser(uid, event, payload);
    });
};

const reconcileUserConversationAccess = async (uid, conversationIds) => {
    if (!io || !conversationIds.length) return;
    for (const conversationId of conversationIds) {
        if (await isConversationMember(conversationId, uid)) continue;
        for (const socketId of socketsByUid.get(uid) || []) {
            const socket = io.sockets.sockets.get(socketId);
            if (!socket?.rooms.has(conversationRoom(conversationId))) continue;
            await socket.leave(conversationRoom(conversationId));
        }
        emitToUser(uid, 'conversation:removed', { conversation_id: conversationId });
    }
};

const attachMessageSocket = server => {
    io = new Server(server, {
        cors: {
            origin(origin, callback) {
                if (isOriginAllowed(origin)) return callback(null, true);
                return callback(new Error('Origin is not allowed.'));
            },
            methods: ['GET', 'POST'],
            allowedHeaders: ['Authorization', 'Content-Type']
        },
        maxHttpBufferSize: 1e6
    });

    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth?.token;
            if (typeof token !== 'string' || !token) {
                return next(new Error('Authentication required.'));
            }
            const decoded = await getFirebaseAdmin().auth().verifyIdToken(token);
            socket.data.firebaseUid = decoded.uid;
            socket.data.tokenExpiresAt = decoded.exp * 1000;
            next();
        } catch (error) {
            console.error('Message socket authentication failed:', error.message);
            next(new Error('Authentication failed.'));
        }
    });

    io.on('connection', async socket => {
        const uid = socket.data.firebaseUid;
        let callSignalWindowStartedAt = Date.now();
        let callSignalCount = 0;
        const authExpiryTimer = setTimeout(
            () => socket.disconnect(true),
            Math.max(0, socket.data.tokenExpiresAt - Date.now())
        );
        const userSockets = socketsByUid.get(uid) || new Set();
        userSockets.add(socket.id);
        socketsByUid.set(uid, userSockets);
        socket.join(userRoom(uid));
        try {
            await setPresence(uid, true);
        } catch (error) {
            console.error('Unable to set message presence online:', error.message);
            socket.disconnect(true);
            return;
        }
        try {
            const pendingCallInvites = await query(
                `SELECT call.call_id, call.conversation_id::text AS conversation_id,
                        call.caller_uid, call.caller_name, call.callee_uid,
                        call.callee_name, call.call_type, call.status,
                        call.ring_expires_at,
                        participant.firebase_uid AS invited_uid
                 FROM message_call_participants participant
                 JOIN message_calls call ON call.call_id = participant.call_id
                 WHERE participant.firebase_uid = $1
                   AND participant.status = 'ringing'
                   AND call.status IN ('ringing', 'accepted')
                   AND call.expires_at > NOW()
                   AND (call.status <> 'ringing' OR call.ring_expires_at > NOW())
                 ORDER BY participant.invited_at DESC
                 LIMIT 10`,
                [uid]
            );
            pendingCallInvites.rows.forEach(call => {
                socket.emit('call:updated', {
                    call: {
                        ...call,
                        callee_uid: call.invited_uid,
                        added_participant: call.invited_uid !== call.callee_uid
                    }
                });
            });
        } catch (error) {
            console.error('Unable to restore pending call invitations:', {
                uid,
                message: error.message
            });
        }

        socket.on('conversation:join', async (conversationId, acknowledge) => {
            const acknowledgeResult = typeof acknowledge === 'function' ? acknowledge : () => {};
            if (typeof conversationId !== 'string' || !roomPattern.test(conversationId)) {
                acknowledgeResult({ success: false, message: 'Invalid conversation.' });
                return;
            }
            try {
                if (!await isConversationMember(conversationId, uid)) {
                    acknowledgeResult({ success: false, message: 'Conversation access denied.' });
                    return;
                }
                await socket.join(conversationRoom(conversationId));
                const activeCalls = await query(
                    `SELECT call_id, conversation_id::text, caller_uid, caller_name,
                            callee_uid, callee_name, call_type, status, created_at,
                            ring_expires_at
                     FROM message_calls
                     WHERE conversation_id = $1::uuid AND status IN ('ringing', 'accepted')
                       AND CASE WHEN status = 'ringing'
                           THEN ring_expires_at ELSE expires_at END > NOW()
                       AND (caller_uid = $2 OR callee_uid = $2)
                     ORDER BY created_at DESC`,
                    [conversationId, uid]
                );
                const iceServers = activeCalls.rowCount
                    ? await getMessageCallIceServers(uid)
                    : null;
                const pendingMessages = await query(
                    `INSERT INTO message_deliveries (message_id, firebase_uid)
                     SELECT m.message_id, $2
                     FROM messages m
                     LEFT JOIN message_hidden_for h
                       ON h.message_id = m.message_id AND h.firebase_uid = $2
                     WHERE m.conversation_id = $1::uuid
                       AND m.sender_firebase_uid <> $2 AND m.deleted_at IS NULL
                       AND h.message_id IS NULL
                     ON CONFLICT DO NOTHING
                     RETURNING message_id`,
                    [conversationId, uid]
                );
                if (pendingMessages.rowCount) {
                    emitToConversation(conversationId, 'message:delivered', {
                        conversation_id: conversationId,
                        firebase_uid: uid,
                        message_ids: pendingMessages.rows.map(row => row.message_id)
                    });
                }
                acknowledgeResult({
                    success: true,
                    activeCalls: activeCalls.rows.map(row => ({
                        ...row,
                        created_at: row.created_at.toISOString(),
                        ring_expires_at: row.ring_expires_at.toISOString(),
                        peer_uid: row.caller_uid === uid ? row.callee_uid : row.caller_uid,
                        ice_servers: iceServers
                    }))
                });
            } catch (error) {
                console.error('Unable to join message conversation:', error.message);
                acknowledgeResult({ success: false, message: 'Unable to join conversation.' });
            }
        });

        socket.on('conversation:leave', conversationId => {
            if (typeof conversationId === 'string' && roomPattern.test(conversationId)) {
                socket.leave(conversationRoom(conversationId));
            }
        });

        socket.on('call:join', async (callId, acknowledge) => {
            const acknowledgeResult = typeof acknowledge === 'function' ? acknowledge : () => {};
            if (typeof callId !== 'string' || !roomPattern.test(callId)) {
                acknowledgeResult({ success: false, message: 'Invalid call.' });
                return;
            }
            try {
                const callResult = await query(
                    `SELECT call.conversation_id::text AS conversation_id,
                            call.call_type, call.status
                     FROM message_calls call
                     JOIN message_call_participants participant
                       ON participant.call_id = call.call_id
                     WHERE call.call_id = $1::uuid
                       AND participant.firebase_uid = $2
                       AND participant.status = 'accepted'
                       AND call.status IN ('ringing', 'accepted')
                       AND call.expires_at > NOW()`,
                    [callId, uid]
                );
                const call = callResult.rows[0];
                if (!call) {
                    acknowledgeResult({ success: false, message: 'You are not an accepted participant in this call.' });
                    return;
                }
                await socket.join(callRoom(callId));
                const participants = await query(
                    `SELECT firebase_uid, display_name, status, invited_at, accepted_at
                     FROM message_call_participants
                     WHERE call_id = $1::uuid
                     ORDER BY invited_at, display_name`,
                    [callId]
                );
                acknowledgeResult({
                    success: true,
                    conversationId: call.conversation_id,
                    callType: call.call_type,
                    participants: participants.rows,
                    iceServers: await getMessageCallIceServers(uid)
                });
            } catch (error) {
                console.error('Unable to join call room:', {
                    callId,
                    uid,
                    message: error.message
                });
                acknowledgeResult({ success: false, message: 'Unable to join call.' });
            }
        });

        socket.on('call:leave', callId => {
            if (typeof callId === 'string' && roomPattern.test(callId)) {
                socket.leave(callRoom(callId));
            }
        });

        socket.on('call:signal', async (payload = {}, acknowledge) => {
            const acknowledgeResult = typeof acknowledge === 'function' ? acknowledge : () => {};
            const { conversationId, callId, targetUid } = payload;
            const signal = normalizeCallSignal(payload.signal);
            if (typeof conversationId !== 'string' || !roomPattern.test(conversationId) ||
                typeof callId !== 'string' || !roomPattern.test(callId) ||
                typeof targetUid !== 'string' || targetUid.length > 128 || !signal ||
                !socket.rooms.has(callRoom(callId))) {
                acknowledgeResult({ success: false, message: 'Invalid call signaling payload.' });
                return;
            }
            if (Date.now() - callSignalWindowStartedAt >= 60_000) {
                callSignalWindowStartedAt = Date.now();
                callSignalCount = 0;
            }
            callSignalCount += 1;
            if (callSignalCount > 120) {
                acknowledgeResult({ success: false, message: 'Call signaling rate limit exceeded.' });
                return;
            }
            try {
                const callResult = await query(
                                        `SELECT call.conversation_id::text AS conversation_id,
                                                        call.status,
                                                        sender.status AS sender_status,
                                                        recipient.status AS recipient_status
                     FROM message_calls call
                                         JOIN message_call_participants sender
                                             ON sender.call_id = call.call_id AND sender.firebase_uid = $3
                                         JOIN message_call_participants recipient
                                             ON recipient.call_id = call.call_id AND recipient.firebase_uid = $4
                     WHERE call.call_id = $1::uuid
                       AND call.conversation_id = $2::uuid
                       AND call.expires_at > NOW()`,
                                        [callId, conversationId, uid, targetUid]
                );
                const call = callResult.rows[0];
                                if (!call || uid === targetUid || call.status !== 'accepted' ||
                                        call.sender_status !== 'accepted' || call.recipient_status !== 'accepted') {
                    acknowledgeResult({ success: false, message: 'Call signaling access denied.' });
                    return;
                }
                emitToUser(targetUid, 'call:signal', {
                    conversation_id: conversationId,
                    call_id: callId,
                    from_uid: uid,
                    signal
                });
                acknowledgeResult({ success: true });
            } catch (error) {
                console.error('Unable to authorize WebRTC call signaling:', {
                    conversationId, callId, message: error.message
                });
                acknowledgeResult({ success: false, message: 'Call signaling failed.' });
            }
        });

        socket.on('typing:update', async ({ conversationId, isTyping } = {}) => {
            if (typeof conversationId !== 'string' || !roomPattern.test(conversationId) ||
                typeof isTyping !== 'boolean') return;
            try {
                if (await isConversationMember(conversationId, uid)) {
                    emitToConversation(conversationId, 'typing:updated', {
                        conversation_id: conversationId,
                        firebase_uid: uid,
                        is_typing: isTyping
                    }, socket.id);
                }
            } catch (error) {
                console.error('Unable to verify typing event access:', error.message);
            }
        });

        socket.on('disconnect', async () => {
            clearTimeout(authExpiryTimer);
            const activeSockets = socketsByUid.get(uid);
            activeSockets?.delete(socket.id);
            if (activeSockets?.size) return;
            socketsByUid.delete(uid);
            try {
                await setPresence(uid, false);
            } catch (error) {
                console.error('Unable to set message presence offline:', error.message);
            }
        });
    });

    return io;
};

module.exports = {
    attachMessageSocket,
    emitToConversation,
    emitToCallParticipants,
    emitToUser,
    reconcileUserConversationAccess,
    setPresence
};
