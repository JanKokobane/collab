const { randomUUID } = require('node:crypto');
const { pool, query } = require('../config/db');
const { publishMessageEvent } = require('../services/messageSocket');

const allowedReactions = new Set(['👍', '❤️', '😂', '🎉', '👀', '🙌', '🔥', '✅', '🤔', '😄']);
const maxAttachments = 10;
const maxAttachmentBytes = 512 * 1024;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const getConversation = async (conversationId, firebaseUid) => {
    if (!uuidPattern.test(conversationId || '')) return null;
    const result = await query(
        `SELECT c.conversation_id, c.project_id, c.conversation_type, c.name
         FROM message_conversations c
         JOIN message_conversation_members cm USING (conversation_id)
         WHERE c.conversation_id = $1
           AND cm.firebase_uid = $2
           AND EXISTS (
               SELECT 1
               FROM projects p
               WHERE p.project_id = c.project_id
                 AND (p.creator_firebase_uid = $2 OR EXISTS (
                     SELECT 1
                     FROM project_invitations pi
                     WHERE pi.project_id = p.project_id
                       AND pi.invited_firebase_uid = $2
                       AND pi.status = 'accepted'
                 ))
           )`,
        [conversationId, firebaseUid]
    );
    return result.rows[0] || null;
};

const publishToMembers = async (conversationId, event) => {
    const result = await query(
        `SELECT DISTINCT cm.firebase_uid
         FROM message_conversation_members cm
         JOIN message_conversations c USING (conversation_id)
         JOIN projects p ON p.project_id = c.project_id
         WHERE cm.conversation_id = $1
           AND (p.creator_firebase_uid = cm.firebase_uid OR EXISTS (
               SELECT 1
               FROM project_invitations pi
               WHERE pi.project_id = p.project_id
                 AND pi.invited_firebase_uid = cm.firebase_uid
                 AND pi.status = 'accepted'
           ))`,
        [conversationId]
    );
    await publishMessageEvent(result.rows.map(row => row.firebase_uid), {
        ...event,
        conversationId
    });
};

const getConversations = async (req, res) => {
    try {
        const result = await query(
            `SELECT c.conversation_id, c.project_id, c.conversation_type, c.name,
                    c.created_at, c.updated_at,
                    COALESCE(members.members, '[]'::jsonb) AS members,
                    latest.message_id AS latest_message_id,
                    latest.body AS latest_message_body,
                    latest.sender_firebase_uid AS latest_sender_firebase_uid,
                    latest.created_at AS latest_message_created_at,
                    COALESCE(unread.unread_count, 0)::int AS unread_count
             FROM message_conversations c
             JOIN message_conversation_members mine
               ON mine.conversation_id = c.conversation_id
              AND mine.firebase_uid = $1
             JOIN projects p ON p.project_id = c.project_id
              AND (p.creator_firebase_uid = $1 OR EXISTS (
                  SELECT 1 FROM project_invitations pi
                  WHERE pi.project_id = p.project_id
                    AND pi.invited_firebase_uid = $1
                    AND pi.status = 'accepted'
              ))
             LEFT JOIN LATERAL (
                 SELECT jsonb_agg(jsonb_build_object(
                     'firebaseUid', cm.firebase_uid,
                     'email', cm.email,
                     'name', cm.display_name,
                     'profileImage', up.profile_image
                 ) ORDER BY cm.joined_at) AS members
                 FROM message_conversation_members cm
                 LEFT JOIN user_profiles up ON up.firebase_uid = cm.firebase_uid
                 WHERE cm.conversation_id = c.conversation_id
             ) members ON TRUE
             LEFT JOIN LATERAL (
                 SELECT message_id, body, sender_firebase_uid, created_at
                 FROM messages
                 WHERE conversation_id = c.conversation_id
                 ORDER BY created_at DESC, message_id DESC
                 LIMIT 1
             ) latest ON TRUE
             LEFT JOIN LATERAL (
                 SELECT COUNT(*) AS unread_count
                 FROM messages m
                 WHERE m.conversation_id = c.conversation_id
                   AND m.sender_firebase_uid <> $1
                   AND m.created_at > COALESCE(mine.last_read_at, '-infinity'::timestamptz)
             ) unread ON TRUE
             ORDER BY COALESCE(latest.created_at, c.created_at) DESC`,
            [req.firebaseUid]
        );
        return res.json({ success: true, data: { conversations: result.rows } });
    } catch (error) {
        console.error('Get message conversations error:', error);
        return res.status(500).json({
            success: false,
            code: 'MESSAGE_CONVERSATIONS_FETCH_FAILED',
            message: 'Conversations could not be retrieved.'
        });
    }
};

