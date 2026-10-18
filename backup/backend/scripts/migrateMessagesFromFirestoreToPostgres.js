require('dotenv').config();

const { pool, closeDB } = require('../src/config/db');
const { getFirebaseAdmin, initializeFirebaseAdmin } = require('../src/config/firebaseAdmin');

const conversationIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedReactions = new Set(['👍', '❤️', '😂', '🎉', '👀', '🙌', '🔥', '✅', '🤔', '😄']);
const asDate = value => value?.toDate?.() || (value ? new Date(value) : null);

const pages = async (collection, processPage) => {
    let cursor = null;
    while (true) {
        let request = collection.orderBy('__name__').limit(200);
        if (cursor) request = request.startAfter(cursor);
        const snapshot = await request.get();
        if (snapshot.empty) return;
        await processPage(snapshot.docs);
        cursor = snapshot.docs.at(-1);
    }
};

const importConversation = async (firestore, snapshot) => {
    const data = snapshot.data();
    if (data.merged_into) return { skipped: true };
    if (!conversationIdPattern.test(snapshot.id) ||
        !['direct', 'group', 'channel'].includes(data.conversation_type) ||
        typeof data.project_id !== 'string' || !data.project_id) {
        console.warn('Skipping Firestore conversation with invalid identity or fields.', {
            conversationId: snapshot.id
        });
        return { skipped: true };
    }
    const memberSnapshot = await snapshot.ref.collection('members').get();
    const members = new Map(memberSnapshot.docs.map(member => {
        const value = member.data();
        return [member.id, {
            firebaseUid: member.id,
            email: (value.email || '').toLowerCase(),
            name: value.display_name || value.name || value.email || 'Project member',
            joinedAt: asDate(value.joined_at),
            lastReadAt: asDate(value.last_read_at)
        }];
    }));
    (Array.isArray(data.member_uids) ? data.member_uids : []).forEach(uid => {
        if (typeof uid === 'string' && uid && !members.has(uid)) {
            members.set(uid, {
                firebaseUid: uid,
                email: '',
                name: 'Project member',
                joinedAt: null,
                lastReadAt: null
            });
        }
    });
    if (!members.size) {
        console.warn('Skipping Firestore conversation without members.', {
            conversationId: snapshot.id
        });
        return { skipped: true };
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const project = await client.query(
            `SELECT project_id, creator_firebase_uid
             FROM projects WHERE project_id = $1 FOR SHARE`,
            [data.project_id]
        );
        if (!project.rowCount) {
            await client.query('ROLLBACK');
            console.warn('Skipping Firestore conversation whose project no longer exists.', {
                conversationId: snapshot.id
            });
            return { skipped: true };
        }
        const access = await client.query(
            `SELECT firebase_uid FROM (
                 SELECT creator_firebase_uid AS firebase_uid FROM projects WHERE project_id = $1
                 UNION
                 SELECT invited_firebase_uid AS firebase_uid FROM project_invitations
                 WHERE project_id = $1 AND status = 'accepted'
                   AND invited_firebase_uid IS NOT NULL
             ) allowed_members`,
            [data.project_id]
        );
        const allowedUids = new Set(access.rows.map(row => row.firebase_uid));
        let authorized;
        if (data.conversation_type === 'direct') {
            const sharedProject = members.size === 2
                ? await client.query(
                `SELECT 1
                 FROM projects p
                 WHERE (
                   p.creator_firebase_uid = $1 OR EXISTS (
                     SELECT 1 FROM project_invitations pi
                     WHERE pi.project_id = p.project_id
                       AND pi.invited_firebase_uid = $1 AND pi.status = 'accepted'
                   )
                 )
                 AND (
                   p.creator_firebase_uid = $2 OR EXISTS (
                     SELECT 1 FROM project_invitations pi
                     WHERE pi.project_id = p.project_id
                       AND pi.invited_firebase_uid = $2 AND pi.status = 'accepted'
                   )
                 )
                 LIMIT 1`,
                [...members.keys()]
                )
                : { rowCount: 0 };
            authorized = sharedProject.rowCount > 0;
        } else {
            authorized = [...members.keys()].every(uid => allowedUids.has(uid));
        }
        if (!authorized) {
            await client.query('ROLLBACK');
            console.warn('Skipping Firestore conversation with members no longer authorized for its project.', {
                conversationId: snapshot.id
            });
            return { skipped: true };
        }
        await client.query(
            `INSERT INTO message_conversations (
                conversation_id, project_id, conversation_type, name,
                created_by_firebase_uid, created_at, updated_at
             ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (conversation_id) DO NOTHING`,
            [
                snapshot.id, data.project_id, data.conversation_type,
                data.name || '',
                data.created_by_firebase_uid || [...members.keys()][0],
                asDate(data.created_at) || new Date(),
                asDate(data.updated_at) || asDate(data.created_at) || new Date()
            ]
        );
        const storedConversation = await client.query(
            `SELECT project_id, conversation_type FROM message_conversations
             WHERE conversation_id = $1::uuid`,
            [snapshot.id]
        );
        if (!storedConversation.rowCount ||
            storedConversation.rows[0].project_id !== data.project_id ||
            storedConversation.rows[0].conversation_type !== data.conversation_type) {
            throw new Error(`Conversation ID ${snapshot.id} already belongs to a different SQL conversation.`);
        }
        for (const member of members.values()) {
            await client.query(
                `INSERT INTO message_conversation_members (
                    conversation_id, firebase_uid, email, display_name, joined_at, last_read_at
                 ) VALUES ($1::uuid, $2, $3, $4, COALESCE($5, NOW()), $6)
                 ON CONFLICT (conversation_id, firebase_uid) DO NOTHING`,
                [
                    snapshot.id, member.firebaseUid, member.email,
                    member.name, member.joinedAt, member.lastReadAt
                ]
            );
            const presenceSnapshot = await firestore.collection('messagePresence')
                .doc(member.firebaseUid).get();
            const lastSeenAt = asDate(presenceSnapshot.data()?.last_seen_at);
            if (lastSeenAt) {
                await client.query(
                    `INSERT INTO message_presence (firebase_uid, is_online, last_seen_at)
                     VALUES ($1, FALSE, $2)
                     ON CONFLICT (firebase_uid) DO UPDATE
                     SET is_online = FALSE,
                         last_seen_at = GREATEST(message_presence.last_seen_at, EXCLUDED.last_seen_at),
                         updated_at = NOW()
                     WHERE message_presence.is_online
                        OR message_presence.last_seen_at < EXCLUDED.last_seen_at`,
                    [member.firebaseUid, lastSeenAt]
                );
            }
            const accessDoc = await firestore.collection('users').doc(member.firebaseUid)
                .collection('messageConversations').doc(snapshot.id).get();
            if (accessDoc.data()?.hidden_for_user === true) {
                await client.query(
                    `INSERT INTO message_conversation_user_state (
                        conversation_id, firebase_uid, hidden_at
                     ) VALUES ($1::uuid, $2, NOW())
                     ON CONFLICT (conversation_id, firebase_uid)
                     DO UPDATE SET hidden_at = COALESCE(
                         message_conversation_user_state.hidden_at, NOW()
                     )`,
                    [snapshot.id, member.firebaseUid]
                );
            }
        }

        const importedMessages = new Map();
        await pages(snapshot.ref.collection('messages'), async messageDocs => {
            for (const messageSnapshot of messageDocs) {
                const message = messageSnapshot.data();
                if (!conversationIdPattern.test(messageSnapshot.id) ||
                    typeof message.sender_firebase_uid !== 'string' ||
                    !members.has(message.sender_firebase_uid) ||
                    typeof message.body !== 'string' ||
                    !Array.isArray(message.attachments || [])) {
                    console.warn('Skipping Firestore message with invalid schema.', {
                        conversationId: snapshot.id,
                        messageId: messageSnapshot.id
                    });
                    continue;
                }
                const createdAt = asDate(message.created_at) || new Date();
                await client.query(
                    `INSERT INTO messages (
                        message_id, conversation_id, sender_firebase_uid, sender_email,
                        sender_name, body, reply_to_body, reply_to_sender_name,
                        attachments, forwarded_from, is_pinned, edited_at, created_at,
                        deleted_at, client_message_id
                     ) VALUES (
                        $1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8,
                        $9::jsonb, $10::jsonb, $11, $12, $13, $14, $15::uuid
                     )
                     ON CONFLICT (message_id) DO UPDATE SET
                        sender_email = COALESCE(
                            NULLIF(messages.sender_email, ''), EXCLUDED.sender_email
                        ),
                        sender_name = COALESCE(
                            NULLIF(messages.sender_name, ''), EXCLUDED.sender_name
                        ),
                        body = CASE
                            WHEN EXCLUDED.deleted_at IS NOT NULL OR EXCLUDED.edited_at IS NOT NULL
                                THEN EXCLUDED.body
                            ELSE messages.body
                        END,
                        reply_to_body = COALESCE(messages.reply_to_body, EXCLUDED.reply_to_body),
                        reply_to_sender_name = COALESCE(
                            messages.reply_to_sender_name, EXCLUDED.reply_to_sender_name
                        ),
                        attachments = CASE
                            WHEN messages.deleted_at IS NOT NULL THEN messages.attachments
                            WHEN EXCLUDED.deleted_at IS NOT NULL OR EXCLUDED.edited_at IS NOT NULL
                                OR messages.attachments = '[]'::jsonb
                                THEN EXCLUDED.attachments
                            ELSE messages.attachments
                        END,
                        forwarded_from = CASE
                            WHEN messages.deleted_at IS NOT NULL THEN messages.forwarded_from
                            WHEN EXCLUDED.deleted_at IS NOT NULL OR EXCLUDED.edited_at IS NOT NULL
                                THEN EXCLUDED.forwarded_from
                            ELSE COALESCE(messages.forwarded_from, EXCLUDED.forwarded_from)
                        END,
                        is_pinned = EXCLUDED.is_pinned,
                        edited_at = GREATEST(messages.edited_at, EXCLUDED.edited_at),
                        deleted_at = COALESCE(messages.deleted_at, EXCLUDED.deleted_at),
                        client_message_id = COALESCE(
                            messages.client_message_id, EXCLUDED.client_message_id
                        )`,
                    [
                        messageSnapshot.id, snapshot.id, message.sender_firebase_uid,
                        message.sender_email || members.get(message.sender_firebase_uid).email,
                        message.sender_name || members.get(message.sender_firebase_uid).name,
                        message.deleted_at ? 'This message was deleted' : message.body,
                        message.reply_to_body || null,
                        message.reply_to_sender_name || null,
                        JSON.stringify(message.deleted_at ? [] : message.attachments || []),
                        JSON.stringify(message.deleted_at ? null : message.forwarded_from || null),
                        Boolean(message.is_pinned), asDate(message.edited_at), createdAt,
                        asDate(message.deleted_at),
                        conversationIdPattern.test(message.client_message_id || '')
                            ? message.client_message_id
                            : null
                    ]
                );
                importedMessages.set(messageSnapshot.id, {
                    message, createdAt
                });
            }
        });

        for (const [messageId, { message }] of importedMessages) {
            const replyToId = conversationIdPattern.test(message.reply_to_message_id || '')
                ? message.reply_to_message_id
                : null;
            if (replyToId && importedMessages.has(replyToId)) {
                await client.query(
                    `UPDATE messages SET reply_to_message_id = $2::uuid
                     WHERE message_id = $1::uuid AND reply_to_message_id IS NULL`,
                    [messageId, replyToId]
                );
            }
            const hiddenFor = new Set(
                Array.isArray(message.hidden_for) ? message.hidden_for : []
            );
            if (Array.isArray(message.visible_to)) {
                members.forEach((_member, uid) => {
                    if (!message.visible_to.includes(uid)) hiddenFor.add(uid);
                });
            }
            for (const uid of hiddenFor) {
                if (members.has(uid)) {
                    await client.query(
                        `INSERT INTO message_hidden_for (message_id, firebase_uid)
                         VALUES ($1::uuid, $2) ON CONFLICT DO NOTHING`,
                        [messageId, uid]
                    );
                }
            }
            if (!message.deleted_at && Array.isArray(message.reaction_entries)) {
                for (const reaction of message.reaction_entries) {
                    if (!members.has(reaction.firebaseUid) || !allowedReactions.has(reaction.emoji)) continue;
                    await client.query(
                        `INSERT INTO message_reactions (message_id, firebase_uid, emoji)
                         VALUES ($1::uuid, $2, $3) ON CONFLICT DO NOTHING`,
                        [messageId, reaction.firebaseUid, reaction.emoji]
                    );
                }
            }
            if (!message.deleted_at && Array.isArray(message.read_receipts)) {
                for (const receipt of message.read_receipts) {
                    if (!members.has(receipt.firebaseUid)) continue;
                    const readAt = asDate(receipt.readAt);
                    if (!readAt) continue;
                    await client.query(
                        `INSERT INTO message_reads (message_id, firebase_uid, read_at)
                         VALUES ($1::uuid, $2, $3) ON CONFLICT DO NOTHING`,
                        [messageId, receipt.firebaseUid, readAt]
                    );
                }
            }
        }

        const callDocs = await snapshot.ref.collection('calls').get();
        for (const callSnapshot of callDocs.docs) {
            const call = callSnapshot.data();
            if (!conversationIdPattern.test(callSnapshot.id) ||
                !members.has(call.caller_uid) || !members.has(call.callee_uid) ||
                !['audio', 'video'].includes(call.call_type) ||
                !['ringing', 'accepted', 'declined', 'missed', 'ended'].includes(call.status) ||
                typeof call.daily_room_name !== 'string' ||
                typeof call.daily_room_url !== 'string' ||
                !asDate(call.expires_at) || !asDate(call.ring_expires_at)) continue;
            await client.query(
                `INSERT INTO message_calls (
                    call_id, conversation_id, caller_uid, caller_name, callee_uid,
                    callee_name, call_type, status, daily_room_name, daily_room_url,
                    created_at, accepted_at, expires_at, ring_expires_at, ended_at, ended_by_uid
                 ) VALUES (
                    $1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10,
                    $11, $12, $13, $14, $15, $16
                 ) ON CONFLICT (call_id) DO NOTHING`,
                [
                    callSnapshot.id, snapshot.id, call.caller_uid,
                    call.caller_name || members.get(call.caller_uid).name,
                    call.callee_uid, call.callee_name || members.get(call.callee_uid).name,
                    call.call_type, call.status, call.daily_room_name,
                    call.daily_room_url, asDate(call.created_at) || new Date(),
                    asDate(call.accepted_at), asDate(call.expires_at),
                    asDate(call.ring_expires_at), asDate(call.ended_at),
                    call.ended_by_uid || null
                ]
            );
        }

        await client.query('COMMIT');
        return { skipped: false, messages: importedMessages.size };
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

const main = async () => {
    initializeFirebaseAdmin();
    const firestore = getFirebaseAdmin().firestore();
    let conversationCount = 0;
    let messageCount = 0;
    let skippedCount = 0;
    await pages(firestore.collection('messageConversations'), async snapshots => {
        for (const snapshot of snapshots) {
            const imported = await importConversation(firestore, snapshot);
            if (imported.skipped) skippedCount += 1;
            else {
                conversationCount += 1;
                messageCount += imported.messages;
            }
        }
    });
    console.log(
        `Firestore import complete: ${conversationCount} conversations and ` +
        `${messageCount} messages imported; ${skippedCount} conversations skipped.`
    );
};

main()
    .catch(error => {
        console.error('Firestore-to-PostgreSQL message import failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await closeDB().catch(error =>
            console.error('Unable to close PostgreSQL pool cleanly:', error.message)
        );
    });
