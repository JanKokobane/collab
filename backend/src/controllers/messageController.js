const { createHash, randomUUID } = require('node:crypto');
const { query } = require('../config/db');
const { getFirebaseAdmin } = require('../config/firebaseAdmin');

const allowedReactions = new Set(['👍', '❤️', '😂', '🎉', '👀', '🙌', '🔥', '✅', '🤔', '😄']);
const maxAttachments = 10;
const maxAttachmentBytes = 512 * 1024;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const conversationsCollection = 'messageConversations';

const firestore = () => getFirebaseAdmin().firestore();
const timestamp = value => {
    if (!value) return null;
    if (typeof value.toDate === 'function') return value.toDate().toISOString();
    if (value instanceof Date) return value.toISOString();
    return value;
};

const conversationRef = conversationId => firestore()
    .collection(conversationsCollection).doc(conversationId);
const messagesRef = conversationId => conversationRef(conversationId).collection('messages');
const memberRef = (conversationId, uid) =>
    conversationRef(conversationId).collection('members').doc(uid);

const projectIsAccessible = async (projectId, firebaseUid) => {
    const result = await query(
        `SELECT 1
         FROM projects p
         WHERE p.project_id = $1
           AND (p.creator_firebase_uid = $2 OR EXISTS (
               SELECT 1 FROM project_invitations pi
               WHERE pi.project_id = p.project_id
                 AND pi.invited_firebase_uid = $2
                 AND pi.status = 'accepted'
           ))`,
        [projectId, firebaseUid]
    );
    return result.rowCount > 0;
};

const directMembersShareAccessibleProject = async memberUids => {
    if (!Array.isArray(memberUids) || memberUids.length !== 2) return null;
    const result = await query(
        `SELECT p.project_id
         FROM projects p
         WHERE
           (p.creator_firebase_uid = $1 OR EXISTS (
               SELECT 1 FROM project_invitations pi
               WHERE pi.project_id = p.project_id
                 AND pi.invited_firebase_uid = $1
                 AND pi.status = 'accepted'
           ))
           AND
           (p.creator_firebase_uid = $2 OR EXISTS (
               SELECT 1 FROM project_invitations pi
               WHERE pi.project_id = p.project_id
                 AND pi.invited_firebase_uid = $2
                 AND pi.status = 'accepted'
           ))
         ORDER BY p.project_id
         LIMIT 1`,
        memberUids
    );
    return result.rows[0]?.project_id || null;
};

const getLatestTimestampMillis = value => {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
};

const mergeDirectSubcollection = async (sourceRef, targetRef, collectionName) => {
    let cursor = null;
    while (true) {
        let page = sourceRef.collection(collectionName)
            .orderBy('__name__').limit(200);
        if (cursor) page = page.startAfter(cursor);
        const snapshot = await page.get();
        if (snapshot.empty) return;
        const targets = snapshot.docs.map(item => targetRef.collection(collectionName).doc(item.id));
        const existingTargets = await firestore().getAll(...targets);
        const batch = firestore().batch();
        snapshot.docs.forEach((item, index) => {
            if (!existingTargets[index].exists) {
                const data = item.data();
                batch.create(targets[index], collectionName === 'calls'
                    ? { ...data, conversation_id: targetRef.id }
                    : data);
            }
            batch.delete(item.ref);
        });
        await batch.commit();
        cursor = snapshot.docs[snapshot.docs.length - 1];
    }
};

