const { createHash, randomUUID } = require('node:crypto');
const { pool, query } = require('../config/db');
const { emitToConversation, emitToUser, setPresence } = require('../realtime/messageSocket');

const allowedReactions = new Set(['👍', '❤️', '😂', '🎉', '👀', '🙌', '🔥', '✅', '🤔', '😄']);
const maxAttachments = 10;
const maxAttachmentBytes = 512 * 1024;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const timestamp = value => value ? new Date(value).toISOString() : null;

const withTransaction = async callback => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

const getConversation = async (conversationId, firebaseUid, db = { query }) => {
    if (!uuidPattern.test(conversationId || '')) return null;
    const result = await db.query(
        `SELECT mc.conversation_id::text AS conversation_id, mc.project_id,
                mc.conversation_type, mc.name, mc.created_by_firebase_uid,
                mc.created_at, mc.updated_at,
                ARRAY_AGG(m.firebase_uid ORDER BY m.firebase_uid) AS member_uids
         FROM message_conversations mc
         JOIN message_conversation_members m
           ON m.conversation_id = mc.conversation_id
         LEFT JOIN projects p ON p.project_id = mc.project_id
         WHERE mc.conversation_id = $1::uuid
           AND EXISTS (
               SELECT 1 FROM message_conversation_members own
               WHERE own.conversation_id = mc.conversation_id
                 AND own.firebase_uid = $2
           )
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
           )
         GROUP BY mc.conversation_id`,
        [conversationId, firebaseUid]
    );
    return result.rows[0] || null;
};

const projectMembers = async (projectId, requestedUids, firebaseUid, db = { query }) => {
    const projectResult = await db.query(
        `SELECT p.project_id, p.creator_firebase_uid, p.creator_email, p.creator_name
         FROM projects p
         WHERE p.project_id = $1
           AND (p.creator_firebase_uid = $2 OR EXISTS (
               SELECT 1 FROM project_invitations pi
               WHERE pi.project_id = p.project_id
                 AND pi.invited_firebase_uid = $2 AND pi.status = 'accepted'
           ))`,
        [projectId, firebaseUid]
    );
    const project = projectResult.rows[0];
    if (!project) return null;
    const invitationResult = requestedUids.length
        ? await db.query(
            `SELECT invited_firebase_uid AS firebase_uid, invited_email AS email,
                    invited_name AS name
             FROM project_invitations
             WHERE project_id = $1 AND status = 'accepted'
               AND invited_firebase_uid = ANY($2::text[])`,
            [projectId, requestedUids]
        )
        : { rows: [] };
    const profiles = requestedUids.length
        ? await db.query(
            `SELECT firebase_uid, profile_image
             FROM user_profiles WHERE firebase_uid = ANY($1::text[])`,
            [requestedUids]
        )
        : { rows: [] };
    const profileByUid = new Map(profiles.rows.map(row => [row.firebase_uid, row.profile_image]));
    const members = new Map(invitationResult.rows.map(member => [member.firebase_uid, {
        firebaseUid: member.firebase_uid,
        email: (member.email || '').toLowerCase(),
        name: member.name || member.email || 'Project member',
        profileImage: profileByUid.get(member.firebase_uid) || ''
    }]));
    if (requestedUids.includes(project.creator_firebase_uid)) {
        members.set(project.creator_firebase_uid, {
            firebaseUid: project.creator_firebase_uid,
            email: (project.creator_email || '').toLowerCase(),
            name: project.creator_name || project.creator_email || 'Project member',
            profileImage: profileByUid.get(project.creator_firebase_uid) || ''
        });
    }
    return { project, members };
};

