const express = require('express');
const {
    getConversations,
    createConversation,
    deleteConversationForMe,
    getMessages,
    createMessage,
    mutateMessage,
    deleteMessage,
    clearConversationMessages,
    markConversationRead
} = require('../controllers/messageController');
const { requireFirebaseAuth } = require('../middleware/requireFirebaseAuth');

const router = express.Router();
router.use(requireFirebaseAuth);

router.get('/conversations', getConversations);
router.post('/conversations', createConversation);
router.delete('/conversations/:conversationId', deleteConversationForMe);
router.get('/conversations/:conversationId/messages', getMessages);
router.post('/conversations/:conversationId/messages', createMessage);
router.delete('/conversations/:conversationId/messages/:messageId', deleteMessage);
router.delete('/conversations/:conversationId/messages', clearConversationMessages);
router.post('/conversations/:conversationId/read', markConversationRead);
router.patch('/conversations/:conversationId/messages/:messageId/:action', mutateMessage);

module.exports = router;