const ensureDirectConversation = async ({
    projectId,
    callerUid,
    members,
    memberUids
}) => {
    const sqlConversations = await query(
        `SELECT mc.conversation_id::text AS conversation_id, mc.project_id, mc.created_at
         FROM message_conversations mc
         JOIN message_conversation_members cm
           ON cm.conversation_id = mc.conversation_id
         WHERE mc.conversation_type = 'direct'
         GROUP BY mc.conversation_id, mc.project_id, mc.created_at
         HAVING array_agg(cm.firebase_uid ORDER BY cm.firebase_uid) = $1::text[]
         ORDER BY mc.created_at`,
        [memberUids]
    );
    const sqlIds = sqlConversations.rows.map(row => row.conversation_id);
    const sqlReadState = sqlIds.length
        ? await query(
            `SELECT firebase_uid, MIN(last_read_at) AS last_read_at
             FROM message_conversation_members
             WHERE conversation_id = ANY($1::uuid[])
             GROUP BY firebase_uid`,
            [sqlIds]
        )
        : { rows: [] };
    const sqlLastReadByUid = new Map(sqlReadState.rows.map(row => [
        row.firebase_uid,
        row.last_read_at
    ]));
    const snapshots = await firestore().collection(conversationsCollection)
        .where('member_uids', 'array-contains', callerUid).get();
    const existingDirect = snapshots.docs
        .filter(snapshot => {
            const data = snapshot.data();
            return data.conversation_type === 'direct' &&
                !data.merged_into &&
                Array.isArray(data.member_uids) &&
                data.member_uids.length === 2 &&
                data.member_uids.every(uid => memberUids.includes(uid));
        })
        .sort((left, right) =>
            getLatestTimestampMillis(left.data().created_at) -
            getLatestTimestampMillis(right.data().created_at));
    const canonicalId = sqlIds[0] || existingDirect[0]?.id ||
        uuidFromParts('direct', ...memberUids);
    const targetRef = conversationRef(canonicalId);
    const now = getFirebaseAdmin().firestore.Timestamp.now();
    const snapshotsById = new Map(existingDirect.map(snapshot => [snapshot.id, snapshot]));
    const canonicalData = snapshotsById.get(canonicalId)?.data() ||
        existingDirect[0]?.data() || {};
    const latestConversation = existingDirect.reduce((latest, snapshot) => {
        if (!latest || getLatestTimestampMillis(snapshot.data().latest_message_created_at) >
            getLatestTimestampMillis(latest.data().latest_message_created_at)) return snapshot;
        return latest;
    }, null);
    await targetRef.set({
        ...canonicalData,
        project_id: canonicalData.project_id || projectId,
        conversation_type: 'direct',
        name: '',
        created_by_firebase_uid: canonicalData.created_by_firebase_uid || callerUid,
        member_uids: memberUids,
        created_at: canonicalData.created_at || now,
        updated_at: latestConversation?.data().updated_at || canonicalData.updated_at || now,
        latest_message_id: latestConversation?.data().latest_message_id ??
            canonicalData.latest_message_id ?? null,
        latest_message_body: latestConversation?.data().latest_message_body ??
            canonicalData.latest_message_body ?? '',
        latest_sender_firebase_uid: latestConversation?.data().latest_sender_firebase_uid ??
            canonicalData.latest_sender_firebase_uid ?? null,
        latest_message_created_at: latestConversation?.data().latest_message_created_at ??
            canonicalData.latest_message_created_at ?? null
    }, { merge: true });

    const existingMembers = await Promise.all(members.map(async member => {
        const states = await Promise.all(existingDirect.map(snapshot =>
            memberRef(snapshot.id, member.firebaseUid).get()
        ));
        const data = states.filter(snapshot => snapshot.exists).map(snapshot => snapshot.data());
        const readTimes = [
            ...data.map(item => item.last_read_at),
            sqlLastReadByUid.get(member.firebaseUid)
                ? getFirebaseAdmin().firestore.Timestamp.fromDate(
                    new Date(sqlLastReadByUid.get(member.firebaseUid))
                )
                : null
        ].filter(Boolean);
        const lastReadAt = readTimes.sort((left, right) =>
            getLatestTimestampMillis(left) - getLatestTimestampMillis(right))[0] || null;
        return {
            member,
            joinedAt: data.map(item => item.joined_at)
                .filter(Boolean)
                .sort((left, right) =>
                    getLatestTimestampMillis(left) - getLatestTimestampMillis(right))[0] || now,
            lastReadAt
        };
    }));

    const accessBatch = firestore().batch();
    for (const { member, joinedAt, lastReadAt } of existingMembers) {
        accessBatch.set(memberRef(canonicalId, member.firebaseUid), {
            firebaseUid: member.firebaseUid,
            email: (member.email || '').toLowerCase(),
            display_name: member.name || member.email || 'Project member',
            profile_image: member.profileImage || '',
            joined_at: joinedAt,
            last_read_at: lastReadAt
        }, { merge: true });
        accessBatch.set(
            firestore().collection('users').doc(member.firebaseUid)
                .collection('messageConversations').doc(canonicalId),
            {
                conversation_id: canonicalId,
                project_id: canonicalData.project_id || projectId,
                ...(member.firebaseUid === callerUid ? { hidden_for_user: false } : {})
            },
            { merge: true }
        );
        accessBatch.set(
            firestore().collection('messagePresence').doc(member.firebaseUid),
            {
                visible_to: getFirebaseAdmin().firestore.FieldValue.arrayUnion(...memberUids)
            },
            { merge: true }
        );
    }
    await accessBatch.commit();

    for (const source of existingDirect) {
        if (source.id === canonicalId) continue;
        await mergeDirectSubcollection(
            conversationRef(source.id), targetRef, 'messages'
        );
        await mergeDirectSubcollection(
            conversationRef(source.id), targetRef, 'calls'
        );
        await firestore().recursiveDelete(conversationRef(source.id));
        const cleanupBatch = firestore().batch();
        for (const uid of memberUids) {
            cleanupBatch.delete(
                firestore().collection('users').doc(uid)
                    .collection('messageConversations').doc(source.id)
            );
        }
        await cleanupBatch.commit();
    }

    const saved = await targetRef.get();
    console.info('Ensured one shared Firestore direct conversation across projects.', {
        conversationId: canonicalId,
        mergedConversationCount: Math.max(0, existingDirect.length - 1)
    });
    return {
        created: !sqlIds.length && !existingDirect.length,
        conversation: {
            conversation_id: canonicalId,
            ...(saved.data() || {})
        }
    };
};

const getAccessibleProjectIds = async (projectIds, firebaseUid) => {
    if (!projectIds.length) return new Set();
    const result = await query(
        `SELECT p.project_id
         FROM projects p
         WHERE p.project_id = ANY($1::text[])
           AND (p.creator_firebase_uid = $2 OR EXISTS (
               SELECT 1 FROM project_invitations pi
               WHERE pi.project_id = p.project_id
                 AND pi.invited_firebase_uid = $2
                 AND pi.status = 'accepted'
           ))`,
        [projectIds, firebaseUid]
    );
    return new Set(result.rows.map(row => row.project_id));
};