const uuidFromParts = (...parts) => {
    const bytes = createHash('sha1').update(JSON.stringify(parts)).digest().subarray(0, 16);
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const makeMessage = row => ({
    ...row,
    message_id: row.message_id,
    conversation_id: row.conversation_id,
    body: row.deleted_at ? 'This message was deleted' : row.body,
    attachments: row.deleted_at ? [] : row.attachments || [],
    forwarded_from: row.deleted_at ? null : row.forwarded_from,
    is_deleted: Boolean(row.deleted_at),
    created_at: timestamp(row.created_at),
    edited_at: timestamp(row.edited_at),
    read_at: timestamp(row.read_at),
    reactions: row.reactions || []
});

const getConversations = async (req, res) => {
    try {
        const result = await query(
            `SELECT mc.conversation_id::text AS conversation_id, mc.project_id,
                    mc.conversation_type, mc.name, mc.created_by_firebase_uid,
                    mc.created_at, mc.updated_at,
                    latest.body AS latest_message_body,
                    latest.deleted_at AS latest_message_deleted_at,
                    latest.attachments AS latest_message_attachments,
                    latest.created_at AS latest_message_created_at,
                    latest.message_id::text AS latest_message_id,
                    COALESCE(unread.count, 0)::int AS unread_count,
                    COALESCE(members.items, '[]'::jsonb) AS members,
                    COALESCE(members.member_uids, ARRAY[]::text[]) AS member_uids
             FROM message_conversations mc
             JOIN projects p ON p.project_id = mc.project_id
             JOIN message_conversation_members own
               ON own.conversation_id = mc.conversation_id
              AND own.firebase_uid = $1
             LEFT JOIN LATERAL (
                 SELECT msg.message_id, msg.body, msg.deleted_at, msg.attachments, msg.created_at
                 FROM messages msg
                 LEFT JOIN message_hidden_for hidden
                   ON hidden.message_id = msg.message_id AND hidden.firebase_uid = $1
                 WHERE msg.conversation_id = mc.conversation_id AND hidden.message_id IS NULL
                 ORDER BY msg.created_at DESC, msg.message_id DESC
                 LIMIT 1
             ) latest ON TRUE
             LEFT JOIN LATERAL (
                 SELECT COUNT(*)::int AS count
                 FROM messages msg
                 LEFT JOIN message_hidden_for hidden
                   ON hidden.message_id = msg.message_id AND hidden.firebase_uid = $1
                 LEFT JOIN message_reads reads
                   ON reads.message_id = msg.message_id AND reads.firebase_uid = $1
                 WHERE msg.conversation_id = mc.conversation_id
                   AND msg.sender_firebase_uid <> $1
                   AND msg.deleted_at IS NULL
                   AND hidden.message_id IS NULL
                   AND reads.message_id IS NULL
                   AND (own.last_read_at IS NULL OR msg.created_at > own.last_read_at)
             ) unread ON TRUE
             LEFT JOIN LATERAL (
                 SELECT jsonb_agg(jsonb_build_object(
                            'firebaseUid', m.firebase_uid,
                            'email', m.email,
                            'name', m.display_name,
                            'profileImage', COALESCE(up.profile_image, ''),
                            'last_seen_at', presence.last_seen_at,
                            'is_online', COALESCE(presence.is_online, FALSE),
                            'last_read_at', m.last_read_at
                        ) ORDER BY m.display_name) AS items,
                        array_agg(m.firebase_uid ORDER BY m.firebase_uid) AS member_uids
                 FROM message_conversation_members m
                 LEFT JOIN user_profiles up ON up.firebase_uid = m.firebase_uid
                 LEFT JOIN message_presence presence ON presence.firebase_uid = m.firebase_uid
                 WHERE m.conversation_id = mc.conversation_id
             ) members ON TRUE
             WHERE (
                   (mc.conversation_type <> 'direct' AND (
                       p.creator_firebase_uid = $1 OR EXISTS (
                           SELECT 1 FROM project_invitations pi
                           WHERE pi.project_id = p.project_id
                             AND pi.invited_firebase_uid = $1 AND pi.status = 'accepted'
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
                         AND peer.firebase_uid <> $1
                         AND EXISTS (
                           SELECT 1 FROM projects shared
                           WHERE (
                             shared.creator_firebase_uid = $1 OR EXISTS (
                               SELECT 1 FROM project_invitations current_invitation
                               WHERE current_invitation.project_id = shared.project_id
                                 AND current_invitation.invited_firebase_uid = $1
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
                   SELECT 1 FROM message_conversation_user_state state
                   WHERE state.conversation_id = mc.conversation_id
                     AND state.firebase_uid = $1 AND state.hidden_at IS NOT NULL
               )
             ORDER BY COALESCE(latest.created_at, mc.updated_at) DESC, mc.conversation_id`,
            [req.firebaseUid]
        );
        const conversations = result.rows.map(row => ({
            ...row,
            latest_message_body: row.latest_message_deleted_at
                ? 'This message was deleted'
                : row.latest_message_body || (row.latest_message_attachments?.length ? 'Attachment' : ''),
            latest_message_created_at: timestamp(row.latest_message_created_at),
            created_at: timestamp(row.created_at),
            updated_at: timestamp(row.updated_at),
            members: (row.members || []).map(member => ({
                ...member,
                lastSeenAt: timestamp(member.last_seen_at),
                last_read_at: timestamp(member.last_read_at)
            }))
        }));
        return res.json({ success: true, data: { conversations } });
    } catch (error) {
        console.error('List PostgreSQL message conversations failed:', error.message);
        return res.status(500).json({
            success: false, code: 'CONVERSATIONS_FETCH_FAILED',
            message: 'Conversations could not be loaded.'
        });
    }
};

const createConversation = async (req, res) => {
    const projectId = typeof req.body?.projectId === 'string' ? req.body.projectId.trim() : '';
    const type = req.body?.type;
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const requested = Array.isArray(req.body?.memberFirebaseUids)
        ? [...new Set(req.body.memberFirebaseUids.filter(uid => typeof uid === 'string' && uid))]
        : [];
    const valid = projectId && ['direct', 'group', 'channel'].includes(type) &&
        requested.length <= 50 && requested.length > 0 &&
        requested.every(uid => uid.length <= 128 && uid !== req.firebaseUid) &&
        (type === 'direct' ? requested.length === 1 :
            type === 'group' ? requested.length >= 2 && name.length <= 60 :
                name.length >= 1 && name.length <= 60);
    if (!valid) {
        return res.status(400).json({
            success: false, code: 'INVALID_CONVERSATION',
            message: 'Provide a project, conversation type, name, and valid members.'
        });
    }
    try {
        const result = await withTransaction(async client => {
            const directory = await projectMembers(projectId, requested, req.firebaseUid, client);
            if (!directory || requested.some(uid => !directory.members.has(uid))) return null;
            const memberUids = [...new Set([req.firebaseUid, ...requested])].sort();
            if (type === 'direct') {
                await client.query(
                    'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
                    [memberUids.join(':')]
                );
                const existing = await client.query(
                    `SELECT mc.conversation_id::text AS conversation_id
                     FROM message_conversations mc
                     JOIN message_conversation_members m ON m.conversation_id = mc.conversation_id
                     WHERE mc.conversation_type = 'direct'
                     GROUP BY mc.conversation_id, mc.created_at
                     HAVING array_agg(m.firebase_uid ORDER BY m.firebase_uid) = $1::text[]
                     ORDER BY mc.created_at LIMIT 1`,
                    [memberUids]
                );
                if (existing.rowCount) {
                    await client.query(
                        `UPDATE message_conversation_user_state
                         SET hidden_at = NULL
                         WHERE conversation_id = $1::uuid AND firebase_uid = $2`,
                        [existing.rows[0].conversation_id, req.firebaseUid]
                    );
                    return {
                        conversation_id: existing.rows[0].conversation_id,
                        reused: true,
                        memberUids
                    };
                }
            }

            const conversationId = type === 'direct'
                ? uuidFromParts('direct', ...memberUids)
                : randomUUID();
            const safeName = type === 'direct' ? '' : name;
            await client.query(
                `INSERT INTO message_conversations (
                    conversation_id, project_id, conversation_type, name,
                    created_by_firebase_uid
                 ) VALUES ($1::uuid, $2, $3, $4, $5)`,
                [conversationId, projectId, type, safeName, req.firebaseUid]
            );
            for (const uid of memberUids) {
                const member = uid === req.firebaseUid
                    ? await getCurrentMember(projectId, uid, client)
                    : directory.members.get(uid);
                if (!member) throw new Error('A conversation member could not be verified.');
                await client.query(
                    `INSERT INTO message_conversation_members (
                        conversation_id, firebase_uid, email, display_name
                     ) VALUES ($1::uuid, $2, $3, $4)`,
                    [conversationId, uid, member.email, member.name]
                );
            }
            return { conversation_id: conversationId, reused: false, memberUids };
        });
        if (!result) {
            return res.status(403).json({
                success: false, code: 'PROJECT_MEMBER_ACCESS_DENIED',
                message: 'Every conversation member must be an accepted member of the selected project.'
            });
        }
        const memberResult = await query(
            `SELECT member.firebase_uid, member.email, member.display_name,
                    COALESCE(profile.profile_image, '') AS profile_image
             FROM message_conversation_members member
             LEFT JOIN user_profiles profile ON profile.firebase_uid = member.firebase_uid
             WHERE member.conversation_id = $1::uuid`,
            [result.conversation_id]
        );
        result.memberUids.forEach(uid => emitToUser(uid, 'conversation:created', {
            conversation_id: result.conversation_id
        }));
        return res.status(result.reused ? 200 : 201).json({
            success: true, data: {
                conversation: {
                    conversation_id: result.conversation_id,
                    conversation_type: type,
                    member_uids: result.memberUids,
                    members: memberResult.rows.map(member => ({
                        firebaseUid: member.firebase_uid,
                        email: member.email,
                        name: member.display_name,
                        profileImage: member.profile_image
                    }))
                }
            }
        });
    } catch (error) {
        console.error('Create PostgreSQL message conversation failed:', error.message);
        return res.status(500).json({
            success: false, code: 'CONVERSATION_CREATE_FAILED',
            message: 'The conversation could not be created.'
        });
    }
};

const getCurrentMember = async (projectId, uid, db) => {
    const result = await db.query(
        `SELECT p.creator_email AS email, p.creator_name AS name
         FROM projects p
         WHERE p.project_id = $1 AND p.creator_firebase_uid = $2
         UNION ALL
         SELECT pi.invited_email AS email, pi.invited_name AS name
         FROM project_invitations pi
         WHERE pi.project_id = $1 AND pi.invited_firebase_uid = $2
           AND pi.status = 'accepted'
         LIMIT 1`,
        [projectId, uid]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
        email: (row.email || '').toLowerCase(),
        name: row.name || row.email || 'Project member'
    };
};

const deleteConversationForMe = async (req, res) => {
    try {
        const conversation = await getConversation(req.params.conversationId, req.firebaseUid);
        if (!conversation) return res.status(404).json({
            success: false, code: 'CONVERSATION_NOT_FOUND', message: 'Conversation not found.'
        });
        await query(
            `INSERT INTO message_conversation_user_state (
                conversation_id, firebase_uid, hidden_at, calls_cleared_at
             ) VALUES ($1::uuid, $2, NOW(), NOW())
             ON CONFLICT (conversation_id, firebase_uid)
             DO UPDATE SET hidden_at = NOW(), calls_cleared_at = NOW()`,
            [conversation.conversation_id, req.firebaseUid]
        );
        emitToUser(req.firebaseUid, 'conversation:removed', {
            conversation_id: conversation.conversation_id
        });
        return res.json({ success: true });
    } catch (error) {
        console.error('Hide PostgreSQL message conversation failed:', error.message);
        return res.status(500).json({
            success: false, code: 'CONVERSATION_DELETE_FAILED',
            message: 'The conversation could not be removed.'
        });
    }
};

const updateOwnPresence = async (req, res) => {
    if (typeof req.body?.isOnline !== 'boolean') {
        return res.status(400).json({
            success: false, code: 'INVALID_PRESENCE',
            message: 'Presence status must be online or offline.'
        });
    }
    try {
        await setPresence(req.firebaseUid, req.body.isOnline);
        return res.json({ success: true });
    } catch (error) {
        console.error('Update PostgreSQL message presence failed:', error.message);
        return res.status(500).json({
            success: false, code: 'PRESENCE_UPDATE_FAILED',
            message: 'Presence could not be updated.'
        });
    }
};

const getMessages = async (req, res) => {
    const conversationId = req.params.conversationId;
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 100, 1), 200);
    let cursor = null;
    if (req.query.before) {
        try {
            const parsed = JSON.parse(Buffer.from(req.query.before, 'base64url').toString());
            if (!uuidPattern.test(parsed.id) || Number.isNaN(Date.parse(parsed.createdAt))) throw new Error();
            cursor = parsed;
        } catch {
            return res.status(400).json({
                success: false, code: 'INVALID_MESSAGE_CURSOR', message: 'Message cursor is invalid.'
            });
        }
    }
    try {
        const conversation = await getConversation(conversationId, req.firebaseUid);
        if (!conversation) return res.status(404).json({
            success: false, code: 'CONVERSATION_NOT_FOUND', message: 'Conversation not found.'
        });
        const result = await query(
            `SELECT msg.message_id::text AS message_id,
                    msg.conversation_id::text AS conversation_id,
                    msg.sender_firebase_uid, msg.sender_email, msg.sender_name,
                    msg.body, msg.reply_to_message_id::text AS reply_to_message_id,
                    msg.reply_to_body, msg.reply_to_sender_name,
                    msg.attachments, msg.forwarded_from, msg.is_pinned,
                    msg.edited_at, msg.created_at, msg.deleted_at,
                    msg.client_message_id::text AS client_message_id,
                    reads.read_at,
                    COALESCE(reactions.items, '[]'::jsonb) AS reactions
             FROM messages msg
             LEFT JOIN message_hidden_for hidden
               ON hidden.message_id = msg.message_id AND hidden.firebase_uid = $2
             LEFT JOIN LATERAL (
                 SELECT MIN(read_at) AS read_at
                 FROM message_reads
                 WHERE message_id = msg.message_id
                   AND firebase_uid <> msg.sender_firebase_uid
             ) reads ON TRUE
             LEFT JOIN LATERAL (
                 SELECT jsonb_agg(jsonb_build_object('emoji', grouped.emoji, 'users', grouped.users)) AS items
                 FROM (
                     SELECT r.emoji, jsonb_agg(DISTINCT LOWER(member.email)) AS users
                     FROM message_reactions r
                     JOIN message_conversation_members member
                       ON member.conversation_id = msg.conversation_id
                      AND member.firebase_uid = r.firebase_uid
                     WHERE r.message_id = msg.message_id
                     GROUP BY r.emoji
                 ) grouped
             ) reactions ON TRUE
             WHERE msg.conversation_id = $1::uuid
               AND hidden.message_id IS NULL
               AND ($3::timestamptz IS NULL OR
                    (msg.created_at, msg.message_id) < ($3::timestamptz, $4::uuid))
             ORDER BY msg.created_at DESC, msg.message_id DESC
             LIMIT $5`,
            [conversationId, req.firebaseUid, cursor?.createdAt || null, cursor?.id || null, limit + 1]
        );
        const hasMore = result.rows.length > limit;
        const page = result.rows.slice(0, limit);
        const next = page.at(-1);
        return res.json({
            success: true,
            data: {
                messages: page.reverse().map(makeMessage),
                hasMore,
                nextCursor: hasMore && next
                    ? Buffer.from(JSON.stringify({
                        id: next.message_id,
                        createdAt: timestamp(next.created_at)
                    })).toString('base64url')
                    : null
            }
        });
    } catch (error) {
        console.error('Fetch PostgreSQL messages failed:', {
            conversationId, firebaseUid: req.firebaseUid, message: error.message
        });
        return res.status(500).json({
            success: false, code: 'MESSAGES_FETCH_FAILED',
            message: 'Messages could not be loaded.'
        });
    }
};