const createConversation = async (req, res) => {
    const projectId = typeof req.body?.projectId === 'string' ? req.body.projectId.trim() : '';
    const type = req.body?.type;
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const memberUids = Array.isArray(req.body?.memberFirebaseUids)
        ? [...new Set(req.body.memberFirebaseUids.filter(uid => typeof uid === 'string' && uid.trim()).map(uid => uid.trim()))]
        : [];
    const allowedTypes = new Set(['direct', 'group', 'channel']);
    if (!projectId || !allowedTypes.has(type) || name.length > 60 ||
        (type !== 'direct' && !name) || memberUids.length > 99 ||
        memberUids.length !== (req.body?.memberFirebaseUids || []).length ||
        (type === 'direct' && memberUids.length !== 1) ||
        (type === 'group' && memberUids.length < 2) ||
        (type === 'channel' && memberUids.length < 1) ||
        memberUids.includes(req.firebaseUid)) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_CONVERSATION',
            message: 'Choose a valid conversation type, name, and project members.'
        });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const projectResult = await client.query(
            `SELECT project_id, creator_firebase_uid, creator_email, creator_name
             FROM projects p
             WHERE p.project_id = $1
               AND (p.creator_firebase_uid = $2 OR EXISTS (
                   SELECT 1 FROM project_invitations pi
                   WHERE pi.project_id = p.project_id
                     AND pi.invited_firebase_uid = $2 AND pi.status = 'accepted'
               ))
             FOR SHARE`,
            [projectId, req.firebaseUid]
        );
        const project = projectResult.rows[0];
        if (!project) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                success: false,
                code: 'PROJECT_NOT_FOUND',
                message: 'Project not found.'
            });
        }

        const memberResult = await client.query(
            `SELECT invited_firebase_uid AS firebase_uid, invited_email AS email, invited_name AS name
             FROM project_invitations
             WHERE project_id = $1 AND status = 'accepted'
               AND invited_firebase_uid = ANY($2::text[])
             UNION ALL
             SELECT creator_firebase_uid, creator_email, creator_name
             FROM projects WHERE project_id = $1 AND creator_firebase_uid = ANY($2::text[])`,
            [projectId, memberUids]
        );
        const membersByUid = new Map(memberResult.rows.map(member => [member.firebase_uid, member]));
        if (memberUids.some(uid => !membersByUid.has(uid))) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                code: 'INVALID_CONVERSATION_MEMBERS',
                message: 'All conversation members must be accepted members of the selected project.'
            });
        }

        const allMembers = [
            {
                firebase_uid: req.firebaseUid,
                email: req.firebaseEmail || '',
                name: req.firebaseUser?.name || req.firebaseUser?.displayName || req.firebaseEmail || 'Project member'
            },
            ...memberUids.map(uid => membersByUid.get(uid))
        ].map(member => ({
            ...member,
            email: member.email || '',
            name: member.name || member.email || 'Project member'
        }));

        if (type === 'direct') {
            const directLockKey = [projectId, ...[req.firebaseUid, memberUids[0]].sort()].join(':');
            await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [directLockKey]);
            const existing = await client.query(
                `SELECT c.conversation_id
                 FROM message_conversations c
                 JOIN message_conversation_members mine
                   ON mine.conversation_id = c.conversation_id AND mine.firebase_uid = $1
                 JOIN message_conversation_members other
                   ON other.conversation_id = c.conversation_id AND other.firebase_uid = $2
                 WHERE c.project_id = $3 AND c.conversation_type = 'direct'
                   AND (SELECT COUNT(*) FROM message_conversation_members cm
                        WHERE cm.conversation_id = c.conversation_id) = 2
                 LIMIT 1`,
                [req.firebaseUid, memberUids[0], projectId]
            );
            if (existing.rows[0]) {
                await client.query('COMMIT');
                const conversation = await getConversation(existing.rows[0].conversation_id, req.firebaseUid);
                return res.status(200).json({ success: true, data: { conversation } });
            }
        }

        const conversationId = randomUUID();
        await client.query(
            `INSERT INTO message_conversations
             (conversation_id, project_id, conversation_type, name, created_by_firebase_uid)
             VALUES ($1, $2, $3, $4, $5)`,
            [conversationId, projectId, type, type === 'direct' ? '' : name, req.firebaseUid]
        );
        for (const member of allMembers) {
            await client.query(
                `INSERT INTO message_conversation_members
                 (conversation_id, firebase_uid, email, display_name)
                 VALUES ($1, $2, $3, $4)`,
                [conversationId, member.firebase_uid, member.email, member.name]
            );
        }
        await client.query('COMMIT');
        await publishToMembers(conversationId, { type: 'conversation.changed' });
        return res.status(201).json({
            success: true,
            data: {
                conversation: {
                    conversation_id: conversationId,
                    project_id: projectId,
                    conversation_type: type,
                    name: type === 'direct' ? '' : name
                }
            }
        });
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Create message conversation error:', error);
        return res.status(500).json({
            success: false,
            code: 'MESSAGE_CONVERSATION_CREATE_FAILED',
            message: 'The conversation could not be created.'
        });
    } finally {
        client.release();
    }
};