const reconcileConversationAccess = async (firebaseUid, conversations) => {
    const accessCollection = firestore().collection('users').doc(firebaseUid)
        .collection('messageConversations');
    const [existingSnapshot, ...targetSnapshots] = await Promise.all([
        accessCollection.get(),
        ...conversations.map(conversation =>
            accessCollection.doc(conversation.conversation_id).get()
        )
    ]);
    const authorizedIds = new Set(conversations.map(item => item.conversation_id));
    const updates = [];
    const visiblePeers = new Set();
    const hiddenIds = new Set();
    conversations.forEach((conversation, index) => {
        const snapshot = targetSnapshots[index];
        const data = snapshot.data() || {};
        (conversation.members || []).forEach(member => {
            if (member.firebaseUid && member.firebaseUid !== firebaseUid) {
                visiblePeers.add(member.firebaseUid);
            }
        });
        if (data.hidden_for_user === true) {
            hiddenIds.add(conversation.conversation_id);
            return;
        }
        if (!snapshot.exists ||
            data.conversation_id !== conversation.conversation_id ||
            data.project_id !== conversation.project_id) {
            updates.push({
                ref: accessCollection.doc(conversation.conversation_id),
                data: {
                    conversation_id: conversation.conversation_id,
                    project_id: conversation.project_id,
                    hidden_for_user: false
                }
            });
        }
    });
    existingSnapshot.docs.forEach(snapshot => {
        if (!authorizedIds.has(snapshot.id)) {
            updates.push({ ref: snapshot.ref, delete: true });
        }
    });
    for (let offset = 0; offset < updates.length; offset += 400) {
        const batch = firestore().batch();
        updates.slice(offset, offset + 400).forEach(update => {
            if (update.delete) batch.delete(update.ref);
            else batch.set(update.ref, update.data, { merge: true });
        });
        await batch.commit();
    }
    const presenceRef = firestore().collection('messagePresence').doc(firebaseUid);
    const peerUids = [...visiblePeers];
    const presenceIds = [firebaseUid, ...peerUids];
    const presenceSnapshots = [];
    for (let offset = 0; offset < presenceIds.length; offset += 300) {
        presenceSnapshots.push(...await firestore().getAll(
            ...presenceIds.slice(offset, offset + 300).map(uid =>
                firestore().collection('messagePresence').doc(uid))
        ));
    }
    const presenceByUid = new Map(presenceSnapshots.map(snapshot => [snapshot.id, snapshot]));
    const ownVisibleTo = new Set(
        Array.isArray(presenceByUid.get(firebaseUid)?.data()?.visible_to)
            ? presenceByUid.get(firebaseUid).data().visible_to
            : []
    );
    const missingOwnPeers = presenceIds.filter(uid => !ownVisibleTo.has(uid));
    if (missingOwnPeers.length) {
        for (let offset = 0; offset < missingOwnPeers.length; offset += 400) {
            const visibleTo = missingOwnPeers.slice(offset, offset + 400);
            await presenceRef.set({
                visible_to: getFirebaseAdmin().firestore.FieldValue.arrayUnion(...visibleTo)
            }, { merge: true });
        }
    }
    const missingPeerUids = peerUids.filter(uid => {
        const visibleTo = presenceByUid.get(uid)?.data()?.visible_to;
        return !Array.isArray(visibleTo) || !visibleTo.includes(firebaseUid);
    });
    for (let offset = 0; offset < missingPeerUids.length; offset += 400) {
        const batch = firestore().batch();
        missingPeerUids.slice(offset, offset + 400).forEach(uid => {
            batch.set(firestore().collection('messagePresence').doc(uid), {
                visible_to: getFirebaseAdmin().firestore.FieldValue.arrayUnion(firebaseUid)
            }, { merge: true });
        });
        await batch.commit();
    }
    if (updates.length) {
        console.info('Reconciled authenticated message conversation access indexes.', {
            firebaseUid,
            repairedOrRemovedCount: updates.length
        });
    }
    return hiddenIds;
};

const getConversation = async (conversationId, firebaseUid) => {
    if (!uuidPattern.test(conversationId || '')) return null;
    const accessRef = firestore().collection('users').doc(firebaseUid)
        .collection('messageConversations').doc(conversationId);
    const [snapshot, accessSnapshot] = await Promise.all([
        conversationRef(conversationId).get(),
        accessRef.get()
    ]);
    if (!snapshot.exists || !accessSnapshot.exists ||
        accessSnapshot.data().hidden_for_user === true) return null;
    const conversation = { conversation_id: snapshot.id, ...snapshot.data() };
    if (!conversation.member_uids?.includes(firebaseUid)) return null;
    const accessible = conversation.conversation_type === 'direct'
        ? Boolean(await directMembersShareAccessibleProject(conversation.member_uids))
        : await projectIsAccessible(conversation.project_id, firebaseUid);
    if (!accessible) return null;
    return conversation;
};


const asMillis = value => {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
};

const makeMessage = (snapshot, conversationId) => {
    const data = snapshot.data();
    const reactionsByEmoji = new Map();
    for (const reaction of data.reaction_entries || []) {
        const users = reactionsByEmoji.get(reaction.emoji) || [];
        if (reaction.email && !users.includes(reaction.email.toLowerCase())) {
            users.push(reaction.email.toLowerCase());
        }
        reactionsByEmoji.set(reaction.emoji, users);
    }
    const readReceipts = (data.read_receipts || [])
        .filter(receipt => receipt.firebaseUid !== data.sender_firebase_uid)
        .map(receipt => receipt.readAt)
        .filter(Boolean)
        .sort((a, b) => asMillis(a) - asMillis(b));
    return {
        message_id: snapshot.id,
        conversation_id: conversationId,
        sender_firebase_uid: data.sender_firebase_uid,
        sender_email: data.sender_email || '',
        sender_name: data.sender_name || 'Project member',
        body: data.deleted_at ? 'This message was deleted' : data.body,
        is_deleted: Boolean(data.deleted_at),
        reply_to_message_id: data.reply_to_message_id || null,
        reply_to_body: data.reply_to_body || null,
        reply_to_sender_name: data.reply_to_sender_name || null,
        attachments: data.deleted_at ? [] : data.attachments || [],
        forwarded_from: data.deleted_at ? null : data.forwarded_from || null,
        is_pinned: Boolean(data.is_pinned),
        edited_at: timestamp(data.edited_at),
        created_at: timestamp(data.created_at),
        reactions: data.deleted_at ? [] : [...reactionsByEmoji].map(([emoji, users]) => ({ emoji, users })),
        read_at: readReceipts.length ? timestamp(readReceipts[0]) : null,
        client_message_id: data.client_message_id || null
    };
};

const getSenderAndReplyData = async (conversation, firebaseUid, replyToId) => {
    const senderSnapshot = await memberRef(conversation.conversation_id, firebaseUid).get();
    const sender = senderSnapshot.exists ? senderSnapshot.data() : {};
    let replyData = {};
    if (replyToId) {
        const replySnapshot = await messagesRef(conversation.conversation_id).doc(replyToId).get();
        if (!replySnapshot.exists) return null;
        const reply = replySnapshot.data();
        replyData = {
            reply_to_body: (reply.hidden_for || []).includes(firebaseUid)
                ? 'Message unavailable'
                : reply.deleted_at ? 'This message was deleted' : reply.body,
            reply_to_sender_name: reply.sender_name || 'Project member'
        };
    }
    return {
        sender_email: sender.email || '',
        sender_name: sender.display_name || sender.name || sender.email || 'Project member',
        ...replyData
    };
};

