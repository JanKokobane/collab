require('dotenv').config();

const { query, closeDB } = require('../src/config/db');
const { getFirebaseAdmin, initializeFirebaseAdmin } = require('../src/config/firebaseAdmin');

const collectionName = 'messageConversations';
const batchLimit = 400;
const asTimestamp = value => value ? getFirebaseAdmin().firestore.Timestamp.fromDate(new Date(value)) : null;

const writeMissing = async (entries, mergeExisting = false) => {
    let written = 0;
    for (let offset = 0; offset < entries.length; offset += batchLimit) {
        const chunk = entries.slice(offset, offset + batchLimit);
        const snapshots = await getFirebaseAdmin().firestore().getAll(...chunk.map(entry => entry.ref));
        const batch = getFirebaseAdmin().firestore().batch();
        let pending = 0;
        snapshots.forEach((snapshot, index) => {
            if (snapshot.exists && !mergeExisting) return;
            if (snapshot.exists) {
                batch.set(chunk[index].ref, chunk[index].data, { merge: true });
            } else {
                batch.create(chunk[index].ref, chunk[index].data);
            }
            pending += 1;
        });
        if (pending) {
            await batch.commit();
            written += pending;
        }
    }
    return written;
};

const main = async () => {
    initializeFirebaseAdmin();
    const firestore = getFirebaseAdmin().firestore();
    const [
        conversationsResult,
        membersResult,
        messagesResult,
        reactionsResult,
        readsResult,
        hiddenResult,
        profilesResult,
        projectMembersResult
    ] = await Promise.all([
        query(`SELECT conversation_id, project_id, conversation_type, name,
                      created_by_firebase_uid, created_at, updated_at
               FROM message_conversations`),
        query(`SELECT cm.conversation_id, cm.firebase_uid, cm.email, cm.display_name,
                      cm.joined_at, cm.last_read_at, up.profile_image
               FROM message_conversation_members cm
               LEFT JOIN user_profiles up USING (firebase_uid)`),
        query(`SELECT m.message_id, m.conversation_id, m.sender_firebase_uid,
                      sender.email AS sender_email, sender.display_name AS sender_name,
                      m.body, m.reply_to_message_id, reply.body AS reply_to_body,
                      reply.deleted_at AS reply_deleted_at,
                      reply_sender.display_name AS reply_to_sender_name,
                      m.attachments, m.forwarded_from, m.is_pinned, m.edited_at,
                      m.created_at, m.deleted_at
               FROM messages m
               JOIN message_conversation_members sender
                 ON sender.conversation_id = m.conversation_id
                AND sender.firebase_uid = m.sender_firebase_uid
               LEFT JOIN messages reply ON reply.message_id = m.reply_to_message_id
               LEFT JOIN message_conversation_members reply_sender
                 ON reply_sender.conversation_id = m.conversation_id
                AND reply_sender.firebase_uid = reply.sender_firebase_uid
               ORDER BY m.created_at, m.message_id`),
        query(`SELECT mr.message_id, mr.firebase_uid, mr.emoji, cm.email
               FROM message_reactions mr
               JOIN messages m USING (message_id)
               JOIN message_conversation_members cm
                 ON cm.conversation_id = m.conversation_id
                AND cm.firebase_uid = mr.firebase_uid`),
        query(`SELECT message_id, firebase_uid, read_at FROM message_reads`),
        query(`SELECT message_id, firebase_uid FROM message_hidden_for`),
        query(`SELECT firebase_uid, last_seen_at FROM user_profiles WHERE last_seen_at IS NOT NULL`),
        query(`SELECT project_id, creator_firebase_uid AS firebase_uid FROM projects
               UNION
               SELECT project_id, invited_firebase_uid AS firebase_uid
               FROM project_invitations
               WHERE status = 'accepted' AND invited_firebase_uid IS NOT NULL`)
    ]);

    const authorizedMembers = new Map();
    projectMembersResult.rows.forEach(row => {
        const uids = authorizedMembers.get(row.project_id) || new Set();
        uids.add(row.firebase_uid);
        authorizedMembers.set(row.project_id, uids);
    });
    const projectByConversation = new Map(
        conversationsResult.rows.map(row => [row.conversation_id, row.project_id])
    );
    const membersByConversation = new Map();
    const eligibleMembers = membersResult.rows.filter(row =>
        authorizedMembers.get(projectByConversation.get(row.conversation_id))
            ?.has(row.firebase_uid)
    );
    const memberEntries = eligibleMembers.map(row => {
        const list = membersByConversation.get(row.conversation_id) || [];
        list.push(row.firebase_uid);
        membersByConversation.set(row.conversation_id, list);
        return {
            ref: firestore.collection(collectionName).doc(row.conversation_id)
                .collection('members').doc(row.firebase_uid),
            data: {
                firebaseUid: row.firebase_uid,
                email: (row.email || '').toLowerCase(),
                display_name: row.display_name || row.email || 'Project member',
                profile_image: row.profile_image || '',
                joined_at: asTimestamp(row.joined_at),
                last_read_at: asTimestamp(row.last_read_at)
            }
        };
    });
    const conversations = conversationsResult.rows.map(row => ({
        ref: firestore.collection(collectionName).doc(row.conversation_id),
        data: {
            project_id: row.project_id,
            conversation_type: row.conversation_type,
            name: row.name || '',
            created_by_firebase_uid: row.created_by_firebase_uid,
            member_uids: (membersByConversation.get(row.conversation_id) || []).sort(),
            created_at: asTimestamp(row.created_at),
            updated_at: asTimestamp(row.updated_at),
            latest_message_id: null,
            latest_message_body: '',
            latest_sender_firebase_uid: null,
            latest_message_created_at: null
        }
    }));
    const conversationAccess = [];
    const presenceViewers = new Map();
    conversations.forEach(conversation => {
        const memberUids = conversation.data.member_uids;
        memberUids.forEach(uid => {
            conversationAccess.push({
                ref: firestore.collection('users').doc(uid)
                    .collection('messageConversations').doc(conversation.ref.id),
                data: {
                    conversation_id: conversation.ref.id,
                    project_id: conversation.data.project_id
                }
            });
            const viewers = presenceViewers.get(uid) || new Set([uid]);
            memberUids.forEach(peerUid => viewers.add(peerUid));
            presenceViewers.set(uid, viewers);
        });
    });

    const reactionsByMessage = new Map();
    reactionsResult.rows.forEach(row => {
        const list = reactionsByMessage.get(row.message_id) || [];
        list.push({
            firebaseUid: row.firebase_uid,
            email: row.email || '',
            emoji: row.emoji
        });
        reactionsByMessage.set(row.message_id, list);
    });
    const readsByMessage = new Map();
    readsResult.rows.forEach(row => {
        const list = readsByMessage.get(row.message_id) || [];
        list.push({ firebaseUid: row.firebase_uid, readAt: asTimestamp(row.read_at) });
        readsByMessage.set(row.message_id, list);
    });
    const hiddenByMessage = new Map();
    hiddenResult.rows.forEach(row => {
        const list = hiddenByMessage.get(row.message_id) || [];
        list.push(row.firebase_uid);
        hiddenByMessage.set(row.message_id, list);
    });
    const conversationById = new Map(conversations.map(entry => [
        entry.ref.id, entry
    ]));
    const messages = messagesResult.rows.map(row => {
        const conversation = conversationById.get(row.conversation_id);
        if (conversation && (!conversation.data.latest_message_created_at ||
            new Date(row.created_at) >= conversation.data.latest_message_created_at.toDate())) {
            conversation.data.latest_message_id = row.message_id;
            conversation.data.latest_message_body = row.deleted_at ? 'This message was deleted' : row.body;
            conversation.data.latest_sender_firebase_uid = row.sender_firebase_uid;
            conversation.data.latest_message_created_at = asTimestamp(row.created_at);
        }
        return {
            ref: firestore.collection(collectionName).doc(row.conversation_id)
                .collection('messages').doc(row.message_id),
            data: {
                sender_firebase_uid: row.sender_firebase_uid,
                sender_email: row.sender_email || '',
                sender_name: row.sender_name || row.sender_email || 'Project member',
                body: row.deleted_at ? 'Message deleted' : row.body,
                reply_to_message_id: row.reply_to_message_id,
                reply_to_body: row.reply_deleted_at
                    ? 'This message was deleted' : row.reply_to_body,
                reply_to_sender_name: row.reply_to_sender_name,
                attachments: row.deleted_at ? [] : row.attachments || [],
                forwarded_from: row.deleted_at ? null : row.forwarded_from,
                is_pinned: Boolean(row.is_pinned),
                edited_at: asTimestamp(row.edited_at),
                created_at: asTimestamp(row.created_at),
                deleted_at: asTimestamp(row.deleted_at),
                hidden_for: hiddenByMessage.get(row.message_id) || [],
                visible_to: (conversation?.data.member_uids || []).filter(uid =>
                    !(hiddenByMessage.get(row.message_id) || []).includes(uid)
                ),
                reaction_entries: row.deleted_at ? [] : reactionsByMessage.get(row.message_id) || [],
                read_receipts: row.deleted_at ? [] : readsByMessage.get(row.message_id) || [],
                client_message_id: null
            }
        };
    });
    const lastSeenByUid = new Map(profilesResult.rows.map(row => [row.firebase_uid, row.last_seen_at]));
    const presence = [...presenceViewers].map(([firebaseUid, viewers]) => ({
        ref: firestore.collection('messagePresence').doc(firebaseUid),
        data: {
            is_online: false,
            last_seen_at: asTimestamp(lastSeenByUid.get(firebaseUid)),
            visible_to: [...viewers]
        }
    }));

    const conversationCount = await writeMissing(conversations);
    const memberCount = await writeMissing(memberEntries);
    const accessCount = await writeMissing(conversationAccess);
    const messageCount = await writeMissing(messages);
    const presenceCount = await writeMissing(presence, true);
    console.log(
        `Firestore migration complete: ${conversationCount} conversations, ` +
        `${memberCount} members, ${accessCount} access records, ` +
        `${messageCount} messages, ${presenceCount} presence records created.`
    );
};

main()
    .catch(error => {
        console.error('Firestore message migration failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await closeDB().catch(error =>
            console.error('Unable to close PostgreSQL pool cleanly:', error.message)
        );
    });