const createMessage = async (req, res) => {
    const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
    const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];
    const replyToId = req.body?.replyToId || null;
    const forwardedFrom = req.body?.forwardedFrom || null;
    const clientMessageId = req.body?.clientMessageId ?? null;
    const messageId = req.body?.messageId || randomUUID();
    const attachmentBytes = attachments.reduce((total, attachment) => {
        const data = typeof attachment?.data === 'string' ? attachment.data : '';
        const encoded = data.split(',').at(-1) || '';
        const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
        return total + Math.floor(encoded.length * 3 / 4) - padding;
    }, 0);
    if (body.length > 5000 || attachments.length > maxAttachments ||
        attachments.some(item => !item || typeof item.fileName !== 'string' ||
            item.fileName.length > 255 || typeof item.mediaType !== 'string' ||
            item.mediaType.length > 128 || typeof item.data !== 'string' ||
            !Number.isSafeInteger(item.size) || item.size < 0 ||
            (item.is_voice_note && (
                !/^audio\/(?:ogg|webm)(?:;codecs=opus)?$/i.test(item.mediaType) &&
                !/^audio\/mp4(?:;codecs=mp4a\.40\.2)?$/i.test(item.mediaType) ||
                !Number.isSafeInteger(item.duration_seconds) ||
                item.duration_seconds < 1 || item.duration_seconds > 3600 ||
                !Array.isArray(item.waveform_peaks) ||
                item.waveform_peaks.length !== 40 ||
                item.waveform_peaks.some(peak =>
                    typeof peak !== 'number' || !Number.isFinite(peak) || peak < 0 || peak > 1
                )
            )) ||
            !/^data:[^;,]+;base64,[a-zA-Z0-9+/=]+$/.test(item.data)) ||
        attachmentBytes > maxAttachmentBytes || (!body && attachments.length === 0) ||
        !uuidPattern.test(messageId) ||
        (clientMessageId !== null && !uuidPattern.test(clientMessageId)) ||
        (replyToId !== null && !uuidPattern.test(replyToId)) ||
        (forwardedFrom !== null && (typeof forwardedFrom !== 'object' ||
            Array.isArray(forwardedFrom) || typeof forwardedFrom.senderName !== 'string' ||
            forwardedFrom.senderName.trim().length < 1 || forwardedFrom.senderName.length > 160))) {
        return res.status(400).json({
            success: false, code: 'INVALID_MESSAGE',
            message: 'Provide a message or valid attachments within the 512 KB total attachment limit.'
        });
    }
    try {
        const result = await withTransaction(async client => {
            const conversation = await getConversation(req.params.conversationId, req.firebaseUid, client);
            if (!conversation) return { error: 'CONVERSATION_NOT_FOUND' };
            const senderResult = await client.query(
                `SELECT email, display_name FROM message_conversation_members
                 WHERE conversation_id = $1::uuid AND firebase_uid = $2`,
                [conversation.conversation_id, req.firebaseUid]
            );
            const sender = senderResult.rows[0];
            let reply = null;
            if (replyToId) {
                const replyResult = await client.query(
                    `SELECT msg.body, msg.sender_name, msg.deleted_at
                     FROM messages msg
                     LEFT JOIN message_hidden_for hidden
                       ON hidden.message_id = msg.message_id AND hidden.firebase_uid = $3
                     WHERE msg.conversation_id = $1::uuid AND msg.message_id = $2::uuid
                       AND hidden.message_id IS NULL`,
                    [conversation.conversation_id, replyToId, req.firebaseUid]
                );
                reply = replyResult.rows[0];
                if (!reply) return { error: 'INVALID_REPLY' };
            }
            const inserted = await client.query(
                `INSERT INTO messages (
                    message_id, conversation_id, sender_firebase_uid, sender_email,
                    sender_name, body, reply_to_message_id, reply_to_body,
                    reply_to_sender_name, attachments, forwarded_from, client_message_id
                 ) VALUES (
                    $1::uuid, $2::uuid, $3, $4, $5, $6, $7::uuid,
                    $8, $9, $10::jsonb, $11::jsonb, $12::uuid
                 )
                 ON CONFLICT (conversation_id, sender_firebase_uid, client_message_id)
                     WHERE client_message_id IS NOT NULL DO NOTHING
                 RETURNING *`,
                [
                    messageId, conversation.conversation_id, req.firebaseUid,
                    sender.email, sender.display_name || sender.email || 'Project member',
                    body, replyToId,
                    reply ? (reply.deleted_at ? 'This message was deleted' : reply.body) : null,
                    reply?.sender_name || null, JSON.stringify(attachments),
                    forwardedFrom ? JSON.stringify({
                        senderName: forwardedFrom.senderName.trim().slice(0, 160)
                    }) : null,
                    clientMessageId
                ]
            );
            if (!inserted.rowCount && clientMessageId) {
                const existing = await client.query(
                    `SELECT * FROM messages
                     WHERE conversation_id = $1::uuid AND sender_firebase_uid = $2
                       AND client_message_id = $3::uuid`,
                    [conversation.conversation_id, req.firebaseUid, clientMessageId]
                );
                if (existing.rowCount) return { message: existing.rows[0], duplicate: true };
            }
            const row = inserted.rows[0];
            await client.query(
                `UPDATE message_conversations
                 SET updated_at = NOW()
                 WHERE conversation_id = $1::uuid`,
                [conversation.conversation_id]
            );
            return { message: row, duplicate: false };
        });
        if (result.error) return res.status(result.error === 'INVALID_REPLY' ? 400 : 404).json({
            success: false,
            code: result.error,
            message: result.error === 'INVALID_REPLY'
                ? 'The message being replied to does not exist in this conversation.'
                : 'Conversation not found.'
        });
        const message = makeMessage(result.message);
        if (!result.duplicate) {
            emitToConversation(message.conversation_id, 'message:created', { message });
        }
        return res.status(result.duplicate ? 200 : 201).json({
            success: true, data: { messageId: message.message_id, message }
        });
    } catch (error) {
        console.error('Create PostgreSQL message failed:', {
            conversationId: req.params.conversationId,
            firebaseUid: req.firebaseUid,
            message: error.message
        });
        return res.status(500).json({
            success: false, code: 'MESSAGE_CREATE_FAILED',
            message: 'The message could not be sent.'
        });
    }
};