const getMessages = async (req, res) => {
    try {
        const conversation = await getConversation(req.params.conversationId, req.firebaseUid);
        if (!conversation) {
            return res.status(404).json({
                success: false,
                code: 'CONVERSATION_NOT_FOUND',
                message: 'Conversation not found.'
            });
        }
        const result = await query(
            `SELECT m.message_id, m.conversation_id, m.sender_firebase_uid,
                    sender.email AS sender_email, sender.display_name AS sender_name,
                    m.body, m.reply_to_message_id, reply.body AS reply_to_body,
                    reply_sender.display_name AS reply_to_sender_name,
                    m.attachments, m.forwarded_from, m.is_pinned, m.edited_at, m.created_at,
                    COALESCE(reactions.items, '[]'::jsonb) AS reactions,
                    reads.read_at
             FROM messages m
             JOIN message_conversation_members sender
               ON sender.conversation_id = m.conversation_id
              AND sender.firebase_uid = m.sender_firebase_uid
             LEFT JOIN messages reply ON reply.message_id = m.reply_to_message_id
             LEFT JOIN message_conversation_members reply_sender
               ON reply_sender.conversation_id = m.conversation_id
              AND reply_sender.firebase_uid = reply.sender_firebase_uid
             LEFT JOIN LATERAL (
                 SELECT jsonb_agg(jsonb_build_object('emoji', grouped.emoji, 'users', grouped.users)) AS items
                 FROM (
                             SELECT mr.emoji, jsonb_agg(LOWER(cm.email) ORDER BY cm.display_name) AS users
                     FROM message_reactions mr
                     JOIN message_conversation_members cm
                       ON cm.conversation_id = m.conversation_id AND cm.firebase_uid = mr.firebase_uid
                     WHERE mr.message_id = m.message_id
                     GROUP BY mr.emoji
                 ) grouped
             ) reactions ON TRUE
             LEFT JOIN LATERAL (
                 SELECT MIN(read_at) AS read_at FROM message_reads
                 WHERE message_id = m.message_id AND firebase_uid <> m.sender_firebase_uid
             ) reads ON TRUE
             WHERE m.conversation_id = $1
             ORDER BY m.created_at, m.message_id`,
            [conversation.conversation_id]
        );
        return res.json({ success: true, data: { messages: result.rows } });
    } catch (error) {
        console.error('Get conversation messages error:', error);
        return res.status(500).json({
            success: false,
            code: 'MESSAGES_FETCH_FAILED',
            message: 'Messages could not be retrieved.'
        });
    }
};

