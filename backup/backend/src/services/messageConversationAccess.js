const { query } = require('../config/db');
const {
    emitToUser,
    reconcileUserConversationAccess
} = require('../realtime/messageSocket');

const syncProjectConversationAccess = async (projectId, firebaseUid, isActive) => {
    const result = await query(
        `SELECT conversation_id::text AS conversation_id
         FROM message_conversation_members
         WHERE firebase_uid = $1`,
        [firebaseUid]
    );
    await reconcileUserConversationAccess(
        firebaseUid,
        result.rows.map(row => row.conversation_id)
    );
    emitToUser(firebaseUid, 'conversations:refresh', {
        project_id: projectId,
        active: isActive
    });
};

module.exports = { syncProjectConversationAccess };