const mutateMessage = async (req, res) => {
    const { conversationId, messageId, action } = req.params;
    if (!uuidPattern.test(messageId || '')) return res.status(404).json({
        success: false, code: 'MESSAGE_NOT_FOUND', message: 'Message not found.'
    });
    try {
        const result = await withTransaction(async client => {
            const conversation = await getConversation(conversationId, req.firebaseUid, client);
            if (!conversation) return { status: 404, code: 'CONVERSATION_NOT_FOUND', message: 'Conversation not found.' };
            const found = await client.query(
                `SELECT * FROM messages WHERE conversation_id = $1::uuid
                 AND message_id = $2::uuid FOR UPDATE`,
                [conversationId, messageId]
            );
            const message = found.rows[0];
            if (!message) return { status: 404, code: 'MESSAGE_NOT_FOUND', message: 'Message not found.' };
            if (action === 'edit' && message.sender_firebase_uid !== req.firebaseUid) {
                return {
                    status: 403, code: 'MESSAGE_EDIT_FORBIDDEN',
                    message: 'Only the sender can edit this message.'
                };
            }
            if (message.deleted_at) return { status: 400, code: 'MESSAGE_ALREADY_DELETED', message: 'A deleted message cannot be changed.' };
            if (action === 'edit') {
                const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
                if (!body || body.length > 5000) return {
                    status: 400, code: 'INVALID_MESSAGE',
                    message: 'Message text must be between 1 and 5000 characters.'
                };
                await client.query(
                    `UPDATE messages SET body = $3, edited_at = NOW()
                     WHERE conversation_id = $1::uuid AND message_id = $2::uuid`,
                    [conversationId, messageId, body]
                );
            } else if (action === 'pin') {
                await client.query(
                    `UPDATE messages SET is_pinned = NOT is_pinned
                     WHERE conversation_id = $1::uuid AND message_id = $2::uuid`,
                    [conversationId, messageId]
                );
            } else if (action === 'reaction') {
                const emoji = req.body?.emoji;
                if (!allowedReactions.has(emoji)) return {
                    status: 400, code: 'INVALID_REACTION', message: 'Choose a supported reaction.'
                };
                const existing = await client.query(
                    `SELECT 1 FROM message_reactions
                     WHERE message_id = $1::uuid AND firebase_uid = $2 AND emoji = $3`,
                    [messageId, req.firebaseUid, emoji]
                );
                await client.query(
                    'DELETE FROM message_reactions WHERE message_id = $1::uuid AND firebase_uid = $2',
                    [messageId, req.firebaseUid]
                );
                if (!existing.rowCount) {
                    await client.query(
                        `INSERT INTO message_reactions (message_id, firebase_uid, emoji)
                         VALUES ($1::uuid, $2, $3)`,
                        [messageId, req.firebaseUid, emoji]
                    );
                }
            } else {
                return { status: 404, code: 'UNKNOWN_MESSAGE_ACTION', message: 'Unsupported message action.' };
            }
            const updated = await client.query(
                `SELECT msg.message_id::text AS message_id, msg.conversation_id::text AS conversation_id,
                        msg.sender_firebase_uid, msg.sender_email, msg.sender_name, msg.body,
                        msg.reply_to_message_id::text AS reply_to_message_id, msg.reply_to_body,
                        msg.reply_to_sender_name, msg.attachments, msg.forwarded_from,
                        msg.is_pinned, msg.edited_at, msg.created_at, msg.deleted_at,
                        msg.client_message_id::text AS client_message_id,
                        COALESCE((
                            SELECT jsonb_agg(jsonb_build_object('emoji', grouped.emoji, 'users', grouped.users))
                            FROM (
                                SELECT r.emoji, jsonb_agg(DISTINCT LOWER(member.email)) AS users
                                FROM message_reactions r
                                JOIN message_conversation_members member
                                  ON member.conversation_id = msg.conversation_id
                                 AND member.firebase_uid = r.firebase_uid
                                WHERE r.message_id = msg.message_id GROUP BY r.emoji
                            ) grouped
                        ), '[]'::jsonb) AS reactions
                 FROM messages msg
                 WHERE msg.message_id = $1::uuid`,
                [messageId]
            );
            return { message: updated.rows[0] };
        });
        if (result.status) return res.status(result.status).json({
            success: false, code: result.code, message: result.message
        });
        const message = makeMessage(result.message);
        emitToConversation(conversationId, 'message:updated', { message });
        return res.json({ success: true });
    } catch (error) {
        console.error('Update PostgreSQL message failed:', {
            conversationId, messageId, firebaseUid: req.firebaseUid, action,
            message: error.message
        });
        return res.status(500).json({
            success: false, code: 'MESSAGE_UPDATE_FAILED',
            message: 'The message could not be updated.'
        });
    }
};