const listProjectMembers = async (projectId, firebaseUid, requestedUids) => {
    const projectResult = await query(
        `SELECT project_id, creator_firebase_uid, creator_email, creator_name
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
    const invitations = await query(
        `SELECT invited_firebase_uid AS firebase_uid, invited_email AS email, invited_name AS name
         FROM project_invitations
         WHERE project_id = $1 AND status = 'accepted'
           AND invited_firebase_uid = ANY($2::text[])`,
        [projectId, requestedUids]
    );
    const profiles = requestedUids.length ? await query(
        `SELECT firebase_uid, profile_image FROM user_profiles WHERE firebase_uid = ANY($1::text[])`,
        [requestedUids]
    ) : { rows: [] };
    const profileByUid = new Map(profiles.rows.map(row => [row.firebase_uid, row.profile_image]));
    const members = new Map(invitations.rows.map(member => [member.firebase_uid, {
        firebaseUid: member.firebase_uid,
        email: (member.email || '').toLowerCase(),
        name: member.name || member.email || 'Project member',
        profileImage: profileByUid.get(member.firebase_uid) || ''
    }]));
    if (requestedUids.includes(project.creator_firebase_uid)) {
        members.set(project.creator_firebase_uid, {
            firebaseUid: project.creator_firebase_uid,
            email: project.creator_email || '',
            name: project.creator_name || project.creator_email || 'Project member',
            profileImage: profileByUid.get(project.creator_firebase_uid) || ''
        });
    }
    return {
        project,
        members,
        creator: {
            firebaseUid: project.creator_firebase_uid,
            email: project.creator_email || '',
            name: project.creator_name || project.creator_email || 'Project member',
            profileImage: profileByUid.get(project.creator_firebase_uid) || ''
        }
    };
};

const uuidFromParts = (...parts) => {
    const bytes = createHash('sha1').update(JSON.stringify(parts)).digest().subarray(0, 16);
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const getConversations = async (req, res) => {
    try {
        const snapshots = await firestore().collection(conversationsCollection)
            .where('member_uids', 'array-contains', req.firebaseUid)
            .get();
        const candidates = snapshots.docs.map(snapshot => ({
            conversation_id: snapshot.id,
            ...snapshot.data()
        }));
        const directCandidates = candidates.filter(item =>
            item.conversation_type === 'direct' && !item.merged_into
        );
        const directProjectById = new Map((await Promise.all(directCandidates.map(async item => [
            item.conversation_id,
            await directMembersShareAccessibleProject(item.member_uids)
        ]))).filter(([, projectId]) => projectId));
        const directGroups = new Map();
        for (const item of directCandidates) {
            if (!directProjectById.has(item.conversation_id)) continue;
            const pairKey = JSON.stringify([...item.member_uids].sort());
            const group = directGroups.get(pairKey) || [];
            group.push(item);
            directGroups.set(pairKey, group);
        }
        for (const group of directGroups.values()) {
            if (group.length < 2) continue;
            const memberUids = [...group[0].member_uids].sort();
            const projectId = directProjectById.get(group[0].conversation_id);
            const projectMembers = await listProjectMembers(
                projectId, req.firebaseUid, memberUids
            );
            if (!projectMembers || memberUids.some(uid => !projectMembers.members.has(uid))) {
                throw new Error('Shared direct conversation members could not be resolved.');
            }
            const members = memberUids.map(uid => projectMembers.members.get(uid));
            await ensureDirectConversation({
                projectId,
                callerUid: req.firebaseUid,
                members,
                memberUids
            });
            return getConversations(req, res);
        }
        const directAccessibleIds = new Set(directProjectById.keys());
        const accessibleProjectIds = await getAccessibleProjectIds(
            [...new Set(candidates.map(item => item.project_id))],
            req.firebaseUid
        );
        const conversations = await Promise.all(candidates
            .filter(conversation => !conversation.merged_into &&
                (conversation.conversation_type === 'direct'
                    ? directAccessibleIds.has(conversation.conversation_id)
                    : accessibleProjectIds.has(conversation.project_id)))
            .map(async conversation => {
            const [membersSnapshot, memberState] = await Promise.all([
                conversationRef(conversation.conversation_id).collection('members').get(),
                memberRef(conversation.conversation_id, req.firebaseUid).get()
            ]);
            const members = membersSnapshot.docs.map(memberSnapshot => {
                const member = memberSnapshot.data();
                return {
                    ...member,
                    firebaseUid: member.firebaseUid || memberSnapshot.id,
                    name: member.display_name || member.name || member.email || 'Project member',
                    profileImage: member.profile_image || '',
                    lastSeenAt: null
                };
            });
            const presences = members.length
                ? await firestore().getAll(...members.map(member => firestore()
                    .collection('messagePresence').doc(member.firebaseUid)))
                : [];
            const presenceByUid = new Map(presences.filter(item => item.exists)
                .map(item => [item.id, item.data()]));
            for (const member of members) {
                member.lastSeenAt = timestamp(presenceByUid.get(member.firebaseUid)?.last_seen_at);
            }
            const lastReadAt = memberState.data()?.last_read_at;
            const unreadSnapshot = lastReadAt
                ? await messagesRef(conversation.conversation_id).where('created_at', '>', lastReadAt).get()
                : await messagesRef(conversation.conversation_id).get();
            let latestSnapshot = await messagesRef(conversation.conversation_id)
                .orderBy('created_at', 'desc').limit(50).get();
            let visibleLatest = latestSnapshot.docs.find(item =>
                !(item.data().hidden_for || []).includes(req.firebaseUid)
            );
            while (!visibleLatest && latestSnapshot.docs.length === 50) {
                latestSnapshot = await messagesRef(conversation.conversation_id)
                    .orderBy('created_at', 'desc')
                    .startAfter(latestSnapshot.docs[latestSnapshot.docs.length - 1])
                    .limit(50).get();
                visibleLatest = latestSnapshot.docs.find(item =>
                    !(item.data().hidden_for || []).includes(req.firebaseUid)
                );
            }
            const latestMessage = visibleLatest?.data();
            const latestAttachments = latestMessage?.attachments || [];
            const latestMessageBody = !latestMessage
                ? ''
                : latestMessage.deleted_at
                    ? 'This message was deleted'
                    : latestMessage.body || (
                        latestAttachments.some(attachment =>
                            attachment.is_voice_note || attachment.mediaType?.startsWith('audio/')
                        ) ? 'Voice message' : ''
                    );
            const unreadCount = unreadSnapshot.docs.filter(item => {
                const message = item.data();
                return message.sender_firebase_uid !== req.firebaseUid &&
                    !message.deleted_at &&
                    !(message.hidden_for || []).includes(req.firebaseUid);
            }).length;
            return {
                conversation_id: conversation.conversation_id,
                project_id: conversation.project_id,
                conversation_type: conversation.conversation_type,
                name: conversation.name || '',
                created_at: timestamp(conversation.created_at),
                updated_at: timestamp(conversation.updated_at),
                members,
                latest_message_id: visibleLatest?.id || null,
                latest_message_body: latestMessageBody,
                latest_sender_firebase_uid: visibleLatest?.data().sender_firebase_uid || null,
                latest_message_created_at: visibleLatest ? timestamp(visibleLatest.data().created_at) : null,
                unread_count: unreadCount
            };
            }));
        const hiddenConversationIds = await reconcileConversationAccess(
            req.firebaseUid, conversations
        );
        conversations.sort((a, b) =>
            asMillis(b.latest_message_created_at || b.created_at) -
            asMillis(a.latest_message_created_at || a.created_at));
        return res.json({
            success: true,
            data: {
                conversations: conversations.filter(item =>
                    !hiddenConversationIds.has(item.conversation_id)
                )
            }
        });
    } catch (error) {
        console.error('Get Firestore message conversations error:', error);
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
    const rawUids = req.body?.memberFirebaseUids;
    const memberUids = Array.isArray(rawUids)
        ? [...new Set(rawUids.filter(uid => typeof uid === 'string' && uid.trim()).map(uid => uid.trim()))]
        : [];
    if (!projectId || !['direct', 'group', 'channel'].includes(type) || name.length > 60 ||
        (type !== 'direct' && !name) || memberUids.length > 99 ||
        memberUids.length !== (rawUids || []).length ||
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
    try {
        const projectMembers = await listProjectMembers(
            projectId, req.firebaseUid, [...memberUids, req.firebaseUid]
        );
        if (!projectMembers) {
            return res.status(404).json({
                success: false,
                code: 'PROJECT_NOT_FOUND',
                message: 'Project not found.'
            });
        }
        if (memberUids.some(uid => !projectMembers.members.has(uid))) {
            return res.status(400).json({
                success: false,
                code: 'INVALID_CONVERSATION_MEMBERS',
                message: 'All conversation members must be accepted members of the selected project.'
            });
        }
        const caller = {
            firebaseUid: req.firebaseUid,
            email: req.firebaseEmail || '',
            name: req.firebaseUser?.name || req.firebaseUser?.displayName ||
                req.firebaseEmail || 'Project member',
            profileImage: projectMembers.members.get(req.firebaseUid)?.profileImage || ''
        };
        const members = [caller, ...memberUids.map(uid => projectMembers.members.get(uid))];
        const memberUidsForConversation = members.map(member => member.firebaseUid).sort();
        if (type === 'direct') {
            const result = await ensureDirectConversation({
                projectId,
                callerUid: req.firebaseUid,
                members,
                memberUids: memberUidsForConversation
            });
            return res.status(result.created ? 201 : 200).json({
                success: true,
                data: {
                    conversation: {
                        ...result.conversation,
                        members: members.map(member => ({
                            firebaseUid: member.firebaseUid,
                            email: (member.email || '').toLowerCase(),
                            name: member.name || member.email || 'Project member',
                            profileImage: member.profileImage || ''
                        }))
                    }
                }
            });
        }
        const conversationId = randomUUID();
        const sqlLastReadByUid = new Map();
        const ref = conversationRef(conversationId);
        let created = false;
        await firestore().runTransaction(async transaction => {
            const existing = await transaction.get(ref);
            if (existing.exists) return;
            created = true;
            const now = getFirebaseAdmin().firestore.Timestamp.now();
            transaction.create(ref, {
                project_id: projectId,
                conversation_type: type,
                name: type === 'direct' ? '' : name,
                created_by_firebase_uid: req.firebaseUid,
                member_uids: memberUidsForConversation,
                created_at: now,
                updated_at: now,
                latest_message_id: null,
                latest_message_body: '',
                latest_sender_firebase_uid: null,
                latest_message_created_at: null
            });
            for (const member of members) {
                transaction.set(memberRef(conversationId, member.firebaseUid), {
                    firebaseUid: member.firebaseUid,
                    email: (member.email || '').toLowerCase(),
                    display_name: member.name || member.email || 'Project member',
                    profile_image: member.profileImage || '',
                    joined_at: now
                }, { merge: true });
                transaction.set(
                    firestore().collection('users').doc(member.firebaseUid)
                        .collection('messageConversations').doc(conversationId),
                    {
                        conversation_id: conversationId,
                        project_id: projectId,
                        hidden_for_user: false
                    },
                    { merge: true }
                );
            }
        });
        const saved = await ref.get();
        if (!saved.exists) throw new Error('Firestore did not persist the conversation.');
        const repairBatch = firestore().batch();
        repairBatch.set(ref, {
            project_id: projectId,
            conversation_type: type,
            name: type === 'direct' ? '' : name,
            created_by_firebase_uid: req.firebaseUid,
            member_uids: memberUidsForConversation
        }, { merge: true });
        const existingMembers = await firestore().getAll(...members.map(member =>
            memberRef(conversationId, member.firebaseUid)
        ));
        for (const [index, member] of members.entries()) {
            const existingData = existingMembers[index].data() || {};
            const hasStoredReadTime = Object.prototype.hasOwnProperty.call(
                existingData, 'last_read_at'
            );
            const sqlLastReadAt = sqlLastReadByUid.get(member.firebaseUid);
            repairBatch.set(memberRef(conversationId, member.firebaseUid), {
                firebaseUid: member.firebaseUid,
                email: (member.email || '').toLowerCase(),
                display_name: member.name || member.email || 'Project member',
                profile_image: member.profileImage || '',
                joined_at: existingData.joined_at ||
                    getFirebaseAdmin().firestore.Timestamp.now(),
                last_read_at: hasStoredReadTime
                    ? existingData.last_read_at
                    : sqlLastReadAt
                        ? getFirebaseAdmin().firestore.Timestamp.fromDate(new Date(sqlLastReadAt))
                        : null
            }, { merge: true });
            repairBatch.set(
                firestore().collection('users').doc(member.firebaseUid)
                    .collection('messageConversations').doc(conversationId),
                {
                    conversation_id: conversationId,
                    project_id: projectId,
                    hidden_for_user: false
                },
                { merge: true }
            );
            repairBatch.set(
                firestore().collection('messagePresence').doc(member.firebaseUid),
                {
                    visible_to: getFirebaseAdmin().firestore.FieldValue.arrayUnion(
                        ...memberUidsForConversation
                    )
                },
                { merge: true }
            );
        }
        await repairBatch.commit();
        console.info('Created Firestore message conversation and access indexes.', {
            conversationId,
            type
        });
        const responseConversation = {
            conversation_id: conversationId,
            project_id: projectId,
            conversation_type: type,
            name: type === 'direct' ? '' : name
        };
        return res.status(created ? 201 : 200).json({
            success: true,
            data: { conversation: responseConversation }
        });
    } catch (error) {
        console.error('Create Firestore message conversation error:', error);
        return res.status(500).json({
            success: false,
            code: 'MESSAGE_CONVERSATION_CREATE_FAILED',
            message: 'The conversation could not be created.'
        });
    }
};

const deleteConversationForMe = async (req, res) => {
    try {
        const conversation = await getConversation(req.params.conversationId, req.firebaseUid);
        if (!conversation) {
            return res.status(404).json({
                success: false,
                code: 'CONVERSATION_NOT_FOUND',
                message: 'Conversation not found.'
            });
        }
        await firestore().collection('users').doc(req.firebaseUid)
            .collection('messageConversations').doc(conversation.conversation_id).set({
                conversation_id: conversation.conversation_id,
                project_id: conversation.project_id,
                hidden_for_user: true
            }, { merge: true });
        return res.json({ success: true });
    } catch (error) {
        console.error('Delete Firestore conversation for current user error:', error);
        return res.status(500).json({
            success: false,
            code: 'CONVERSATION_DELETE_FAILED',
            message: 'The conversation could not be removed from your chat list.'
        });
    }
};

const updateOwnPresence = async (req, res) => {
    const isOnline = req.body?.isOnline;
    if (typeof isOnline !== 'boolean') {
        return res.status(400).json({
            success: false,
            code: 'INVALID_PRESENCE_STATUS',
            message: 'Presence status must be online or offline.'
        });
    }
    try {
        await firestore().collection('messagePresence').doc(req.firebaseUid).set({
            is_online: isOnline,
            last_seen_at: getFirebaseAdmin().firestore.Timestamp.now(),
            visible_to: getFirebaseAdmin().firestore.FieldValue.arrayUnion(req.firebaseUid)
        }, { merge: true });
        return res.json({ success: true });
    } catch (error) {
        console.error('Update authenticated message presence error:', {
            firebaseUid: req.firebaseUid,
            isOnline,
            errorCode: error.code || null,
            errorMessage: error.message,
            stack: error.stack
        });
        return res.status(500).json({
            success: false,
            code: 'MESSAGE_PRESENCE_UPDATE_FAILED',
            message: 'Your presence could not be updated.'
        });
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
        const snapshot = await messagesRef(conversation.conversation_id).orderBy('created_at').get();
        const visibleDocs = snapshot.docs.filter(item =>
            !(item.data().hidden_for || []).includes(req.firebaseUid)
        );
        const replyIds = [...new Set(visibleDocs.map(item =>
            item.data().reply_to_message_id
        ).filter(Boolean))];
        const replySnapshots = [];
        for (let offset = 0; offset < replyIds.length; offset += 300) {
            const refs = replyIds.slice(offset, offset + 300).map(id =>
                messagesRef(conversation.conversation_id).doc(id)
            );
            replySnapshots.push(...await firestore().getAll(...refs));
        }
        const repliesById = new Map(replySnapshots.map(reply => [reply.id, reply]));
        const messages = visibleDocs.map(item => {
            const message = makeMessage(item, conversation.conversation_id);
            if (!message.reply_to_message_id) return message;
            const replySnapshot = repliesById.get(message.reply_to_message_id);
            if (!replySnapshot?.exists) {
                message.reply_to_body = null;
                message.reply_to_sender_name = null;
                return message;
            }
            const reply = replySnapshot.data();
            message.reply_to_body = (reply.hidden_for || []).includes(req.firebaseUid)
                ? 'Message unavailable'
                : reply.deleted_at ? 'This message was deleted' : reply.body;
            message.reply_to_sender_name = reply.sender_name || 'Project member';
            return message;
        });
        return res.json({ success: true, data: { messages } });
    } catch (error) {
        console.error('Get Firestore conversation messages error:', error);
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
    const clientMessageId = req.body?.clientMessageId ?? null;
    const messageId = clientMessageId ? randomUUID() : req.body?.messageId || randomUUID();
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
        attachmentBytes > maxAttachmentBytes || (!body && attachments.length === 0) ||
        !uuidPattern.test(messageId) ||
        (clientMessageId !== null && !uuidPattern.test(clientMessageId)) ||
        (replyToId !== null && !uuidPattern.test(replyToId)) ||
        (forwardedFrom !== null && (
            typeof forwardedFrom !== 'object' || Array.isArray(forwardedFrom) ||
            typeof forwardedFrom.senderName !== 'string' || forwardedFrom.senderName.length > 160
        ))) {
        return res.status(400).json({
            success: false,
            code: 'INVALID_MESSAGE',
            message: 'Provide a message or valid attachments within the 512 KB total attachment limit.'
        });
    }
    try {
        const conversation = await getConversation(req.params.conversationId, req.firebaseUid);
        if (!conversation) {
            return res.status(404).json({
                success: false,
                code: 'CONVERSATION_NOT_FOUND',
                message: 'Conversation not found.'
            });
        }
        const sender = await getSenderAndReplyData(conversation, req.firebaseUid, replyToId);
        if (!sender) {
            return res.status(400).json({
                success: false,
                code: 'INVALID_REPLY',
                message: 'The message being replied to does not exist in this conversation.'
            });
        }
        const now = getFirebaseAdmin().firestore.Timestamp.now();
        const safeAttachments = attachments.map(({ fileName, mediaType, size, data }) => ({
            fileName, mediaType, size, data
        }));
        const data = {
            sender_firebase_uid: req.firebaseUid,
            sender_email: sender.sender_email,
            sender_name: sender.sender_name,
            body,
            reply_to_message_id: replyToId,
            reply_to_body: sender.reply_to_body || null,
            reply_to_sender_name: sender.reply_to_sender_name || null,
            attachments: safeAttachments,
            forwarded_from: forwardedFrom ? { senderName: forwardedFrom.senderName } : null,
            is_pinned: false,
            edited_at: null,
            created_at: now,
            deleted_at: null,
            hidden_for: [],
            reaction_entries: [],
            read_receipts: [],
            visible_to: conversation.member_uids,
            client_message_id: clientMessageId
        };
        await firestore().runTransaction(async transaction => {
            const messageRef = messagesRef(conversation.conversation_id).doc(messageId);
            const existing = await transaction.get(messageRef);
            if (existing.exists) throw new Error('Generated message ID already exists.');
            transaction.create(messageRef, data);
            transaction.update(conversationRef(conversation.conversation_id), {
                latest_message_id: messageId,
                latest_message_body: body,
                latest_sender_firebase_uid: req.firebaseUid,
                latest_message_created_at: now,
                updated_at: now
            });
        });
        const message = makeMessage(
            { id: messageId, data: () => data },
            conversation.conversation_id
        );
        res.status(201).json({ success: true, data: { messageId, message } });
        return;
    } catch (error) {
        console.error('Create Firestore message error:', error);
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
                success: false, code: 'MESSAGE_NOT_FOUND', message: 'Message not found.'
            });
        }
        const conversation = await getConversation(conversationId, req.firebaseUid);
        if (!conversation) {
            return res.status(404).json({
                success: false, code: 'CONVERSATION_NOT_FOUND', message: 'Conversation not found.'
            });
        }
        const ref = messagesRef(conversationId).doc(messageId);
        let failure = null;
        let messageDeleted = false;
        await firestore().runTransaction(async transaction => {
            const snapshot = await transaction.get(ref);
            if (!snapshot.exists) {
                failure = { status: 404, code: 'MESSAGE_NOT_FOUND', message: 'Message not found.' };
                return;
            }
            const message = snapshot.data();
            if (message.deleted_at) {
                failure = { status: 400, code: 'MESSAGE_ALREADY_DELETED', message: 'A deleted message cannot be changed.' };
                return;
            }
            const now = getFirebaseAdmin().firestore.Timestamp.now();
            if (action === 'edit') {
                const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
                if (!body || body.length > 5000) {
                    failure = { status: 400, code: 'INVALID_MESSAGE', message: 'Message text must be between 1 and 5000 characters.' };
                } else {
                    transaction.update(ref, { body, edited_at: now });
                    transaction.update(conversationRef(conversationId), {
                        latest_message_body: body,
                        updated_at: now
                    });
                }
            } else if (action === 'delete') {
                transaction.delete(ref);
                messageDeleted = true;
            } else if (action === 'pin') {
                transaction.update(ref, { is_pinned: !message.is_pinned });
            } else if (action === 'reaction') {
                const emoji = req.body?.emoji;
                if (!allowedReactions.has(emoji)) {
                    failure = { status: 400, code: 'INVALID_REACTION', message: 'Choose a supported reaction.' };
                } else {
                    const entries = message.reaction_entries || [];
                    const hadReaction = entries.some(entry =>
                        entry.firebaseUid === req.firebaseUid && entry.emoji === emoji
                    );
                    const memberSnapshot = await transaction.get(memberRef(conversationId, req.firebaseUid));
                    const email = memberSnapshot.data()?.email || '';
                    const next = entries.filter(entry => entry.firebaseUid !== req.firebaseUid);
                    if (!hadReaction) next.push({ firebaseUid: req.firebaseUid, email, emoji });
                    transaction.update(ref, { reaction_entries: next });
                }
            } else {
                failure = { status: 404, code: 'UNKNOWN_MESSAGE_ACTION', message: 'Unsupported message action.' };
            }
        });
        if (failure) {
            return res.status(failure.status).json({
                success: false, code: failure.code, message: failure.message
            });
        }
        if (messageDeleted) {
            const replies = await messagesRef(conversationId)
                .where('reply_to_message_id', '==', messageId).get();
            for (let offset = 0; offset < replies.docs.length; offset += 450) {
                const batch = firestore().batch();
                replies.docs.slice(offset, offset + 450).forEach(reply => {
                    batch.update(reply.ref, {
                        reply_to_message_id: null,
                        reply_to_body: null,
                        reply_to_sender_name: null
                    });
                });
                await batch.commit();
            }
        }
        return res.json({ success: true });
    } catch (error) {
        console.error(`Firestore message ${action} error:`, {
            conversationId,
            messageId,
            firebaseUid: req.firebaseUid,
            action,
            errorName: error.name,
            errorCode: error.code || null,
            errorMessage: error.message,
            stack: error.stack
        });
        return res.status(500).json({
            success: false,
            code: 'MESSAGE_UPDATE_FAILED',
            message: 'The message could not be updated.'
        });
    }
};

const deleteMessage = async (req, res) => {
    const { conversationId, messageId } = req.params;
    const scope = req.body?.scope;
    if (!['me', 'everyone'].includes(scope)) {
        return res.status(400).json({
            success: false, code: 'INVALID_DELETE_SCOPE',
            message: 'Choose whether to delete the message for you or for everyone.'
        });
    }
    if (!uuidPattern.test(messageId || '')) {
        return res.status(404).json({
            success: false, code: 'MESSAGE_NOT_FOUND', message: 'Message not found.'
        });
    }
    try {
        const conversation = await getConversation(conversationId, req.firebaseUid);
        if (!conversation) {
            return res.status(404).json({
                success: false, code: 'CONVERSATION_NOT_FOUND', message: 'Conversation not found.'
            });
        }
        const ref = messagesRef(conversationId).doc(messageId);
        let failure = null;
        await firestore().runTransaction(async transaction => {
            const snapshot = await transaction.get(ref);
            if (!snapshot.exists) {
                failure = { status: 404, code: 'MESSAGE_NOT_FOUND', message: 'Message not found.' };
                return;
            }
            const message = snapshot.data();
            if (scope === 'everyone') {
                if (!message.deleted_at) {
                    transaction.update(ref, {
                        body: 'Message deleted',
                        attachments: [],
                        forwarded_from: null,
                        deleted_at: getFirebaseAdmin().firestore.Timestamp.now(),
                        reaction_entries: [],
                        read_receipts: []
                    });
                }
            } else {
                transaction.update(ref, {
                    hidden_for: getFirebaseAdmin().firestore.FieldValue.arrayUnion(req.firebaseUid),
                    visible_to: getFirebaseAdmin().firestore.FieldValue.arrayRemove(req.firebaseUid)
                });
            }
        });
        if (failure) {
            return res.status(failure.status).json({
                success: false, code: failure.code, message: failure.message
            });
        }
        return res.json({ success: true, data: { scope } });
    } catch (error) {
        console.error('Delete Firestore message error:', {
            conversationId,
            messageId,
            firebaseUid: req.firebaseUid,
            scope,
            errorName: error.name,
            errorCode: error.code || null,
            errorMessage: error.message,
            stack: error.stack
        });
        return res.status(500).json({
            success: false, code: 'MESSAGE_DELETE_FAILED', message: 'The message could not be deleted.'
        });
    }
};

const clearConversationMessages = async (req, res) => {
    try {
        const conversation = await getConversation(req.params.conversationId, req.firebaseUid);
        if (!conversation) {
            return res.status(404).json({
                success: false, code: 'CONVERSATION_NOT_FOUND', message: 'Conversation not found.'
            });
        }
        const snapshot = await messagesRef(conversation.conversation_id).get();
        const visible = snapshot.docs.filter(item =>
            !(item.data().hidden_for || []).includes(req.firebaseUid)
        );
        for (let offset = 0; offset < visible.length; offset += 450) {
            const batch = firestore().batch();
            visible.slice(offset, offset + 450).forEach(item => {
                batch.update(item.ref, {
                    hidden_for: getFirebaseAdmin().firestore.FieldValue.arrayUnion(req.firebaseUid),
                    visible_to: getFirebaseAdmin().firestore.FieldValue.arrayRemove(req.firebaseUid)
                });
            });
            await batch.commit();
        }
        return res.json({ success: true, data: { clearedCount: visible.length } });
    } catch (error) {
        console.error('Clear Firestore conversation messages error:', error);
        return res.status(500).json({
            success: false, code: 'MESSAGE_CLEAR_FAILED', message: 'Messages could not be cleared.'
        });
    }
};

const markConversationRead = async (req, res) => {
    try {
        const conversation = await getConversation(req.params.conversationId, req.firebaseUid);
        if (!conversation) {
            return res.status(404).json({
                success: false, code: 'CONVERSATION_NOT_FOUND', message: 'Conversation not found.'
            });
        }
        const now = getFirebaseAdmin().firestore.Timestamp.now();
        const snapshot = await messagesRef(conversation.conversation_id).get();
        const unread = snapshot.docs.filter(item => {
            const message = item.data();
            return message.sender_firebase_uid !== req.firebaseUid &&
                !message.deleted_at &&
                !(message.hidden_for || []).includes(req.firebaseUid) &&
                !(message.read_receipts || []).some(receipt => receipt.firebaseUid === req.firebaseUid);
        });
        for (let offset = 0; offset < unread.length; offset += 450) {
            const batch = firestore().batch();
            unread.slice(offset, offset + 450).forEach(item => {
                const receipts = item.data().read_receipts || [];
                receipts.push({ firebaseUid: req.firebaseUid, readAt: now });
                batch.update(item.ref, { read_receipts: receipts });
            });
            await batch.commit();
        }
        await memberRef(conversation.conversation_id, req.firebaseUid).update({ last_read_at: now });
        return res.json({ success: true });
    } catch (error) {
        console.error('Mark Firestore conversation read error:', error);
        return res.status(500).json({
            success: false, code: 'MESSAGE_READ_UPDATE_FAILED',
            message: 'Read status could not be updated.'
        });
    }
};

module.exports = {
    getConversation,
    getConversations,
    createConversation,
    deleteConversationForMe,
    updateOwnPresence,
    getMessages,
    createMessage,
    mutateMessage,
    deleteMessage,
    clearConversationMessages,
    markConversationRead
};