const createMessage = async (req, res) => {
    const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
    const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];
    const replyToId = req.body?.replyToId || null;
    const forwardedFrom = req.body?.forwardedFrom || null;
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
            !/^data:[^;,]+;base64,[a-zA-Z0-9+/=]+$/.test(item.data)) ||
        attachmentBytes > maxAttachmentBytes ||
        (!body && attachments.length === 0) ||
        (replyToId !== null && (typeof replyToId !== 'string' || !uuidPattern.test(replyToId))) ||
        (forwardedFrom !== null && (
            typeof forwardedFrom !== 'object' ||
            Array.isArray(forwardedFrom) ||
            typeof forwardedFrom.senderName !== 'string' ||
            forwardedFrom.senderName.length > 160
        ))) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_MESSAGE',
            message: 'Provide a message or valid attachments within the 512 KB total attachment limit.'
        });
    }
    const safeAttachments = attachments.map(({ fileName, mediaType, size, data }) => ({
        fileName,
        mediaType,
        size,
        data
    }));
    try {
        const conversation = await getConversation(req.params.conversationId, req.firebaseUid);
        if (!conversation) {
            return res.status(404).json({
                success: false,
                code: 'CONVERSATION_NOT_FOUND',
                message: 'Conversation not found.'
            });
        }
        if (replyToId) {
            const reply = await query(
                `SELECT 1 FROM messages WHERE message_id = $1 AND conversation_id = $2`,
                [replyToId, conversation.conversation_id]
            );
            if (!reply.rowCount) {
                return res.status(400).json({
                    success: false,
                    code: 'INVALID_REPLY',
                    message: 'The message being replied to does not exist in this conversation.'
                });
            }
        }
        const messageId = randomUUID();
        await query(
            `INSERT INTO messages
             (message_id, conversation_id, sender_firebase_uid, body, reply_to_message_id, attachments, forwarded_from)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
            [
                messageId,
                conversation.conversation_id,
                req.firebaseUid,
                body,
                replyToId,
                JSON.stringify(safeAttachments),
                forwardedFrom ? JSON.stringify({ senderName: forwardedFrom.senderName }) : null
            ]
        );
        await query(
            `UPDATE message_conversations SET updated_at = NOW() WHERE conversation_id = $1`,
            [conversation.conversation_id]
        );
        await publishToMembers(conversation.conversation_id, { type: 'message.changed' });
        return res.status(201).json({ success: true, data: { messageId } });
    } catch (error) {
        console.error('Create message error:', error);
        return res.status(500).json({
            success: false,
            code: 'MESSAGE_CREATE_FAILED',
            message: 'The message could not be sent.'
        });
    }
};

const mutateMessage = async (req, res) => {
    const { conversationId, messageId } = req.params;
    const action = req.params.action;
    try {
        if (!uuidPattern.test(messageId || '')) {
            return res.status(404).json({
                success: false,
                code: 'MESSAGE_NOT_FOUND',
                message: 'Message not found.'
            });
        }
        const conversation = await getConversation(conversationId, req.firebaseUid);
        if (!conversation) {
            return res.status(404).json({
                success: false,
                code: 'CONVERSATION_NOT_FOUND',
                message: 'Conversation not found.'
            });
        }
        const found = await query(
            `SELECT sender_firebase_uid FROM messages WHERE message_id = $1 AND conversation_id = $2`,
            [messageId, conversation.conversation_id]
        );
        if (!found.rowCount) {
            return res.status(404).json({
                success: false,
                code: 'MESSAGE_NOT_FOUND',
                message: 'Message not found.'
            });
        }
        if (action === 'edit') {
            const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
            if (found.rows[0].sender_firebase_uid !== req.firebaseUid) {
                return res.status(403).json({ success: false, code: 'MESSAGE_EDIT_FORBIDDEN', message: 'Only the sender can edit this message.' });
            }
            if (!body || body.length > 5000) {
                return res.status(400).json({ success: false, code: 'INVALID_MESSAGE', message: 'Message text must be between 1 and 5000 characters.' });
            }
            await query(
                `UPDATE messages SET body = $1, edited_at = NOW() WHERE message_id = $2`,
                [body, messageId]
            );
        } else if (action === 'delete') {
            if (found.rows[0].sender_firebase_uid !== req.firebaseUid) {
                return res.status(403).json({ success: false, code: 'MESSAGE_DELETE_FORBIDDEN', message: 'Only the sender can delete this message.' });
            }
            await query(`DELETE FROM messages WHERE message_id = $1`, [messageId]);
        } else if (action === 'pin') {
            await query(`UPDATE messages SET is_pinned = NOT is_pinned WHERE message_id = $1`, [messageId]);
        } else if (action === 'reaction') {
            const emoji = req.body?.emoji;
            if (!allowedReactions.has(emoji)) {
                return res.status(400).json({ success: false, code: 'INVALID_REACTION', message: 'Choose a supported reaction.' });
            }
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                await client.query(
                    `SELECT message_id FROM messages WHERE message_id = $1 FOR UPDATE`,
                    [messageId]
                );
                await client.query(
                    `DELETE FROM message_reactions WHERE message_id = $1 AND firebase_uid = $2 AND emoji <> $3`,
                    [messageId, req.firebaseUid, emoji]
                );
                const deleted = await client.query(
                    `DELETE FROM message_reactions WHERE message_id = $1 AND firebase_uid = $2 AND emoji = $3`,
                    [messageId, req.firebaseUid, emoji]
                );
                if (!deleted.rowCount) {
                    await client.query(
                        `INSERT INTO message_reactions (message_id, firebase_uid, emoji) VALUES ($1, $2, $3)`,
                        [messageId, req.firebaseUid, emoji]
                    );
                }
                await client.query('COMMIT');
            } catch (error) {
                await client.query('ROLLBACK').catch(() => {});
                throw error;
            } finally {
                client.release();
            }
        } else {
            return res.status(404).json({ success: false, code: 'UNKNOWN_MESSAGE_ACTION', message: 'Unsupported message action.' });
        }
        await publishToMembers(conversation.conversation_id, { type: 'message.changed' });
        return res.json({ success: true });
    } catch (error) {
        console.error(`Message ${action} error:`, error);
        return res.status(500).json({
            success: false,
            code: 'MESSAGE_UPDATE_FAILED',
            message: 'The message could not be updated.'
        });
    }
};

const markConversationRead = async (req, res) => {
    try {
        const conversation = await getConversation(req.params.conversationId, req.firebaseUid);
        if (!conversation) {
            return res.status(404).json({
                success: false,
                code: 'CONVERSATION_NOT_FOUND',
                message: 'Conversation not found.'
            });
        }
        await query(
            `WITH read_messages AS (
                 SELECT message_id FROM messages
                 WHERE conversation_id = $1 AND sender_firebase_uid <> $2
             )
             INSERT INTO message_reads (message_id, firebase_uid)
             SELECT message_id, $2 FROM read_messages
             ON CONFLICT (message_id, firebase_uid) DO UPDATE SET read_at = NOW()`,
            [conversation.conversation_id, req.firebaseUid]
        );
        await query(
            `UPDATE message_conversation_members SET last_read_at = NOW()
             WHERE conversation_id = $1 AND firebase_uid = $2`,
            [conversation.conversation_id, req.firebaseUid]
        );
        await publishToMembers(conversation.conversation_id, { type: 'message.read' });
        return res.json({ success: true });
    } catch (error) {
        console.error('Mark conversation read error:', error);
        return res.status(500).json({
            success: false,
            code: 'MESSAGE_READ_UPDATE_FAILED',
            message: 'Read status could not be updated.'
        });
    }
};

module.exports = {
    getConversations,
    createConversation,
    getMessages,
    createMessage,
    mutateMessage,
    markConversationRead
};