const deleteMessage = async (req, res) => {
    const { conversationId, messageId } = req.params;
    const scope = req.body?.scope;
    if (!['me', 'everyone'].includes(scope)) return res.status(400).json({
        success: false, code: 'INVALID_DELETE_SCOPE',
        message: 'Choose whether to delete the message for you or for everyone.'
    });
    if (!uuidPattern.test(messageId || '')) return res.status(404).json({
        success: false, code: 'MESSAGE_NOT_FOUND', message: 'Message not found.'
    });
    try {
        const result = await withTransaction(async client => {
            const conversation = await getConversation(conversationId, req.firebaseUid, client);
            if (!conversation) return { status: 404, code: 'CONVERSATION_NOT_FOUND', message: 'Conversation not found.' };
            const existing = await client.query(
                `SELECT 1 FROM messages WHERE conversation_id = $1::uuid
                 AND message_id = $2::uuid FOR UPDATE`,
                [conversationId, messageId]
            );
            if (!existing.rowCount) return { status: 404, code: 'MESSAGE_NOT_FOUND', message: 'Message not found.' };
            if (scope === 'me') {
                await client.query(
                    `INSERT INTO message_hidden_for (message_id, firebase_uid)
                     VALUES ($1::uuid, $2) ON CONFLICT DO NOTHING`,
                    [messageId, req.firebaseUid]
                );
            } else {
                await client.query(
                    `UPDATE messages SET body = 'This message was deleted',
                        attachments = '[]'::jsonb, forwarded_from = NULL,
                        deleted_at = COALESCE(deleted_at, NOW())
                     WHERE message_id = $1::uuid`,
                    [messageId]
                );
                await client.query('DELETE FROM message_reactions WHERE message_id = $1::uuid', [messageId]);
                await client.query('DELETE FROM message_reads WHERE message_id = $1::uuid', [messageId]);
            }
            return {};
        });
        if (result.status) return res.status(result.status).json({
            success: false, code: result.code, message: result.message
        });
        emitToConversation(conversationId, 'message:deleted', {
            conversation_id: conversationId,
            message_id: messageId,
            scope,
            hidden_for_uid: scope === 'me' ? req.firebaseUid : null
        });
        return res.json({ success: true, data: { scope } });
    } catch (error) {
        console.error('Delete PostgreSQL message failed:', {
            conversationId, messageId, firebaseUid: req.firebaseUid, scope,
            message: error.message
        });
        return res.status(500).json({
            success: false, code: 'MESSAGE_DELETE_FAILED',
            message: 'The message could not be deleted.'
        });
    }
};

