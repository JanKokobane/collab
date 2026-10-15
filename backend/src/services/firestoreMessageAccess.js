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
                    project_id: projectId
                });
            } else {
                batch.delete(accessRef);
            }
        });
        await batch.commit();
    }

    const participantUids = [...participants];
    if (participantUids.length < 2) return;
    for (let offset = 0; offset < participantUids.length; offset += 400) {
        const batch = firestore.batch();
        participantUids.slice(offset, offset + 400).forEach(participantUid => {
            const presenceRef = firestore.collection('messagePresence').doc(participantUid);
            if (participantUid === firebaseUid) {
                const peers = participantUids.filter(uid => uid !== firebaseUid);
                if (!peers.length) return;
                batch.set(presenceRef, {
                    visible_to: isActive
                        ? getFirebaseAdmin().firestore.FieldValue.arrayUnion(...peers)
                        : getFirebaseAdmin().firestore.FieldValue.arrayRemove(...peers)
                }, { merge: true });
                return;
            }
            batch.set(presenceRef, {
                visible_to: isActive
                    ? getFirebaseAdmin().firestore.FieldValue.arrayUnion(firebaseUid)
                    : getFirebaseAdmin().firestore.FieldValue.arrayRemove(firebaseUid)
            }, { merge: true });
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
