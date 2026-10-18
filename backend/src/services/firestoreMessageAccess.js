const { getFirebaseAdmin } = require('../config/firebaseAdmin');

const syncProjectConversationAccess = async (projectId, firebaseUid, isActive) => {
    const firestore = getFirebaseAdmin().firestore();
    const conversations = await firestore.collection('messageConversations')
        .where('project_id', '==', projectId).get();
    const matching = conversations.docs.filter(snapshot =>
        (snapshot.data().member_uids || []).includes(firebaseUid)
    );
    const participants = new Set([firebaseUid]);
    matching.forEach(conversation => {
        (conversation.data().member_uids || []).forEach(uid => participants.add(uid));
    });
    for (let offset = 0; offset < matching.length; offset += 400) {
        const batch = firestore.batch();
        matching.slice(offset, offset + 400).forEach(conversation => {
            const accessRef = firestore.collection('users').doc(firebaseUid)
                .collection('messageConversations').doc(conversation.id);
            if (isActive) {
                batch.set(accessRef, {
                    conversation_id: conversation.id,
                    project_id: projectId,
                    hidden_for_user: false
                });
            } else {
                batch.delete(accessRef);
            }
        });
        await batch.commit();
    }

    const accessSnapshot = await firestore.collection('users').doc(firebaseUid)
        .collection('messageConversations').get();
    const remainingIds = accessSnapshot.docs.map(snapshot => snapshot.id);
    const remainingConversations = [];
    for (let offset = 0; offset < remainingIds.length; offset += 300) {
        const refs = remainingIds.slice(offset, offset + 300)
            .map(conversationId => firestore.collection('messageConversations').doc(conversationId));
        remainingConversations.push(...await firestore.getAll(...refs));
    }
    const visiblePeers = new Set();
    remainingConversations.forEach(snapshot => {
        const memberUids = snapshot.exists ? snapshot.data().member_uids : [];
        if (memberUids?.includes(firebaseUid)) {
            memberUids.forEach(uid => {
                if (uid !== firebaseUid) visiblePeers.add(uid);
            });
        }
    });
    const touchedPeers = new Set(participants);
    visiblePeers.forEach(uid => touchedPeers.add(uid));
    const participantUids = [...touchedPeers];
    const presenceSnapshots = [];
    for (let offset = 0; offset < participantUids.length; offset += 300) {
        presenceSnapshots.push(...await firestore.getAll(
            ...participantUids.slice(offset, offset + 300).map(uid =>
                firestore.collection('messagePresence').doc(uid))
        ));
    }
    const presenceByUid = new Map(presenceSnapshots.map(snapshot => [snapshot.id, snapshot]));
    for (let offset = 0; offset < participantUids.length; offset += 400) {
        const batch = firestore.batch();
        participantUids.slice(offset, offset + 400).forEach(participantUid => {
            const presenceRef = firestore.collection('messagePresence').doc(participantUid);
            const snapshot = presenceByUid.get(participantUid);
            const visibleTo = new Set(Array.isArray(snapshot.data()?.visible_to)
                ? snapshot.data().visible_to
                : []);
            if (participantUid === firebaseUid) {
                visibleTo.clear();
                visibleTo.add(firebaseUid);
                visiblePeers.forEach(uid => visibleTo.add(uid));
                batch.set(presenceRef, { visible_to: [...visibleTo] }, { merge: true });
                return;
            }
            if (visiblePeers.has(participantUid)) visibleTo.add(firebaseUid);
            else visibleTo.delete(firebaseUid);
            batch.set(presenceRef, { visible_to: [...visibleTo] }, { merge: true });
        });
        await batch.commit();
    }
};

const deleteProjectMessageData = async projectId => {
    const firestore = getFirebaseAdmin().firestore();
    const conversations = await firestore.collection('messageConversations')
        .where('project_id', '==', projectId).get();
    const conversationIds = conversations.docs.map(snapshot => snapshot.id);
    const accessRefs = [];
    conversations.docs.forEach(snapshot => {
        for (const uid of snapshot.data().member_uids || []) {
            accessRefs.push(firestore.collection('users').doc(uid)
                .collection('messageConversations').doc(snapshot.id));
        }
    });
    for (let offset = 0; offset < accessRefs.length; offset += 400) {
        const batch = firestore.batch();
        accessRefs.slice(offset, offset + 400).forEach(ref => batch.delete(ref));
        await batch.commit();
    }

    for (const conversationId of conversationIds) {
        const conversationRef = firestore.collection('messageConversations').doc(conversationId);
        const [members, messages] = await Promise.all([
            conversationRef.collection('members').get(),
            conversationRef.collection('messages').get()
        ]);
        const refs = [
            ...members.docs.map(snapshot => snapshot.ref),
            ...messages.docs.map(snapshot => snapshot.ref),
            conversationRef
        ];
        for (let offset = 0; offset < refs.length; offset += 400) {
            const batch = firestore.batch();
            refs.slice(offset, offset + 400).forEach(ref => batch.delete(ref));
            await batch.commit();
        }
    }
};

module.exports = { syncProjectConversationAccess, deleteProjectMessageData };