const clearConversationMessages = async (req, res) => {
    try {
        const conversation = await getConversation(req.params.conversationId, req.firebaseUid);
        if (!conversation) return res.status(404).json({
            success: false, code: 'CONVERSATION_NOT_FOUND', message: 'Conversation not found.'
        });
        await withTransaction(async client => {
            await client.query(
                `INSERT INTO message_hidden_for (message_id, firebase_uid)
                 SELECT msg.message_id, $2 FROM messages msg
                 WHERE msg.conversation_id = $1::uuid
                 ON CONFLICT DO NOTHING`,
                [conversation.conversation_id, req.firebaseUid]
            );
            await client.query(
                `INSERT INTO message_conversation_user_state (
                    conversation_id, firebase_uid, calls_cleared_at
                 ) VALUES ($1::uuid, $2, NOW())
                 ON CONFLICT (conversation_id, firebase_uid)
                 DO UPDATE SET calls_cleared_at = NOW()`,
                [conversation.conversation_id, req.firebaseUid]
            );
        });
        emitToUser(req.firebaseUid, 'conversation:cleared', {
            conversation_id: conversation.conversation_id
        });
        return res.json({ success: true });
    } catch (error) {
        console.error('Clear PostgreSQL conversation messages failed:', error.message);
        return res.status(500).json({
            success: false, code: 'MESSAGES_CLEAR_FAILED',
            message: 'Conversation messages could not be cleared.'
        });
    }
};

const markConversationRead = async (req, res) => {
    try {
        const conversation = await getConversation(req.params.conversationId, req.firebaseUid);
        if (!conversation) return res.status(404).json({
            success: false, code: 'CONVERSATION_NOT_FOUND', message: 'Conversation not found.'
        });
        const result = await query(
            `WITH inserted AS (
                INSERT INTO message_reads (message_id, firebase_uid)
                SELECT msg.message_id, $2
                FROM messages msg
                LEFT JOIN message_hidden_for hidden
                  ON hidden.message_id = msg.message_id AND hidden.firebase_uid = $2
                WHERE msg.conversation_id = $1::uuid
                  AND msg.sender_firebase_uid <> $2
                  AND msg.deleted_at IS NULL AND hidden.message_id IS NULL
                ON CONFLICT DO NOTHING
                RETURNING message_id
             )
             UPDATE message_conversation_members
             SET last_read_at = NOW()
             WHERE conversation_id = $1::uuid AND firebase_uid = $2
             RETURNING (SELECT COUNT(*)::int FROM inserted) AS read_count`,
            [conversation.conversation_id, req.firebaseUid]
        );
        emitToConversation(conversation.conversation_id, 'message:read', {
            conversation_id: conversation.conversation_id,
            firebase_uid: req.firebaseUid,
            read_at: new Date().toISOString()
        });
        return res.json({ success: true, data: { readCount: result.rows[0]?.read_count || 0 } });
    } catch (error) {
        console.error('Mark PostgreSQL conversation messages read failed:', error.message);
        return res.status(500).json({
            success: false, code: 'MESSAGES_READ_FAILED',
            message: 'Messages could not be marked as read.'
        });
    }
};

module.exports = {
    getConversations,
    createConversation,
    deleteConversationForMe,
    updateOwnPresence,
    getConversation,
    getMessages,
    createMessage,
    mutateMessage,
    deleteMessage,
    clearConversationMessages,
    markConversationRead
};
